import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { AssistantEvent, ChatMessage } from './run-types'

/**
 * 助手对话 —— **全局唯一一份状态**。
 *
 * 为什么必须是「唯一」：对话要能出现在两个地方（悬浮窗 + AI 共建页），
 * 如果各自 useState，就会变成**两段互不相干的对话** —— 切个页历史就变了，
 * 还会互相把 `chat.json` 覆盖掉。
 *
 * 所以状态提到这里，谁来渲染都读同一份。
 *
 * 三条设计约束（从原来的 AiBuilder 搬过来，没变）：
 *   1. **故障不能伪装成回答**：provider 欠费/失效要识别成错误，不能显示成它说的话
 *   2. **它调了什么工具全摊在明面上**（见 Pipeline）
 *   3. **对话不丢**：落 `chat.json`，切页、重启都还在
 *
 * 走 nanobot 的 OpenAI 兼容 HTTP 接口（见主进程 assistant.ts），不是私有 WS 协议。
 */

export interface TaskLite {
  id: string
  name: string
  cmd?: string
  enabled: boolean
}

/** 脚本列表项（对应主进程 vault.listScripts） */
export interface ScriptLite {
  name: string
  size: number
  updatedAt: string
  /** 有值 = 已经挂成任务了 */
  taskId?: string
}

export interface AgentChat {
  msgs: ChatMessage[]
  input: string
  setInput: (v: string) => void
  turn: string | null
  engineOk: boolean | null
  starting: boolean
  /** 它正在回话（流式中）。比 `turn` 可靠 —— 刷新页面后 turn 会丢，但流式标记不会说谎 */
  thinking: boolean
  /** 忙 = 它在回话 或 有任务在跑 */
  busy: boolean
  ask: (text: string) => Promise<void>
  stopTurn: () => Promise<void>
  startEngine: () => Promise<void>
  clear: () => Promise<void>
  /** 这一轮它新建了哪些任务 */
  fresh: TaskLite[]
  scripts: ScriptLite[]
  loadScripts: () => Promise<void>
  makeTask: (s: ScriptLite) => Promise<void>
}

const Ctx = createContext<AgentChat | null>(null)

export function useAgentChat(): AgentChat {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAgentChat 必须在 AgentChatProvider 里用')
  return v
}

export function AgentChatProvider({
  children,
  notify,
  onTasksChanged,
  tasks,
  running
}: {
  children: ReactNode
  notify: (text: string, tone?: 'ok' | 'bad' | 'info') => void
  /** 它建了任务之后要能反映到别处（创建页 / 概览） */
  onTasksChanged: () => Promise<void>
  tasks: TaskLite[]
  /** 有没有任务正在跑 —— 决定能不能再让它动手 */
  running: boolean
}): JSX.Element {
  const [msgs, setMsgs] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [turn, setTurn] = useState<string | null>(null)
  const [engineOk, setEngineOk] = useState<boolean | null>(null)
  const [starting, setStarting] = useState(false)
  const [fresh, setFresh] = useState<TaskLite[]>([])
  const [scripts, setScripts] = useState<ScriptLite[]>([])

  const seq = useRef(0)
  const before = useRef<Set<string>>(new Set())
  const pendingDiff = useRef(false)
  const loaded = useRef(false)

  const checkEngine = useCallback(async (): Promise<void> => {
    const wb = window.workbench
    if (!wb) {
      setEngineOk(false)
      return
    }
    setEngineOk(await wb.assistant.alive())
  }, [])

  /* 引擎能被**别处**（终端、设置页）拉起来 —— 光挂载时查一次不够：
     用户后起的引擎，界面不会知道，就永远停在「没运行」。
     没查着就每 4 秒再看一眼，活过来自动翻成「运行中」。 */
  useEffect(() => {
    if (engineOk === true) return
    const id = setInterval(() => void checkEngine(), 4000)
    return () => clearInterval(id)
  }, [engineOk, checkEngine])

  const loadScripts = useCallback(async (): Promise<void> => {
    try {
      const list = (await window.workbench?.agent.call('list_scripts', {})) as
        | ScriptLite[]
        | undefined
      if (Array.isArray(list)) setScripts(list)
    } catch {
      /* 读不到就当空 */
    }
  }, [])

  /* ── 进来先把历史对话捞回来（切页、重启都不丢） ──
   * ⚠️ 这里依赖必须是**空数组**：这个 effect 一重跑，就会拿盘上的对话去**覆盖**内存里的，
   * 而它原来依赖 `checkEngine` —— 引擎状态一翻（最典型的就是「新对话」要重启引擎），
   * 它就会重跑，把刚发出去的那条消息冲掉（实测：界面里看得到，chat.json 却是空的）。
   * 加载历史是**一次**的事，别跟会变的东西绑在一起。 */
  useEffect(() => {
    void (async () => {
      try {
        const past = (await window.workbench?.chat.load()) as ChatMessage[] | undefined
        // ⚠️ 落库时可能正流到一半，`streaming` 会被存成 true。
        // 重新打开时那一轮早就不在了 —— 不清掉，状态点会永远显示「它正在回话」。
        if (past?.length) setMsgs(past.map((m) => ({ ...m, streaming: false })))
      } catch {
        /* 读不回来就当空对话，不打扰 */
      }
      loaded.current = true
    })()
  }, [])

  /* 引擎探测和脚本清单：这两样本来就会变，单独一个 effect，别拖累对话加载 */
  useEffect(() => {
    void checkEngine()
    void loadScripts()
  }, [checkEngine, loadScripts])

  /* ── 有变动就落库（只在加载完之后写，免得拿空数组把历史冲掉） ──
   * ⚠️ 必须防抖：流式输出时 `msgs` 每个 token 都变，逐个写盘就是几十次
   * 「stringify 200 条 + 写文件 + rename」。攒 400ms 一起写，
   * 用户停手或流结束时正好落一次。 */
  useEffect(() => {
    if (!loaded.current) return
    const timer = setTimeout(() => {
      void window.workbench?.chat.save(msgs).catch(() => undefined)
    }, 400)
    return () => clearTimeout(timer)
  }, [msgs])

  /* ── 对话事件 → 消息 ─────────────────────────────────────── */
  useEffect(() => {
    const wb = window.workbench
    if (!wb) return

    const id = wb.assistant.onEvent((e: AssistantEvent) => {
      setMsgs((prev) => {
        if (e.type === 'start') {
          return [
            ...prev,
            {
              id: `ai-${e.turnId}`,
              role: 'ai',
              text: '',
              tools: [],
              streaming: true,
              at: new Date().toISOString()
            }
          ]
        }
        const last = prev[prev.length - 1]
        if (!last || last.id !== `ai-${e.turnId}`) return prev

        if (e.type === 'delta') {
          return [...prev.slice(0, -1), { ...last, text: last.text + (e.text || '') }]
        }

        if (e.type === 'tool') {
          // 流式里 name 和 args 是分片来的：有 name 就当新的一条，只有 args 就接到上一条
          const tools = [...(last.tools || [])]
          // 打时间戳：界面要显示「现在这一轮跑了多久」，而事件本身不带时间
          if (e.name) tools.push({ name: e.name, args: e.args, at: Date.now() })
          else if (tools.length) {
            const tail = tools[tools.length - 1]
            tools[tools.length - 1] = { ...tail, args: (tail.args || '') + (e.args || '') }
          }
          return [...prev.slice(0, -1), { ...last, tools }]
        }

        if (e.type === 'done') {
          return [...prev.slice(0, -1), { ...last, streaming: false, ms: e.ms }]
        }

        // error：把流到一半的文字保留下来，但标成错误 —— 别让它看起来像回答
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            streaming: false,
            error: e.message,
            engineDown: e.engineDown,
            providerDown: e.providerDown
          }
        ]
      })

      if (e.type === 'done') {
        setTurn(null)
        setEngineOk(true)
        pendingDiff.current = true
        void onTasksChanged()
        void loadScripts()
      }
      if (e.type === 'error') {
        setTurn(null)
        if (e.engineDown) setEngineOk(false)
      }
    })

    return () => wb.assistant.offEvent(id)
  }, [onTasksChanged, loadScripts])

  /* ── 收尾时 diff：这一轮它新建了哪些任务 ── */
  useEffect(() => {
    if (!pendingDiff.current) return
    pendingDiff.current = false
    setFresh(tasks.filter((t) => !before.current.has(t.name)))
  }, [tasks])

  const ask = useCallback(
    async (text: string): Promise<void> => {
      const t = text.trim()
      if (!t) return
      if (turn || running) {
        notify(turn ? '上一句还没回完' : '有任务正在跑，等它一下', 'bad')
        return
      }
      setInput('')
      setFresh([])
      before.current = new Set(tasks.map((x) => x.name))
      seq.current += 1
      setMsgs((prev) => [
        ...prev,
        { id: `you-${seq.current}-${Date.now()}`, role: 'you', text: t, at: new Date().toISOString() }
      ])
      try {
        const r = await window.workbench.assistant.send(t)
        setTurn(r.turnId)
      } catch (e) {
        notify(`发不出去：${String((e as Error)?.message || e)}`, 'bad')
      }
    },
    [turn, running, notify, tasks]
  )

  const startEngine = useCallback(async (): Promise<void> => {
    setStarting(true)
    try {
      const s = (await window.workbench.engine.start()) as { state?: string; message?: string }
      await checkEngine()
      if (s?.state === 'running') notify('引擎起来了', 'ok')
      else notify(s?.message || '引擎没起来，去「设置」看日志', 'bad')
    } catch (e) {
      notify(`起不来：${String((e as Error)?.message || e)}`, 'bad')
    } finally {
      setStarting(false)
    }
  }, [checkEngine, notify])

  const stopTurn = useCallback(async (): Promise<void> => {
    await window.workbench.assistant.stop()
    setTurn(null)
    notify('已打断', 'info')
  }, [notify])

  const clear = useCallback(async (): Promise<void> => {
    setMsgs([])
    setFresh([])
    setTurn(null)
    try {
      const r = await window.workbench.chat.fresh()
      notify(
        r.archived ? `新对话开始了，刚才那段存档在 ${r.archived}` : '新对话开始了',
        'ok'
      )
    } catch (e) {
      notify(`开新对话失败：${String((e as Error)?.message || e)}`, 'bad')
    }
  }, [notify])

  /** 脚本 → 任务：这是「复用」真正发生的地方，不新造概念，就是一条 cmd */
  const makeTask = useCallback(
    async (s: ScriptLite): Promise<void> => {
      try {
        await window.workbench.agent.call('create_task', {
          name: s.name,
          cmd: `python scripts/${s.name}.py`,
          schedule: '手动触发'
        })
        notify(`已把「${s.name}」建成任务，随时能跑也能定时`, 'ok')
        await onTasksChanged()
        await loadScripts()
      } catch (e) {
        notify(`建成任务失败：${String((e as Error)?.message || e)}`, 'bad')
      }
    },
    [notify, onTasksChanged, loadScripts]
  )

  const value: AgentChat = {
    msgs,
    input,
    setInput,
    turn,
    engineOk,
    starting,
    // 两个信号取或：`turn` 是「我刚发了话」，流式标记是「它确实在吐字」。
    // 只看 turn 的话，别处发起的回合（或刷新之后）状态点就是错的。
    thinking: !!turn || (msgs.length > 0 && msgs[msgs.length - 1].streaming === true),
    busy: !!turn || running,
    ask,
    stopTurn,
    startEngine,
    clear,
    fresh,
    scripts,
    loadScripts,
    makeTask
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
