import { useEffect, useRef, useState } from 'react'
import type { PetConfig } from '../run-types'
import { makeT } from '../i18n'
import { readPrefs, type Lang } from '../ui-prefs'
import { secs } from './studio-types'
import { alertTitle } from './alert-text'
import { DynamicIsland, RUN_TICKS, type IslandState } from './DynamicIsland'
import { Watcher, WATCHER_SHAPE, WATCHER_EYES, softAim } from './Watcher'

/**
 * 桌宠 —— 应用一启动就在桌面上的小家伙（main 进程 `?pet=1` 建的，96×132
 * 透明置顶小窗口）。借 bencho「Eye tracker」的玩法：两只眼睛跟着桌面光标转。
 *
 * 形象（方块/圆球）和眼睛样式（斜眼/点/方块）在设置页里换。
 * 点一下打开助手窗口，按住能拖到桌面任何地方。
 * 状态用表情：忙 → 眯眼，引擎没起 → 没精神，等你点头 → 睁大眼。
 *
 * ⚠️ 有事的时候它**整个变成**标题栏那颗灵动岛（同一个 `DynamicIsland`），
 * 不是在旁边再长一条新的 —— 岛就是它有事时的样子，不是另一个功能。
 * 而且**内容也得一样**：任务名、「停掉」、跑了几格都不能少。
 * 只画个 `● 正在运行` 的缩小版不是「复用」，那是另做了个长得像的东西。
 * 所以 main 会把窗放宽到 320×36 装下整颗岛（见 `petLayout`）。
 * 也就没有气泡了：气泡和岛说的是一件事，留两个就是这个信息说两遍。
 */

type Mood = 'idle' | 'busy' | 'sleepy' | 'expect'

/** 有事时那座岛要的全部入参 —— 直接就是 `DynamicIsland` 的 props */
type IslandArgs = {
  state: IslandState
  label: string
  meta?: string
  ticks?: { total: number; done: number; current: number }
  action?: { label: string; onClick: () => void }
}


const SLOP = 5
/** 完事了停多久。失败比成功留久一点 —— 成功的不用你管，失败的要你看见 */
const DONE_MS = 5000
const ERR_MS = 9000

export function PetWidget(): JSX.Element {
  const [cfg, setCfg] = useState<PetConfig>({
    shape: 'cube',
    eyes: 'slant',
    size: 80,
    enabled: false
  })
  const [mood, setMood] = useState<Mood>('idle')
  const [aim, setAim] = useState<{ x: number; y: number } | null>(null)
  /** 正在跑的任务名 —— 由 2 秒一次的 `pet.query()` 推着，跑完自动落到 `notify` */
  const [runningTask, setRunningTask] = useState<string | null>(null)
  /** 刚跑完 / 刚来的告警。有它的时候整只桌宠变成胶囊，到点自己收 */
  const [notify, setNotify] = useState<IslandArgs | null>(null)
  const drag = useRef<{ sx: number; sy: number; wx: number; wy: number; moved: boolean } | null>(null)
  /* ⚠️ 窗自己的位置，缓存住：pointerdown 要**同步**拿到它才能把 pointerup 及时挂上
     （见下面 drag 那段的长注释）。拖动中每次都回写，换尺寸时主进程也会告诉新的。 */
  const posRef = useRef<{ x: number; y: number } | null>(null)
  /* 拖动节流用的三个小本子（见下面 drag 那段）：
     wanted = 指针最新想要的位置； lastSent = 最后真发出去的位置；
     lastAt = 上一次真发的时间戳（门控只用它，不用 rAF/定时器）。 */
  const wanted = useRef<{ x: number; y: number } | null>(null)
  const lastSent = useRef<{ x: number; y: number } | null>(null)
  const lastAt = useRef(0)

  /* 桌宠窗是**独立 document**，没有 I18nProvider —— 自己读偏好、自己跟着变。
     `makeT` 是 i18n 单独导出的那个（App 根在 Provider 外也用它）。 */
  const [lang, setLang] = useState<Lang>(() => readPrefs().lang)
  useEffect(() => {
    const on = (e: StorageEvent): void => {
      if (e.key === 'workbench.ui' || e.key === null) setLang(readPrefs().lang)
    }
    window.addEventListener('storage', on)
    return () => window.removeEventListener('storage', on)
  }, [])
  const t = makeT(lang)

  /* 小窗口要透出桌面 */
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])

  /* 位置缓存：开机读一次。之后由拖动和换尺寸两处维护。 */
  useEffect(() => {
    let alive = true
    void window.workbench?.pet
      ?.position()
      .then((p) => {
        if (alive) posRef.current = p
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  /* 形象配置：读一次 + 设置页改了实时收到。
     ⚠️ 退订不能忘 —— 不退的话每次重挂都多一个 ipcRenderer 监听器。 */
  useEffect(() => {
    let alive = true
    void window.workbench?.pet?.getConfig().then((c) => {
      if (alive) setCfg(c)
    })
    const id = window.workbench?.pet?.onConfig((c) => setCfg(c))
    return () => {
      alive = false
      if (id !== undefined) window.workbench?.pet?.offConfig(id)
    }
  }, [])

  /* 眼睛跟光标：每 80ms 问一次屏幕光标，算成归一化(-1..1)的朝向喂给 Watcher。
     中心随 size 变 —— 桌宠在窗口底部。 */
  useEffect(() => {
    let alive = true
    const s = cfg.size
    const tick = async (): Promise<void> => {
      /* 拖动中不问光标：那会儿每 80ms 多两次 IPC 往返，白和拖动抢 */
      if (drag.current) return
      try {
        const c = await window.workbench.pet.cursor()
        const p = await window.workbench.pet.position()
        /* ⚠️ 中心用 window.innerWidth/Height 算，**不写死 50 / 140** ——
           长开变岛的时候窗尺寸是会变的（见 petLayout）。 */
        const cx = p.x + window.innerWidth / 2
        const cy = p.y + window.innerHeight - s / 2
        /* ⚠️ 参考半径**不能是宠物自己的半径**（s/2 约 34px）：
           光标几乎永远在 34px 以外 → 眼睛永远顶在极限上，看着就是「定死了」。
           用一个「注意力半径」再配 softAim 的软饱和：近处轻、远处重，
           但永远不会僵在一个姿势上。 */
        if (alive) setAim(softAim((c.x - cx) / 280, (c.y - cy) / 280))
      } catch {
        /* 主进程没起来就不动 */
      }
    }
    void tick()
    const id = setInterval(() => void tick(), 80)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [cfg.size])

  /* 状态 → 表情（每 2 秒） */
  useEffect(() => {
    let alive = true
    const query = async (): Promise<void> => {
      try {
        const s = await window.workbench.pet.query()
        if (!alive) return
        setRunningTask(s.running ? s.runningTask : null)
        const m: Mood = !s.alive ? 'sleepy' : s.busy ? 'busy' : s.buildWait ? 'expect' : 'idle'
        setMood(m)
      } catch {
        /* 同上 */
      }
    }
    void query()
    const id = setInterval(() => void query(), 2000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  /* 通知：任务跑完 / 新警 → 整只变成胶囊。
     退出事件一来就把 runningTask 置回 null —— 光靠 2 秒一次的轮询，
     跑完之后胶囊会先在「正在运行」上多挂一会儿才切到结果。
     文案和 App.tsx 里标题栏那颗**逐字一致**：任务名 · 耗时 · 退出码。 */
  useEffect(() => {
    const wb = window.workbench
    if (!wb) return
    let timer: number | undefined
    const show = (args: IslandArgs, ms: number): void => {
      setNotify(args)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setNotify(null), ms)
    }
    const runId = wb.run.onEvent((e) => {
      if (e.type !== 'exit') return
      setRunningTask(null)
      const meta =
        e.ms === undefined
          ? e.taskName
          : `${e.taskName} · ${secs(e.ms)} · ${t('island.exit', { n: e.code ?? 0 })}`
      show(
        { state: e.ok ? 'done' : 'error', label: t(e.ok ? 'island.done' : 'island.failed'), meta },
        e.ok ? DONE_MS : ERR_MS
      )
    })
    const alertId = wb.alerts.onEvent((e) => {
      if (e.type === 'new') {
        show({ state: 'error', label: t('island.alert'), meta: alertTitle(e.alert, t) }, ERR_MS)
      }
    })
    return () => {
      window.clearTimeout(timer)
      wb.run.offEvent(runId)
      wb.alerts.offEvent(alertId)
    }
  }, [lang])

  /* 拖动和点击二选一。
   *
   * ⚠️⚠️ 这一段有两个真 bug，別改回去：
   *
   * 1）**`pointerdown` 里不能 `await`**。原来是 `await position()` 之后才挂
   *    `pointerup` 监听 —— 快点一下（IPC 还没回来就松手），那个 `pointerup` 就
   *    永远收不到：`drag.current` 不会清空，**松手之后它还在跟着鼠标跑**。
   *    所以位置得缓存在 `posRef` 里，整个 pointerdown 同步跑完。
   *
   * 2）**不能每个 pointermove 都挪一次窗**。高刷鼠标一秒几百个事件，
   *    那就是一秒几百次 IPC + setPosition，窗口在两三个位置之间跳 —— 看着就是「闪」。
   *    现在用时间戳门控（`performance.now()`，不受后台节流影响），一秒最多 60 下，
   *    多出来的丢。为什么不用 rAF/定时器节流：那两样在后台页里压根不跑，
   *    用它们会让拖动**整个卡死**。松手时会把最后那格补发出去，不留误差。
   */
  const onPointerDown = (e: React.PointerEvent): void => {
    /* 点在「停掉」上：那是岛自己的按钮，不该顺手把助手窗也打开 */
    if ((e.target as HTMLElement).closest('.island-act')) return
    const p = posRef.current
    /* 还没读到位置（开机头几十毫秒）：这一下不认，比从一个错位置起跳强 */
    if (!p) return
    drag.current = { sx: e.screenX, sy: e.screenY, wx: p.x, wy: p.y, moved: false }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  /** 真发一次挪窗 */
  const send = (p: { x: number; y: number }): void => {
    lastSent.current = p
    lastAt.current = performance.now()
    posRef.current = p
    window.workbench.pet.move(p.x, p.y)
  }

  const onMove = (e: PointerEvent): void => {
    const d = drag.current
    if (!d) return
    const dx = e.screenX - d.sx
    const dy = e.screenY - d.sy
    if (!d.moved && Math.hypot(dx, dy) > SLOP) d.moved = true
    if (!d.moved) return
    const nx = Math.round(d.wx + dx)
    const ny = Math.round(d.wy + dy)
    wanted.current = { x: nx, y: ny }
    /* 一次拖动能有几百个事件，但窗一秒挪 60 下就够。
       多出来的**直接丢** —— 不排队、不等 rAF、不等定时器。
       ⚠️ 为什么不用 rAF/定时器节流：这套东西在**后台页里根本不跑**
       （实测 `document.hidden` 时 rAF 两秒 0 帧、`setTimeout(32)` 被拖成一秒多），
       靠它们节流的话，窗一旦被当成后台拖动会**整个卡死**，比闪还难查。
       门控只用 `performance.now()`，它不受节流影响，永远在走。 */
    if (performance.now() - lastAt.current < 16) return
    if (lastSent.current?.x === nx && lastSent.current?.y === ny) return
    send(wanted.current)
  }

  const onUp = (): void => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    const d = drag.current
    drag.current = null
    /* 收尾：停到指针真正松开的地方，不留最后一格误差 */
    const w = wanted.current
    wanted.current = null
    if (d?.moved && w && (lastSent.current?.x !== w.x || lastSent.current?.y !== w.y)) send(w)
    if (d && !d.moved) window.workbench.pet.open()
    /* 松手后和主进程对一下账：拖动中被屏幕边界夹过，本地记的坐标就不是真坐标了，
       不对账的话下一次拖动会从错基准起算。 */
    if (d?.moved) {
      void window.workbench.pet
        .position()
        .then((p) => {
          posRef.current = p
        })
        .catch(() => undefined)
    }
  }

  /* 表情 → 眼睛参数：忙眯眼、没精神半闭、等你点头睁大 */
  const eyeHeight = mood === 'busy' ? 0.45 : mood === 'sleepy' ? 0.16 : 1
  const eyeScale = mood === 'expect' ? 1.18 : 1

  /* 正在跑 > 刚出的结果 > 没事。
     正在跑优先：一个长任务跑完前又来了告警，轴心上还是「在跑」这件事最要紧。 */
  const island: IslandArgs | null = runningTask
    ? {
        state: 'run',
        label: t('island.running'),
        meta: runningTask,
        ticks: RUN_TICKS,
        action: {
          label: t('island.stop'),
          onClick: () => void window.workbench.run.stop().catch(() => undefined)
        }
      }
    : notify

  /* 窗尺寸跟着变：小家伙 100×140，岛 320×36（主进程按底边中点对齐）。
     两种尺寸都得够装内容 —— 岛上有任务名和一个按钮，不是缩水版。 */
  const islandOn = island !== null
  useEffect(() => {
    void window.workbench?.pet
      ?.layout(islandOn)
      .then((p) => {
        /* 换尺寸会改左上角坐标 —— 不把缓存更新掉，下一次拖动会从旧坐标起算、一上手就跳 */
        if (p) posRef.current = p
      })
      .catch(() => undefined)
  }, [islandOn])

  /* 有事：整只换成胶囊。拖动/点击那套指针逻辑照用 —— 点空白处还是开助手窗。 */
  if (island) {
    return (
      <div className="pet-holder" data-mode="island" onPointerDown={onPointerDown}>
        <DynamicIsland
          state={island.state}
          label={island.label}
          meta={island.meta}
          ticks={island.ticks}
          action={island.action}
        />
      </div>
    )
  }

  return (
    <div className="pet-holder" onPointerDown={onPointerDown}>
      <div className="pet-body" style={{ width: cfg.size, height: cfg.size }}>
        <Watcher
          size={cfg.size}
          shape={WATCHER_SHAPE[cfg.shape]}
          eyes={WATCHER_EYES[cfg.eyes]}
          external
          aim={aim}
          eyeHeight={eyeHeight}
          eyeScale={eyeScale}
        />
      </div>
    </div>
  )
}
