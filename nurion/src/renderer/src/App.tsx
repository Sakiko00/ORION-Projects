import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { TitleBar } from './components/TitleBar'
import { TiltCard } from './components/TiltCard'
import { LiquidToggle } from './components/LiquidToggle'
import { SlideToConfirm } from './components/SlideToConfirm'
import { TimeScrubber, type ScrubMark } from './components/TimeScrubber'
import { HeatMap, HeatLegend, type HeatLevel } from './components/HeatMap'
import { RadialMenu, type RadialItem } from './components/RadialMenu'
import { Toasts, toast } from './components/Toasts'
import { Icon } from './components/Icon'
import { Settings } from './components/Settings'
import { TaskStudio } from './components/TaskStudio'
import { KnowledgeBase } from './components/KnowledgeBase'
import { ArtifactList } from './components/Artifact'
import { RUN_TICKS } from './components/DynamicIsland'
import { scheduleText } from './components/studio-types'
import { alertTitle } from './components/alert-text'
import { askFloatingAgent, openFloatingAgent } from './agent-bus'
import { AgentChatProvider } from './agent-chat'
import { I18nProvider, makeT } from './i18n'
import { applyPrefs, readPrefs, writePrefs, type UiPrefs } from './ui-prefs'
import type { NavItem } from './components/NavDock'
import type { RunEvent, RunningInfo, LiveRun, VaultAlert, AlertEvent } from './run-types'

/**
 * 主界面 —— Bento 三栏 + 一屏不滚（DESIGN 1.2 / 1.3）
 *
 *   ┌─────────────────────────┬────────┐
 *   │ ① 今日流水线（横跨两列）   │ ④ 任务   │
 *   ├─────────────┬───────────┤  （贯通） │
 *   │ ② 采集健康    │ ③ 机器人    │        │
 *   └─────────────┴───────────┴────────┘
 */

interface Task {
  id: string
  name: string
  agent: string
  schedule: string
  enabled: boolean
  lastRun?: string
  status?: 'ok' | 'alert' | 'idle'
  /** 要跑的命令行。留空 = 还没接线 */
  cmd?: string
  cwd?: string
}

interface AgentInfo {
  id: string
  name: string
  status: 'online' | 'offline'
  taskCount: number
}

interface Run {
  id: string
  taskId: string
  taskName: string
  at: string
  ok: boolean
  ms: number
  code: number
  /** 这一次跑动了 output/ 下哪些文件 */
  artifacts?: string[]
  /** 谁让它跑的 */
  trigger?: 'manual' | 'agent' | 'schedule'
}

interface EngineState {
  state?: string
  message?: string
  installed?: boolean
  version?: string | null
  /** 引擎来自随包还是系统 Python（`eng.bundled` / `eng.system`） */
  source?: 'bundled' | 'system' | null
}

/** 一次实时运行：从 run:event 里长出来 */

/** label 存的是 i18n key —— 文案在 `i18n.tsx`，切语言不用动这里 */
const NAV: NavItem[] = [
  { id: 'overview', label: 'nav.overview', icon: 'overview' },
  { id: 'tasks', label: 'nav.tasks', icon: 'tasks' },
  { id: 'kb', label: 'nav.kb', icon: 'book' },
  { id: 'settings', label: 'nav.settings', icon: 'settings' },
  { id: 'agent', label: 'nav.agent', icon: 'bolt' }
]

/** 一次运行的四步 —— 每一步都是真发生的，不是装饰 */
const STEPS: { nameKey: string; note?: string; noteKey?: string }[] = [
  { nameKey: 'step.trigger', note: 'run_task' },
  { nameKey: 'step.exec', noteKey: 'step.exec.note' },
  { nameKey: 'step.save', noteKey: 'step.save.note' },
  { nameKey: 'step.cast', noteKey: 'step.cast.note' }
]

const ENGINE_LABEL: Record<string, string> = {
  stopped: 'set.engine.stopped',
  starting: 'set.engine.starting',
  running: 'set.engine.running',
  error: 'set.engine.error'
}

function localDay(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hourOf(iso: string): number {
  const d = new Date(iso)
  return d.getHours() + d.getMinutes() / 60
}

function hhmm(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`
}

function secs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

/** 输出行里都是代码/日志，别让它把界面撑破 */
function clip(line: string, n = 200): string {
  return line.length > n ? `${line.slice(0, n)}…` : line
}

export default function App() {
  /* 界面偏好（主题 / 字号 / 语言）—— 存 localStorage。读是**同步**的，
     所以第一帧主题就是对的，不会先闪一下默认色再变 */
  const [prefs, setPrefs] = useState<UiPrefs>(() => readPrefs())
  const [active, setActive] = useState('overview')

  const [tasks, setTasks] = useState<Task[]>([])
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [engine, setEngine] = useState<EngineState | null>(null)

  const [live, setLive] = useState<LiveRun | null>(null)
  const [pastLog, setPastLog] = useState<string[]>([])
  /** 运行卡里看的是输出还是产物（一块地方两种用途，不额外占高度） */
  const [runTab, setRunTab] = useState<'log' | 'art'>('log')
  const [alerts, setAlerts] = useState<VaultAlert[]>([])
  const [intake, setIntake] = useState('')

  /* AI 总开关。真值存在库里的 `ai.json`（main 开机要读它决定启不启引擎），
     这里只是拿一份镜像来管界面上那几个入口。 */
  const [ai, setAi] = useState(true)
  const applyAi = async (on: boolean): Promise<void> => {
    const r = (await window.workbench.ai.set(on)) as { enabled: boolean }
    setAi(r.enabled)
  }
  useEffect(() => {
    void (async () => {
      try {
        setAi(((await window.workbench.ai.get()) as { enabled: boolean }).enabled)
      } catch {
        /* 读不到就当开着 —— 不能因为一个开关把助手弄没了 */
      }
    })()
  }, [])

  const [seek, setSeek] = useState(() => {
    const now = new Date()
    return now.getHours() + now.getMinutes() / 60
  })
  const [menu, setMenu] = useState<{ x: number; y: number; task: Task } | null>(null)
  const [confirmDel, setConfirmDel] = useState<Task | null>(null)

  const press = useRef<number | null>(null)
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    applyPrefs(prefs)
  }, [prefs])

  /* 「跟随系统」时，系统主题变了要跟着变 —— 不能让用户重启才生效 */
  useEffect(() => {
    if (prefs.theme !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const f = (): void => applyPrefs(prefs)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [prefs])

  const t = useMemo(() => makeT(prefs.lang), [prefs.lang])
  const nav = useMemo(() => NAV.map((n) => ({ ...n, label: t(n.label) })), [t])

  const setPref = <K extends keyof UiPrefs>(k: K, v: UiPrefs[K]): void => {
    const next = { ...prefs, [k]: v }
    writePrefs(next) // 存盘 + 立刻生效
    setPrefs(next)
  }

  const load = useCallback(async (): Promise<void> => {
    const wb = window.workbench
    if (!wb) return // 浏览器里没有 preload —— 静默降级，别白屏
    const [ts, as, rs, st, al] = await Promise.allSettled([
      wb.agent.call('list_tasks', {}),
      wb.agent.call('list_agents', {}),
      wb.agent.call('list_runs', {}),
      wb.engine.status(),
      wb.alerts.list(50)
    ])
    if (ts.status === 'fulfilled') setTasks(ts.value as Task[])
    if (as.status === 'fulfilled') setAgents(as.value as AgentInfo[])
    if (rs.status === 'fulfilled') setRuns(rs.value as Run[])
    if (st.status === 'fulfilled') setEngine(st.value as EngineState)
    if (al.status === 'fulfilled') setAlerts(al.value)
  }, [])

  useEffect(() => {
    void load()
    void window.workbench?.alerts.intake().then(setIntake).catch(() => undefined)
  }, [load])

  /* ⚠️ 引擎状态必须**自己会收敛**。
     `load()` 只在挂载时跑一次，而它跑的那一刻引擎基本还在起（闪屏等的就是它），
     于是岛上一直挂着「启动中」，哪怕引擎早就好了。
     所以：**没落定的时候才轮**，落定（running / error）立刻停 —— 不是无脑轮询。 */
  useEffect(() => {
    if (!ai) return undefined
    const s = engine?.state
    if (s === 'running' || s === 'error') return undefined
    let n = 0
    const id = window.setInterval(() => {
      if (++n > 24) {
        window.clearInterval(id) // 36 秒还没起来就别再问了
        return
      }
      void window.workbench?.engine
        .status()
        .then((v) => setEngine(v as EngineState))
        .catch(() => undefined)
    }, 1500)
    return () => window.clearInterval(id)
  }, [ai, engine?.state])

  /* ---------- 警事件 ---------- */

  useEffect(() => {
    const wb = window.workbench
    if (!wb) return
    const id = wb.alerts.onEvent((e: AlertEvent) => {
      if (e.type === 'new') {
        setAlerts((prev) => [e.alert, ...prev.filter((a) => a.id !== e.alert.id)].slice(0, 50))
        if (!e.deduped) {
          toast(
            t('toast.alert', { title: alertTitle(e.alert, t), source: e.alert.source }),
            e.alert.level === 'error' ? 'bad' : 'info'
          )
        }
      } else {
        setAlerts((prev) => prev.map((a) => (a.id === e.alert.id ? e.alert : a)))
      }
    })
    return () => wb.alerts.offEvent(id)
  }, [])

  /* ---------- 运行事件：这是「真在执行」的全部来源 ---------- */

  useEffect(() => {
    const wb = window.workbench
    if (!wb) return

    const id = wb.run.onEvent((e: RunEvent) => {
      setLive((prev) => {
        if (e.type === 'start') {
          return { runId: e.runId, taskId: e.taskId, taskName: e.taskName, cmd: e.cmd || '', lines: [] }
        }
        if (!prev || prev.runId !== e.runId) return prev
        if (e.type === 'out') {
          const add = (e.chunk || '').split(/\r?\n/).filter((l) => l.trim())
          return { ...prev, lines: [...prev.lines, ...add].slice(-150) }
        }
        return {
          ...prev,
          done: {
            code: e.code ?? -1,
            ok: !!e.ok,
            ms: e.ms ?? 0,
            artifacts: e.artifacts,
            trigger: e.trigger
          }
        }
      })

      if (e.type === 'exit') {
        // 有产物就直接翻到「产物」那页 —— 用户最想看的是东西，不是日志
        if (e.artifacts?.length) setRunTab('art')
        toast(
          e.ok
            ? t('toast.run.done', { name: e.taskName, ms: secs(e.ms || 0) })
            : t('toast.run.fail', { name: e.taskName, code: e.code ?? -1 }),
          e.ok ? 'ok' : 'bad'
        )
        void load()
        // 留一会儿让人看清退出信息，再回到「空闲」
        window.setTimeout(() => setLive((p) => (p && p.done ? null : p)), 8000)
      }
    })

    // 应用重启时可能还在跑 —— 问一次，把状态接回来
    void wb.run
      .running()
      .then((r: RunningInfo | null) => {
        if (r) setLive({ runId: r.runId, taskId: r.taskId, taskName: r.taskName, cmd: r.cmd, lines: r.tail })
      })
      .catch(() => undefined)

    return () => wb.run.offEvent(id)
  }, [load])

  /** 空闲时看「上一次跑成什么样」——日志是落盘的，重启也还在 */
  useEffect(() => {
    if (live) return
    const last = runs[runs.length - 1]
    if (!last) {
      setPastLog([])
      return
    }
    window.workbench?.run
      ?.log(last.id, 120)
      .then(setPastLog)
      .catch(() => setPastLog([]))
  }, [live, runs])

  /* ---------- 派生 ---------- */

  const todayKey = localDay(new Date().toISOString())
  const todayRuns = useMemo(() => runs.filter((r) => localDay(r.at) === todayKey), [runs, todayKey])
  const todayOk = todayRuns.filter((r) => r.ok).length

  const marks: ScrubMark[] = useMemo(
    () =>
      todayRuns.map((r) => ({
        h: hourOf(r.at),
        ok: r.ok,
        text: `${r.taskName} · ${t(r.ok ? 'ov.good' : 'ov.bad')} · ${secs(r.ms)}`
      })),
    [todayRuns]
  )

  const days = useMemo(() => {
    const out: { key: string; label: string; full: string }[] = []
    // 窗口宽度决定能画多少天：卡片宽 480，21 列每格 ~15px（方块）；
    // 再贪多（比如 30 天）格子就比缝还窄，那就不叫密度图了。三周也正好看三个周期。
    for (let i = 20; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      // 轴上只留「日」：格子才 15px 宽，写 MM-DD 一定被裁掉半个字
      out.push({ key, label: key.slice(8), full: key })
    }
    return out
  }, [])

  const heatRows = useMemo(
    () =>
      tasks.slice(0, 5).map((t) => ({
        name: t.name,
        cells: days.map((d): HeatLevel => {
          const hit = runs.filter((r) => r.taskId === t.id && localDay(r.at) === d.key)
          if (!hit.length) return 0
          if (hit.every((r) => r.ok)) return 4
          if (hit.every((r) => !r.ok)) return 'x'
          return 2
        })
      })),
    [tasks, runs, days]
  )

  const health = useMemo(() => {
    const all = heatRows.flatMap((r) => r.cells)
    const ran = all.filter((c) => c !== 0).length
    const okDays = all.filter((c) => c === 4).length
    return {
      rate: ran ? Math.round((okDays / ran) * 100) : 0,
      fails: all.filter((c) => c === 'x').length
    }
  }, [heatRows])

  /* ---------- 动作 ---------- */

  const ackAlert = async (a: VaultAlert): Promise<void> => {
    try {
      await window.workbench.alerts.ack(a.id)
      toast(t('toast.ack.ok', { title: alertTitle(a, t) }), 'ok')
    } catch (e) {
      toast(t('toast.ack.bad', { err: String((e as Error)?.message || e) }), 'bad')
    }
  }

  const askAiToHandle = (a: VaultAlert): void => {
    // 对话只住在悬浮窗里了 —— 这里只能把话递过去，并把它弹出来
    askFloatingAgent(
      `收到一条警告，先用 list_alerts 看它，再自己判断怎么处理（需要的话看任务、跑一次、读日志）：\n\n` +
        `【${a.level}】${a.title}\n来源：${a.source}\n${a.text || '（没有正文）'}`
    )
  }

  const runById = async (taskId: string): Promise<void> => {
    if (live && !live.done) {
      toast(t('toast.busy', { name: live.taskName }), 'bad')
      return
    }
    setSeek(new Date().getHours() + new Date().getMinutes() / 60)
    try {
      await window.workbench.run.start(taskId)
    } catch (e) {
      toast(t('toast.start.bad', { err: String((e as Error)?.message || e) }), 'bad')
    }
  }

  const runTask = (t: Task): void => void runById(t.id)

  const stopRun = async (): Promise<void> => {
    try {
      await window.workbench.run.stop()
      toast(t('toast.stop.ok'), 'info')
    } catch (e) {
      toast(t('toast.stop.bad', { err: String((e as Error)?.message || e) }), 'bad')
    }
  }

  const toggleTask = async (task: Task): Promise<void> => {
    setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, enabled: !x.enabled } : x)))
    try {
      await window.workbench.agent.call('update_task', { id: task.id, enabled: !task.enabled })
      toast(
        t('toast.toggle.ok', {
          name: task.name,
          state: t(task.enabled ? 'act.disabled' : 'act.enabled')
        }),
        'ok'
      )
    } catch (e) {
      toast(t('toast.toggle.bad', { err: String((e as Error)?.message || e) }), 'bad')
      void load()
    }
  }

  const removeTask = async (task: Task): Promise<void> => {
    setConfirmDel(null)
    try {
      await window.workbench.agent.call('delete_task', { id: task.id, allowDelete: true })
      toast(t('toast.del.ok', { name: task.name }), 'ok')
      await load()
    } catch (e) {
      toast(t('toast.del.bad', { err: String((e as Error)?.message || e) }), 'bad')
    }
  }


  /* ---------- 长按 / 右键 → 径向菜单 ---------- */

  const startPress = (e: RPointerEvent, task: Task): void => {
    const { clientX: x, clientY: y } = e
    if (press.current) window.clearTimeout(press.current)
    press.current = window.setTimeout(() => {
      press.current = null
      setMenu({ x, y, task })
    }, 420)
  }
  const endPress = (): void => {
    if (press.current) {
      window.clearTimeout(press.current)
      press.current = null
    }
  }

  const menuItems = (task: Task): RadialItem[] => [
    { key: 'run', label: t('act.run'), icon: 'play' },
    { key: 'toggle', label: t(task.enabled ? 'act.disable' : 'act.enable'), icon: 'bolt' },
    { key: 'del', label: t('act.delete'), icon: 'trash', danger: true }
  ]

  /* ---------- 动态岛 ---------- */

  const online = agents.filter((a) => a.status === 'online').length
  const unacked = alerts.filter((a) => !a.ack).length
  const engineLabel = t(ENGINE_LABEL[engine?.state || ''] || 'eng.unprobed')
  const busy = !!live && !live.done

  /* 岛的优先级：**正在跑 > 有告警没处理 > 引擎状态**。
     为什么告警要进岛、而不是只弹个 toast：toast 几秒就没了，错过就是错过；
     岛是「不处理就一直在」。异常最怕的不是没人管，是**没人看见**。 */
  const newest = alerts.find((a) => !a.ack)

  const island = live
    ? live.done
      ? {
          state: (live.done.ok ? 'done' : 'error') as 'done' | 'error',
          label: t(live.done.ok ? 'island.done' : 'island.failed'),
          meta: `${live.taskName} · ${secs(live.done.ms)} · ${t('island.exit', { n: live.done.code })}`
        }
      : {
          state: 'run' as const,
          label: t('island.running'),
          meta: live.taskName,
          ticks: RUN_TICKS,
          action: { label: t('island.stop'), onClick: () => void stopRun() }
        }
    : newest
      ? {
          state: 'alert' as const,
          label: t('island.alert'),
          meta: unacked > 1 ? `${alertTitle(newest, t)} · +${unacked - 1}` : alertTitle(newest, t),
          action: { label: t('island.alert.see'), onClick: () => setActive('overview') }
        }
      : {
          state: (engine?.state === 'error' ? 'error' : 'idle') as 'error' | 'idle',
          /* ⚠️ 这里以前写的是 `t('ai.off')` —— 那是**开关的词条**（就一个「关」字），
             摆到岛上成了「关 / ai.off.meta」（后一个键压根没定义，原样吐出来了）。
             状态该用状态自己的句子。 */
          label: ai ? engineLabel : t('ai.closed'),
          meta: ai
            ? engine?.installed
              ? `nanobot ${engine.version || ''}${
                  engine.source === 'bundled'
                    ? ` · ${t('eng.bundled')}`
                    : engine.source === 'system'
                      ? ` · ${t('eng.system')}`
                      : ''
                }`
              : t('island.noengine')
            : t('ai.off.meta'),
          action: { label: t('eng.settings'), onClick: () => setActive('settings') }
        }

  const stepState = (i: number): string => {
    if (!live) return 'idle'
    if (live.done) return 'done'
    if (i === 0) return 'done'
    if (i === 1) return 'run'
    return 'idle'
  }

  const shownLines = live ? live.lines : pastLog
  const lastRun = runs[runs.length - 1]

  /**
   * 当前该显示的产物：正在跑/刚跑完看这一次的，空闲看上一次的。
   * 不用现算 output/ 目录 —— 「这些文件是哪次跑出来的」是历史事实，
   * 现算会被后来任何一次运行覆盖掉。
   */
  const shownArtifacts = live ? live.done?.artifacts || [] : lastRun?.artifacts || []

  /** 「谁让它跑的」——手动点 / 定时 / 它的 AI 替你跑的，三件事不该混成一句 */
  const TRIGGER_LABEL: Record<string, string> = {
    manual: 'trig.manual',
    schedule: 'trig.schedule',
    agent: 'trig.agent'
  }

  // 新输出来了就跟着滚 —— 但只在本来就贴着底的时侯，
  // 否则用户往回翻历史会被不停拽回底部
  useEffect(() => {
    const el = logRef.current
    if (!el) return
    if (el.scrollHeight - el.clientHeight - el.scrollTop < 60) el.scrollTop = el.scrollHeight
  }, [shownLines])

  const body = (
    <div className="app">
      <TitleBar
        nav={nav}
        active={active}
        onNav={(id) => {
          // 助手不是一页 —— 点它是打开独立的桌面窗口，不切页面
          if (id === 'agent') {
            /* AI 关着就不开局 —— 而且要给个回话。默默不响应比报错更坏：
               用户会以为按钮坏了，而不是以为功能关着。顺手把他领到开关那儿。 */
            if (!ai) {
              toast(t('ai.ask'), 'bad')
              setActive('settings')
              return
            }
            openFloatingAgent()
            return
          }
          setActive(id)
        }}
        island={island}
        onRefresh={() => {
          void load()
          toast(t('toast.refreshed'), 'ok')
        }}
      />

      <main className="main">
        {active === 'settings' ? (
          <Settings
            ai={ai}
            onAi={(on) => void applyAi(on)}
            theme={prefs.theme}
            onTheme={(v) => setPref('theme', v)}
            font={prefs.font}
            onFont={(v) => setPref('font', v)}
            lang={prefs.lang}
            onLang={(v) => setPref('lang', v)}
          />
        ) : active === 'tasks' ? (
          <AgentChatProvider
            notify={toast}
            onTasksChanged={load}
            tasks={tasks}
            running={busy || !!live}
          >
            <TaskStudio
              tasks={tasks}
              live={live}
              logLines={pastLog}
              reload={load}
              runs={runs}
              onRun={(id) => void runById(id)}
              onStop={() => void stopRun()}
              artifactsFor={(id) => [...runs].reverse().find((r) => r.taskId === id)?.artifacts || []}
              notify={toast}
            />
          </AgentChatProvider>
        ) : active === 'kb' ? (
          <KnowledgeBase notify={toast} />
        ) : (
          <div className="bento">
            {/* ── ① 今日流水线 ──────────────────────────────────── */}
            <TiltCard className="card b-now reveal" style={{ ['--i' as string]: 0 }}>
              <div
                className="beam"
                data-live={busy ? 'true' : 'false'}
                style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none' }}
              />

              <div className="now-head">
                <div style={{ minWidth: 0 }}>
                  <h2 className="now-title">
                    {t('ov.pipeline')}
                    {busy && (
                      <span className="badge ok" style={{ marginLeft: 10 }}>
                        {t('ov.running')}
                      </span>
                    )}
                  </h2>
                  <p className="now-sub">
                    {todayRuns.length === 0
                      ? t('ov.noruns')
                      : t('ov.today', {
                          n: todayRuns.length,
                          ok: todayOk,
                          bad: todayRuns.length - todayOk
                        })}
                  </p>
                </div>
                <span className="badge" title={t('ov.robots.hint')}>
                  {t('ov.robots', { n: online, m: agents.length })}
                </span>
              </div>

              <div className="steps">
                {STEPS.map((s, i) => {
                  const st = stepState(i)
                  return (
                    <div key={s.nameKey} className="step" data-state={st}>
                      <div className="step-top">
                        <span className="step-name">{t(s.nameKey)}</span>
                        <span className="step-dot" />
                      </div>
                      <span className="step-meta">{s.noteKey ? t(s.noteKey) : s.note}</span>
                    </div>
                  )
                })}
              </div>

              <div className="scrub-block">
                <TimeScrubber value={seek} marks={marks} onSeek={setSeek} />
                <div className="scrub-axis">
                  <span>00:00</span>
                  <span>06:00</span>
                  <span>12:00</span>
                  <span>18:00</span>
                  <span>24:00</span>
                </div>
              </div>

              {/* 输出 / 产物 —— 同一块地方两种用途，不额外占高度（一屏不滚） */}
              <div className="run-log">
                <div className="run-log-head">
                  <span className="tabs">
                    <button
                      className={`tab${runTab === 'log' ? ' on' : ''}`}
                      onClick={() => setRunTab('log')}
                    >
                      {t('ov.output')}
                    </button>
                    <button
                      className={`tab${runTab === 'art' ? ' on' : ''}`}
                      onClick={() => setRunTab('art')}
                    >
                      {t('ov.artifacts', { n: shownArtifacts.length || '' })}
                    </button>
                  </span>
                  <span className="run-log-cmd" title={live?.cmd || lastRun?.taskId}>
                    {live
                      ? live.cmd
                      : lastRun
                        ? t('ov.lastrun', {
                            trigger: lastRun.trigger ? `${t(TRIGGER_LABEL[lastRun.trigger])} · ` : '',
                            name: lastRun.taskName,
                            time: new Date(lastRun.at).toLocaleString('zh-CN', { hour12: false }).slice(5),
                            ok: t(lastRun.ok ? 'ov.ok' : 'ov.bad')
                          }) + ` · ${secs(lastRun.ms)}`
                        : t('ov.never')}
                  </span>
                </div>
                {runTab === 'log' ? (
                  <pre className={`run-log-body scroll${busy ? ' is-live' : ''}`} ref={logRef}>
                    {shownLines.length
                      ? shownLines.slice(-60).map((l) => clip(l)).join('\n')
                      : busy
                        ? t('ov.waiting')
                        : t('ov.output.hint')}
                  </pre>
                ) : (
                  <div className="run-art-body">
                    <ArtifactList names={shownArtifacts} notify={toast} />
                  </div>
                )}
              </div>

              <div className="now-foot">
                <div data-agent="run-task">
                  <SlideToConfirm
                    label={busy ? t('ov.running.task', { name: live?.taskName || '' }) : t('ov.runonce')}
                    hint={busy ? '' : t('ov.drag')}
                    disabled={busy || !tasks.length}
                    onConfirm={() => {
                      const first = tasks.find((t) => t.enabled && t.cmd) || tasks[0]
                      if (first) void runTask(first)
                    }}
                  />
                </div>
              </div>
            </TiltCard>

            {/* ── ② 采集健康 ────────────────────────────────────── */}
            <TiltCard className="card b-heat reveal" style={{ ['--i' as string]: 1 }}>
              <div className="card-head">
                <div>
                  <h3>{t('ov.health')}</h3>
                  <p className="card-sub">{t('ov.health.sub')}</p>
                </div>
              </div>
              {heatRows.length ? (
                <>
                  <HeatMap days={days.map((d) => d.full)} rows={heatRows} />
                  <div className="heat-foot">
                    <HeatLegend />
                    <span className="heat-stat">
                      {t('ov.health.rate', { rate: health.rate, n: health.fails })}
                    </span>
                  </div>
                </>
              ) : (
                <p className="placeholder">{t('ov.empty.tasks')}</p>
              )}
            </TiltCard>

            {/* ── ③ 警告中心 ─────────────────────────────────── */}
            <TiltCard className="card b-alerts reveal" style={{ ['--i' as string]: 2 }}>
              <div className="card-head">
                <div>
                  <h3>{t('ov.alerts')}</h3>
                  <p className="card-sub">{t('ov.alerts.sub')}</p>
                </div>
                <span className={`badge ${unacked ? 'alert' : ''}`}>
                  {unacked ? t('ov.alerts.pending', { n: unacked }) : t('ov.alerts.acked')}
                </span>
              </div>

              <div className="scroll" style={{ minHeight: 0, flex: '1 1 auto' }}>
                {alerts.map((a) => (
                  <div key={a.id} className="alert-row" data-ack={a.ack}>
                    <span className={`dot ${a.level}`} />
                    <div className="bot-main">
                      <div className="bot-name" title={a.text}>
                        {alertTitle(a, t)}
                      </div>
                      <div className="bot-meta">
                        {a.source || t('alerts.unknown')} ·{' '}
                        {new Date(a.at).toLocaleTimeString('zh-CN', { hour12: false }).slice(0, 5)}
                        {a.ack && ` · ${t('ov.alerts.ack')}`}
                      </div>
                    </div>
                    {!a.ack && (
                      <span style={{ display: 'flex', gap: 5 }}>
                        <button
                          className="mini-run"
                          title={t('ov.alerts.askai')}
                          onClick={() => askAiToHandle(a)}
                        >
                          <Icon name="bolt" size={12} /> AI
                        </button>
                        <button
                          className="mini-run"
                          title={t('ov.alerts.done')}
                          onClick={() => void ackAlert(a)}
                        >
                          <Icon name="check" size={12} />
                        </button>
                      </span>
                    )}
                  </div>
                ))}
                {!alerts.length && <p className="placeholder">{t('ov.alerts.empty')}</p>}
              </div>

              <div className="hint alert-intake">
                <span className="eyebrow">{t('ov.alerts.intake')}</span>
                <code title='POST {"title":"…","text":"…","source":"…","level":"warn"}'>
                  {intake || t('ov.alerts.intake.off')}
                </code>
              </div>
            </TiltCard>

            {/* ── ④ 任务 ───────────────────────────────────────── */}
            <TiltCard className="card b-tasks reveal" style={{ ['--i' as string]: 3 }}>
              <div className="card-head">
                <div>
                  <h3>{t('ov.tasks')}</h3>
                  <p className="card-sub">{t('ov.tasks.sub')}</p>
                </div>
              </div>

              <div className="task-list scroll" data-agent="task-list">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="task"
                    data-off={!task.enabled}
                    data-agent={`task-${task.id}`}
                    onPointerDown={(e) => startPress(e, task)}
                    onPointerUp={endPress}
                    onPointerLeave={endPress}
                    onPointerMove={endPress}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      endPress()
                      setMenu({ x: e.clientX, y: e.clientY, task })
                    }}
                  >
                    <div className="task-line">
                      <span className="task-name">{task.name}</span>
                      <LiquidToggle
                        on={task.enabled}
                        onChange={() => void toggleTask(task)}
                        label={`${task.name} ${t('ov.tasks.toggle')}`}
                      />
                    </div>
                    <div className="task-sub">
                      <span className="chip">{task.agent || t('ov.tasks.noagent')}</span>
                      <span>{scheduleText(task.schedule, t)}</span>
                    </div>
                    {task.cmd ? (
                      <code className="task-cmd" title={`${task.cwd || ''}\n$ ${task.cmd}`}>
                        {task.cmd}
                      </code>
                    ) : (
                      <span className="chip warn" title={t('ov.tasks.nowire.hint')}>
                        {t('ov.tasks.nowire')}
                      </span>
                    )}
                    <div className="task-line">
                      <span className="task-when">
                        {t('ov.tasks.last', { t: task.lastRun || t('ov.tasks.never') })}
                      </span>
                      <button
                        className="mini-run"
                        title={task.cmd ? t('ov.tasks.run.hint') : t('ov.tasks.run.nocmd')}
                        disabled={busy || !task.cmd}
                        onClick={(e) => {
                          e.stopPropagation()
                          void runTask(task)
                        }}
                      >
                        <Icon name="play" size={13} /> {t('ov.tasks.run')}
                      </button>
                    </div>
                  </div>
                ))}
                {!tasks.length && <p className="placeholder">{t('ov.tasks.empty')}</p>}
              </div>

              {confirmDel && (
                <div className="toast" style={{ maxWidth: 'none', justifyContent: 'space-between' }}>
                  <span>{t('ov.del.confirm', { name: confirmDel.name })}</span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button className="action-btn" onClick={() => setConfirmDel(null)}>
                      {t('ov.cancel')}
                    </button>
                    <button
                      className="action-btn primary"
                      style={{ background: 'var(--destructive)', color: 'var(--destructive-foreground)' }}
                      onClick={() => void removeTask(confirmDel)}
                    >
                      {t('ov.del.ok')}
                    </button>
                  </span>
                </div>
              )}
            </TiltCard>
          </div>
        )}
      </main>

      {menu && (
        <RadialMenu
          x={menu.x}
          y={menu.y}
          title={menu.task.name}
          items={menuItems(menu.task)}
          onPick={(key) => {
            const t = menu.task
            if (key === 'run') void runTask(t)
            if (key === 'toggle') void toggleTask(t)
            if (key === 'del') setConfirmDel(t)
          }}
          onClose={() => setMenu(null)}
        />
      )}

      <Toasts />
    </div>
  )

  /* 包一层语言 Context：导航和设置页里的文案都在里面取。
     写成 body 再包，是为了不动上面那一大段 JSX 的缩进。 */
  return <I18nProvider lang={prefs.lang}>{body}</I18nProvider>
}
