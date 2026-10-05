import { useEffect, useMemo, useState } from 'react'
import { Icon } from './Icon'
import { useT } from '../i18n'

/**
 * 把一次 AI 干活的过程摊开 —— 「它在干什么、走到哪了、还要几步」。
 *
 * 为什么不是一串工具 chip（以前的写法）：那是**日志**，不是过程。
 * 用户看到 `write_script name=x` 得自己在脑子里翻译成「哦它在写脚本」。
 * 这里做两件事：
 *   1. **翻译成人话**：「写脚本 douban_top250」而不是 `write_script name=douban_top250`
 *   2. **按阶段归位**：摸底 → 动手 → 试跑 → 验收 → 上线，没到的阶段也留着灰点，
 *      这样"还要走几步"是可见的，不是干等
 *
 * ⚠️ 阶段是用**工具名**猜的，同一个工具在不同上下文可能落在不同阶段（比如 exec）。
 * 所以每个动作**同时显示原始工具名**（小灰字）—— 猜错了用户也能一眼看出来，
 * 不至于被一句错翻译骗过去。
 *
 * 为什么阶段不写成配置：阶段名要和 `AGENTS.md` 里给 AI 的流程用同一套词。
 * 界面上看到的和它脑子里想的是同一件事，这才叫"看得见它在干什么"。
 */

export interface ToolCall {
  name: string
  args?: string
}

interface Stage {
  id: string
  label: string
  icon: string
  /** 还没到这个阶段时，告诉用户这一步大概是干什么的 */
  hint: string
  /** 命中这些片段就归这一阶段 */
  hit: string[]
}

/**
 * ⚠️ **显示顺序**（就是人心里那条流程）。
 * 归类用的优先级另有一张表 —— 见 `MATCH_PRIORITY`。
 * 一开始我把这两件事用同一个数组表达，结果「验收」排到了「摸底」前面
 * （因为 `read_artifact` 必须优先被验收拦住）。**一个数组不要兼两个语义。**
 */
const STAGES: Stage[] = [
  {
    id: 'look',
    label: '摸底',
    icon: 'search',
    hint: '看清现状、查资料',
    hit: [
      'read_',
      'list_',
      'get_',
      'web_',
      'search',
      'ui_',
      'screen_',
      'memory',
      'clawhub',
      'github',
      'summarize',
      'list_dir'
    ]
  },
  {
    id: 'write',
    label: '动手',
    icon: 'edit',
    hint: '写脚本、改文件',
    hit: ['write_', 'delete_', 'apply_patch', 'edit', 'save']
  },
  {
    id: 'run',
    label: '试跑',
    icon: 'play',
    hint: '真跑一次看结果',
    hit: ['run_task', 'stop_task', 'run_status', 'exec', 'shell', 'spawn']
  },
  {
    id: 'accept',
    label: '验收',
    icon: 'check',
    hint: '看产物、看日志',
    hit: ['artifact', 'run_log', 'read_log']
  },
  {
    id: 'ship',
    label: '上线',
    icon: 'bolt',
    hint: '挂成任务、定时跑',
    hit: ['create_task', 'update_task', 'delete_task', 'ack_alert']
  }
]

/**
 * 归类优先级 —— 谁先匹配谁赢。
 * 必须有这张表：`read_artifact` 里含 `read_`，不先让「验收」拦下来就会被当「摸底」。
 */
const MATCH_PRIORITY = ['accept', 'run', 'ship', 'write', 'look']

function parse(args?: string): Record<string, unknown> {
  if (!args) return {}
  try {
    const o = JSON.parse(args) as unknown
    if (o && typeof o === 'object') return o as Record<string, unknown>
  } catch {
    /* 流到一半，正常 —— 下面兜底 */
  }
  // ⚠️ 参数是**流式分片**来的，大多数时候 `JSON.parse` 一定失败。
  // 直接放弃的话，用户在最想知道"它在写什么"的那一刻，只看到光秃秃的「写脚本」。
  // 所以用正则把已经流出来的顶层字符串字段捞出来 —— 只用于显示，不做任何判断。
  const out: Record<string, unknown> = {}
  for (const m of args.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
    out[m[1]] = m[2].replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  for (const m of args.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"\s*:\s*(true|false|-?\d+(?:\.\d+)?)/g)) {
    out[m[1]] = m[2]
  }
  return out
}

/** 从参数里挑出人看得懂的一行（给 tooltip 用） */
export function toolSummary(args?: string): string {
  const a = parse(args)
  const keys = ['name', 'title', 'id', 'cmd', 'taskId', 'runId', 'path', 'url', 'query', 'source']
  const parts: string[] = []
  for (const k of keys) {
    if (a[k] !== undefined && a[k] !== null && a[k] !== '') parts.push(`${k}=${String(a[k])}`)
    if (parts.length >= 2) break
  }
  if (parts.length) return parts.join(' · ').slice(0, 140)
  const first = Object.entries(a)[0]
  return first ? `${first[0]}=${String(first[1]).slice(0, 80)}` : ''
}

function short(v: unknown, n = 46): string {
  const s = String(v ?? '').replace(/^https?:\/\//, '')
  return s.length > n ? `${s.slice(0, n)}…` : s
}

/**
 * 工具 → 人话。
 * 认不出来的返回空串，调用方会退回显示工具名本身 —— **不编**。
 */
function plain(name: string, args?: string): string {
  const a = parse(args)
  const n = name.toLowerCase()
  const s = (k: string): string => short(a[k], 30)

  if (n === 'write_script') return `写脚本 ${s('name')}`
  if (n === 'read_script') return `读脚本 ${s('name')}`
  if (n === 'list_scripts') return '翻了已有脚本（看有没有能复用的）'
  if (n === 'create_task') return `建任务「${String(a.name ?? '').slice(0, 24)}」`
  if (n === 'update_task') return '改任务设置'
  if (n === 'delete_task') return '删任务'
  if (n === 'list_tasks') return '看了任务清单'
  if (n === 'get_task') return '看了某个任务'
  if (n === 'run_task') return '真跑了一次'
  if (n === 'run_status') return '看跑到哪了'
  if (n === 'stop_task') return '停掉了'
  if (n === 'list_artifacts') return '列了产物'
  if (n === 'read_artifact') return `看产物 ${s('name')}`
  if (n === 'list_runs') return '翻了运行历史'
  if (n === 'read_run_log') return '读了运行日志'
  if (n === 'read_log') return '读了自己的操作日志'
  if (n === 'list_notes') return '翻了知识库'
  if (n === 'read_note') return `读笔记 ${s('name')}`
  if (n === 'write_note') return `写笔记 ${s('name')}`
  if (n === 'list_alerts') return '查了警告'
  if (n === 'ack_alert') return '标记警告已处置'
  if (n === 'list_agents') return '看了机器人'
  if (n === 'web_fetch') return `查 ${s('url')}`
  if (n === 'web_search') return `搜「${String(a.query ?? '').slice(0, 24)}」`
  if (n === 'read_file') return `读 ${s('path')}`
  if (n === 'write_file') return `写 ${s('path')}`
  if (n === 'list_dir') return `列目录 ${s('path')}`
  if (n === 'apply_patch') return '改代码'
  if (n === 'exec' || n === 'shell') return `执行：${short(a.cmd ?? a.command, 40)}`
  if (n === 'search') return `搜 ${short(a.pattern ?? a.query, 30)}`
  if (n === 'ui_snapshot' || n === 'screen_text') return '看了一眼自己的界面'
  if (n === 'ui_act') return '操作了一下界面'
  return ''
}

function stageOf(name: string): Stage | null {
  const n = name.toLowerCase()
  for (const id of MATCH_PRIORITY) {
    const s = STAGES.find((x) => x.id === id)
    if (s && s.hit.some((h) => n.includes(h))) return s
  }
  return null
}

/** 展开看的原始参数。能解析就缩进排好，解析不了（流到一半）就原样给 */
function pretty(args?: string): string {
  if (!args || !args.trim()) return '（没有参数）'
  try {
    return JSON.stringify(JSON.parse(args), null, 2)
  } catch {
    return args
  }
}

/** 流式期间每秒重渲染一次 —— 给「已用 X.Xs」那个活数字用 */
function useTick(on: boolean): number {
  const [, force] = useState(0)
  useEffect(() => {
    if (!on) return
    const t = window.setInterval(() => force((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [on])
  return Date.now()
}

interface Group {
  stage: Stage
  items: ToolCall[]
}

export interface PipelineProps {
  tools: ToolCall[]
  /** 还在流式接收 —— 最后一个动作就是「正在做」 */
  streaming?: boolean
  /** 这一轮出错了：标在最后走到的那个阶段上 */
  failed?: boolean
  ms?: number
  /**
   * 地方小的时候（悬浮窗）—— **干完就收成一行**，点开再看细节。
   *
   * 为什么该收：五段全摊开要占掉大半个小窗，而「过程」只在**它正在干**的时候有价值；
   * 干完之后你要读的是它的结论。ChatGPT / Claude 也是这个做法：跑的时候摊开，跑完折起来。
   * ⚠️ 流式期间**绝不收起** —— 那时候「看得见它在干什么」正是唯一想看的东西。
   */
  collapsible?: boolean
  /**
   * 这一轮是什么时候开始的（ISO）—— 用来算「已用 X.Xs」。
   * 流式期间它是个**活数字**：干等的时候最想知道的就是已经等了多久。
   */
  since?: string
}

export function Pipeline({
  tools,
  streaming,
  failed,
  ms,
  collapsible,
  since
}: PipelineProps): JSX.Element | null {
  const t = useT()
  const [open, setOpen] = useState(false)
  /** 展开了哪一条动作的原始参数（`阶段-序号`） */
  const [openAct, setOpenAct] = useState<string | null>(null)
  const now = useTick(!!streaming)

  const elapsed = ((): number | undefined => {
    if (ms !== undefined) return ms
    if (!streaming || !since) return undefined
    const t0 = Date.parse(since)
    return Number.isFinite(t0) ? Math.max(0, now - t0) : undefined
  })()
  const groups = useMemo<Group[]>(() => {
    const out: Group[] = []
    for (const t of tools) {
      const st = stageOf(t.name)
      if (!st) continue
      const last = out[out.length - 1]
      if (last && last.stage.id === st.id) last.items.push(t)
      else out.push({ stage: st, items: [t] })
    }
    return out
  }, [tools])

  if (!tools.length) return null

  // 没有被识别归类的工具（agent 自造的工具名、nanobot 新加的工具…）
  // 直接列在末尾 —— **不许悄悄吞掉**，看不见的工具才是最难查的
  const known = new Set(groups.flatMap((g) => g.items.map((i) => i.name)))
  const unknown = tools.filter((t) => !known.has(t.name))

  const lastStageId = groups[groups.length - 1]?.stage.id

  /* 干完了 + 地方小 + 没手动点开 → 收成一行。
     出错**不**收：那种时候用户最需要立刻看见它卡在哪一步。 */
  if (collapsible && !streaming && !failed && !open) {
    const path = [...groups.map((g) => g.stage.label), ...(unknown.length ? ['其他'] : [])]
    return (
      <button className="pipe-min" onClick={() => setOpen(true)} title={t('pipe.open')}>
        <Icon name="check" size={11} />
        <b>做完了</b>
        <span className="pipe-min-path">{path.join(' › ') || '—'}</span>
        <span className="pipe-min-ms">
          {tools.length} 步{elapsed !== undefined ? ` · ${(elapsed / 1000).toFixed(1)}s` : ''}
        </span>
        <Icon name="expand" size={11} />
      </button>
    )
  }

  return (
    <ol className="pipe">
      {STAGES.map((s) => {
        const g = groups.find((x) => x.stage.id === s.id)
        const isNow = streaming && s.id === lastStageId
        const isBad = failed && s.id === lastStageId
        const state = isBad ? 'bad' : !g ? 'todo' : isNow ? 'now' : 'done'

        return (
          <li key={s.id} className="pipe-step" data-state={state}>
            <span className="pipe-dot">
              <Icon name={state === 'todo' ? 'clock' : s.icon} size={11} />
            </span>
            <div className="pipe-body">
              <span className="pipe-label">
                {s.label}
                {state === 'now' && <span className="spin" />}
              </span>
              {g ? (
                <div className="pipe-acts">
                  {g.items.slice(0, 6).map((t, i) => {
                    const k = `${s.id}-${i}`
                    const phrase = plain(t.name, t.args)
                    const opened = openAct === k
                    return (
                      <div className="pipe-row" key={k}>
                        {/* 一行一件事。点开看**它到底调了什么** —— 以前这个只能悬停看，
                            而悬停是「看不见的信息」。codex 那边是一模一样的手感。 */}
                        <button
                          className="pipe-act"
                          data-open={opened ? 'true' : 'false'}
                          onClick={() => setOpenAct(opened ? null : k)}
                        >
                          <span className="pipe-what">{phrase || t.name}</span>
                          <span className="pipe-name">{t.name}</span>
                          <Icon name={opened ? 'collapse' : 'expand'} size={10} />
                        </button>
                        {opened && <pre className="pipe-raw scroll">{pretty(t.args)}</pre>}
                      </div>
                    )
                  })}
                  {g.items.length > 6 && <span className="pipe-more">+{g.items.length - 6}</span>}
                </div>
              ) : (
                <span className="pipe-hint">{s.hint}</span>
              )}
            </div>
          </li>
        )
      })}

      {unknown.length > 0 && (
        <li className="pipe-step" data-state="done">
          <span className="pipe-dot">
            <Icon name="bolt" size={11} />
          </span>
          <div className="pipe-body">
            <span className="pipe-label">其他</span>
            <span className="pipe-acts">
              {unknown.slice(0, 6).map((t, i) => (
                <span key={i} className="pipe-act" title={t.args || ''}>
                  {t.name}
                </span>
              ))}
              {unknown.length > 6 && <span className="pipe-more">+{unknown.length - 6}</span>}
            </span>
          </div>
        </li>
      )}

      {elapsed !== undefined && (
        <li className="pipe-foot">
          {streaming ? '已用 ' : '共 '}
          {elapsed >= 1000 ? `${(elapsed / 1000).toFixed(1)}s` : `${elapsed}ms`}
          {!streaming && ` · ${tools.length} 步`}
        </li>
      )}
    </ol>
  )
}
