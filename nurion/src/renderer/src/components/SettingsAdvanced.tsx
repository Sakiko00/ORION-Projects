import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { LiquidToggle } from './LiquidToggle'
import { STATE_LABEL_KEY, STATE_TONE, type EngineState } from './settings-types'

/* 工作室与三个对外入口 —— 应用里仅有的外链，地址写死在这儿，
   不经过任何用户输入（main 那边也只放行 https）。 */
const STUDIO = 'ORION AI Studio'
const SITE_URL = 'https://gzvtc-orion-ai.coze.site'
const FEISHU_URL = 'https://gitxtyrzx801.feishu.cn/wiki/space/7686096082199235863'
const REPO_URL = 'https://github.com/Sakiko00/ORION-Projects'

const open = (u: string): void => {
  void window.workbench.app.openUrl(u)
}

/** 推送状态直接从桥的签名上取 —— 手写第二份类型迟早会和主进程那份对不上。 */
type PushState = Awaited<ReturnType<typeof window.workbench.push.state>>

/** 运行时长只写到分钟，半分钟刷一次够了 —— 每秒 setState 是白烧渲染 */
function fmtUptime(ms: number): string {
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h}h ${rest}m` : `${h}h`
}

/**
 * 「生命体征」波形：一个心跳周期宽 120px、基线 y=12，拼 6 个 → 720px。
 * 容器 `overflow:hidden` + 无限左移一个周期，看上去就是一条不停往前跑的曲线。
 * 为什么要它：文字说「运行中」是**断言**，波形在动是**证据** —— 一眼就分得出
 * 「真活着」和「接口超时了但我还写着运行中」。
 */
const BEAT: Array<[number, number]> = [
  [0, 12],
  [22, 12],
  [30, 12],
  [36, 3],
  [43, 21],
  [50, 12],
  [72, 12],
  [88, 12],
  [94, 3],
  [101, 21],
  [108, 12],
  [120, 12]
]
const BEAT_W = 120
const VITAL_W = BEAT_W * 6
const VITAL_POINTS = Array.from({ length: 6 }, (_, i) =>
  BEAT.map(([x, y]) => `${x + i * BEAT_W},${y}`).join(' ')
).join(' ')

function Vital({ on, tone, flat }: { on: boolean; tone?: 'py'; flat?: boolean }) {
  return (
    <div className={`set-vital${tone ? ` ${tone}` : ''}${on ? ' on' : ''}`} aria-hidden>
      <svg width={VITAL_W} height={24} viewBox={`0 0 ${VITAL_W} 24`}>
        {/* AI 关着就画一条**平线**，不是把心跳暂停。
            监护仪上「波浪变成直线」谁都看得懂：它不跳了，不是跳得慢。
            暂停的心跳会让人以为「在跑，只是没动」。 */}
        <polyline
          className="set-vital-line"
          points={flat ? `0,12 ${VITAL_W},12` : VITAL_POINTS}
        />
      </svg>
    </div>
  )
}

/**
 * ③ 高级 —— **默认收起来**。
 *
 * 里面每一样都不是「用起来需要的」：
 *   引擎启停 → 应用起来会自动拉起它，没人需要手动点
 *   日志     → 排障才看
 *   目录     → 给会改配置文件的人开的
 * 把它们摊在第一屏，就是拿开发者的需求占用户的地方。
 *
 * ⚠️ 更细的引擎设置（联网搜索源 / 超时 / 记忆 / 转发渠道…）**不往这里搬** ——
 * 工作台只写它自己要的那几个键（库根 / 工具白名单 / 搜索源）。
 * 所以这里给的是「打开引擎配置目录」这个出口，而不是再堆一屏选项。
 */
export function SettingsAdvanced({
  ai,
  onAi,
  status,
  logs,
  busy,
  act,
  onRefresh
}: {
  /** AI 总开关（真值在主进程的 ai.json 里） */
  ai: boolean
  onAi: (on: boolean) => void
  status: EngineState | null
  logs: string
  busy: string
  act: (fn: () => Promise<unknown>, label: string) => void
  onRefresh: () => void
}) {
  const t = useT()
  const running = status?.state === 'running'
  /* AI 关着时下面这一块整体换一种读法：状态说「已关闭」、波形是平线、
     读数（跑了多久 / 哪个口）不显示 —— 没跑的东西没有时长。 */
  const on = ai && running
  // Python 是引擎脚下的那层 —— 它没了，上面什么都跑不起来，所以单独给一条线
  const hasPy = !!status?.python
  // 运行时长：只在我们知道起点时才算（外部已有进程不编号）
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const uptime = running && status?.since ? fmtUptime(now - status.since) : null

  /* ── 推送 ──
     绑过的会话是**引擎那边**写出来的（`/trigger` 一发的产物），所以这一块只有
     读回来的份；「刷新」按钮是必需的 —— 用户刚在手机里发完 /trigger，
     回到这里得有个动作能把它捞出来。 */
  const [pushState, setPush] = useState<PushState | null>(null)
  const [pushBusy, setPushBusy] = useState('')
  const [pushMsg, setPushMsg] = useState('')

  const loadPush = async (): Promise<void> => {
    try {
      setPush((await window.workbench.push.state()) as PushState)
    } catch {
      setPush({ triggerId: '', triggers: [] })
    }
  }
  useEffect(() => {
    void loadPush()
  }, [])

  const bindPush = async (id: string): Promise<void> => {
    setPushBusy('bind')
    try {
      setPush((await window.workbench.push.set(id)) as PushState)
      setPushMsg('')
    } catch (e) {
      setPushMsg((e as Error).message)
    } finally {
      setPushBusy('')
    }
  }

  const testPush = async (): Promise<void> => {
    setPushBusy('test')
    try {
      const r = await window.workbench.push.test()
      setPushMsg(r.ok ? t('push.sent') : t('push.failed', { err: r.error || '' }))
    } catch (e) {
      setPushMsg((e as Error).message)
    } finally {
      setPushBusy('')
    }
  }

  const triggers = pushState?.triggers || []

  return (
    <section className="card set-adv">
      <div className="card-head">
        <h3>{t('adv.title')}</h3>
        {/* 一张卡**一个**刷新。以前日志块和推送块各挂一个，同名按钮在同一张卡里
            并排两个 —— 点哪个都像点错。这一下把三样一起读回来：引擎状态 + 日志 + 推送。 */}
        <button
          className="set-mini"
          disabled={!!busy || !!pushBusy}
          onClick={() => {
            onRefresh()
            void loadPush()
          }}
        >
          {t('adv.refresh')}
        </button>
      </div>

      <div className="set-blocks">
        {/* 左：它现在好不好 + 坏了怎么修
             不摆 pid / 进程号这类开发读数 —— 用户看不懂，而且引擎若是外部启动的
             （child 为空）会显示成「未运行」，跟「引擎运行中」自相矛盾。 */}
        <div className="set-block">
          <div className="set-block-title">{t('adv.engine')}</div>

          {/* AI 总开关。高级卡里唯一一个「不是排障」的东西，放最上面。
              关掉 = 这台机器**完全不碰外部模型**：不启引擎、助手不开、桌宠不出来。
              剩下的是纯自动化 —— 任务只是「一条命令 + 目录 + 定时」，不靠模型。 */}
          <div className="set-field">
            <span>{t('ai.label')}</span>
            <LiquidToggle on={ai} disabled={!!busy} onChange={onAi} label={t('ai.label')} />
            {/* 这里**一直**说开关是干什么的，不换成状态文案 ——
                下面那行已经写了一次「AI 已关闭」，再来一次就是重词。 */}
            <span className="set-hint">{t('ai.hint')}</span>
          </div>

          {/* 两组可视化：绿线 = 引擎（nanobot 在不在服务），蓝线 = Python 运行时。
             分开画是因为它们是两层东西：Python 没了和引擎挂了修法完全不同。 */}
          <div className="set-field">
            <i className={`set-dot ${ai ? STATE_TONE[status?.state || ''] || 'wait' : 'wait'}`} />
            <b className="set-adv-state" title={status?.python || ''}>
              {ai
                ? t(STATE_LABEL_KEY[status?.state || ''] || 'set.engine.stopped')
                : t('ai.closed')}
            </b>
            <Vital on={on} flat={!ai} />
            <span className="set-hint">
              {status?.installed
                ? `nanobot ${status.version || ''}${
                    status.source === 'bundled'
                      ? ` · ${t('eng.bundled')}`
                      : status.source === 'system'
                        ? ` · ${t('eng.system')}`
                        : ''
                  }`.trim()
                : t('adv.notinstalled')}
            </span>
            <span className="set-sep" />
            <Vital on={ai && hasPy} tone="py" flat={!ai} />
            <span className="set-hint">
              {hasPy ? `Python ${status?.pyVersion || ''}`.trim() : t('adv.nopython')}
            </span>
          </div>

          <p className="set-note">
            {/* 引擎自己报的错（启动失败 / 装不上）优先于那句通用提示 ——
                页顶那条状态带删掉之后，这是它唯一能露面的地方。
                ⚠️ 走 `reason` 查词条，**不要直接显示 `message`**：那是给日志看的中文句子，
                   英文界面会冒出中文（测试报告 #4）。message 只在没有 reason 时兜底。 */}
            {status?.reason
              ? t(`eng.reason.${status.reason}`, { detail: status.detail || '' })
              : status?.message || t(ai ? 'adv.hint' : 'ai.closed.hint')}
          </p>

          {/* 读数：和上面的波形是同一套语言（监护仪下面那排小字）。
              「跑了多久」决定该不该重启，「哪个口」对得上日志里的 endpoint。
              AI 关着就不摆 —— 没跑的东西没有时长。 */}
          {ai && (
            <div className="set-readout">
              {uptime && (
                <span>
                  <em>{t('adv.uptime')}</em>
                  {uptime}
                </span>
              )}
              {status?.apiPort ? (
                <span>
                  <em>{t('adv.port')}</em>
                  127.0.0.1:{status.apiPort}
                </span>
              ) : null}
            </div>
          )}

          <div className="set-seg">
            {/* 关着的时候「重启」没意义（没在跑的东西点重启只是把它拉起来）。
                「重装」留着 —— 那是装引擎本身，不调模型，开机前修环境要用。 */}
            {ai && (
              <button
                className="set-seg-btn"
                disabled={!!busy}
                onClick={() => act(() => window.workbench.engine.restart(), 'adv.restart')}
              >
                {t('adv.restart')}
              </button>
            )}
            <button
              className="set-seg-btn"
              disabled={!!busy}
              onClick={() => act(() => window.workbench.engine.install(), 'adv.install')}
            >
              {t('adv.reinstall')}
            </button>
          </div>
        </div>

        {/* 右：日志 —— **不折叠**，块内自己滚 */}
        <div className="set-block">
          <div className="set-block-title">{t('adv.logs')}</div>
          <pre className="set-log">{logs || t('adv.nologs')}</pre>
        </div>

        {/* 推送 —— 横跨整行。它是**出站**的那个方向：
            上面的渠道是「别人怎么找到助手」，这里是「助手怎么找你」。
            只有定时跑才推（理由见 main/agent/push.ts）。 */}
        <div className="set-block set-push">
          <div className="set-block-title">{t('push.title')}</div>

          {triggers.length ? (
            <div className="set-field">
              <span>{t('push.to')}</span>
              <select
                className="set-select"
                disabled={!!pushBusy}
                value={pushState?.triggerId || ''}
                onChange={(e) => void bindPush(e.target.value)}
              >
                <option value="">{t('push.off')}</option>
                {triggers.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.name} · {tr.channel}
                  </option>
                ))}
              </select>
              <button
                className="set-mini"
                disabled={!!pushBusy || !pushState?.triggerId}
                onClick={() => void testPush()}
              >
                {t('push.test')}
              </button>
            </div>
          ) : null}

          {/* 两段说明**互斥**：还没绑就说怎么绑，绑好了就说什么时候会推。
              两句都摆上是拿一段用不上的话占地方。 */}
          <p className="set-note">{t(triggers.length ? 'push.only' : 'push.note')}</p>
          {pushMsg && <span className="set-hint">{pushMsg}</span>}
        </div>
      </div>

      {/* 真的退出。
          ⚠️ 这一条是**必需的出口**：红点只把窗口收进托盘，托盘图标在 Windows 上
             默认是折叠的 —— 没有这个按钮，用户就只剩「去任务管理器杀进程」一条路。 */}
      <div className="set-foot set-adv-foot">
        <span className="set-hint">{t('adv.quit.hint')}</span>
        <button className="set-quit" onClick={() => window.workbench.app.quit()}>
          {t('adv.quit')}
        </button>
      </div>

      {/* 出品：这产品是工作室的，三个入口是它对外的去处。
          放卡片最底、字号最小 —— 它是「归属」，不是「功能」。 */}
      <div className="set-credit">
        <b>{STUDIO}</b>
        <button className="set-link" onClick={() => open(SITE_URL)}>
          {t('adv.site')}
        </button>
        <button className="set-link" onClick={() => open(FEISHU_URL)}>
          {t('adv.feishu')}
        </button>
        <button className="set-link" onClick={() => open(REPO_URL)}>
          GitHub
        </button>
      </div>
    </section>
  )
}
