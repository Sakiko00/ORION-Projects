import { connect } from 'node:net'
import * as agent from './agent'

/**
 * 工作台的 MCP server（stdio）—— 把 agent.ts 里那套工具暴露给任何 MCP 客户端。
 *
 * 为什么是这个形态：nanobot（超轻量个人 agent 框架）支持 MCP，
 * 配置格式和 Claude Desktop / Cursor 一样。所以工作台不用「被 nanobot 集成」，
 * 只要当好一个 MCP 工具服务器就行。
 *
 * ⚠️ 两条硬规矩（错了对面就连不上）：
 * 1. stdout 只准写 JSON-RPC；日志一律 stderr
 * 2. 一行一个 JSON（MCP stdio 是换行分帧）
 */

// ⚠️ 管道名要跟 ui-bridge.ts 里的完全一致（同名的话会连到隔壁应用的界面）
const PIPE =
  process.platform === 'win32'
    ? '\\\\.\\pipe\\automation-workbench-agent'
    : '/tmp/automation-workbench-agent.sock'

const DEFAULT_PROTOCOL = '2024-11-05'
const KNOWN_PROTOCOLS = ['2024-11-05', '2025-03-26', '2025-06-18']

const UI_TOOLS = [
  {
    name: 'ui_snapshot',
    description:
      '看工作台界面这一屏有哪些能动的组件（按钮 / 输入框 / 下拉 / 开关）及其状态。动手前先看这个拿组件名。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'ui_act',
    description:
      '对一个界面组件动手，就像用户亲手点下去一样。action：click 点 / set 填值（带 value）/ check、uncheck 开关 / key 敲键盘（value 给键名，默认 Enter）。name 用 ui_snapshot 给的名字。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '组件名，来自 ui_snapshot' },
        action: { type: 'string', enum: ['click', 'set', 'check', 'uncheck', 'key'] },
        value: { type: 'string' }
      },
      required: ['name'],
      additionalProperties: false
    }
  },
  {
    name: 'screen_text',
    description: '把工作台界面上看得见的文字读回来。用它「看」界面，而不是猜。',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer' } },
      additionalProperties: false
    }
  }
]

const isUiTool = (name: string): boolean => name === 'screen_text' || name.startsWith('ui_')

/**
 * 这几个不能在本进程里做，得请主进程代劳：
 * 执行/停止任务由主进程统一管 —— 「谁在跑」只能有一份真相，
 * 而本进程只是引擎拉起来的普通子进程（两边各自 spawn 就会出现两个真相）。
 * 走的还是同一条管道，主进程那边认名字自己接。
 */
const MAIN_TOOLS = [
  {
    name: 'run_task',
    description:
      '现在就跑一个任务（真去执行它的命令，会写文件）。只能一个一个来：已经有一个在跑时会报错。返回 runId。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '来自 list_tasks 的 id' } },
      required: ['id'],
      additionalProperties: false
    }
  },
  {
    name: 'stop_task',
    description: '把正在跑的那个任务停掉（连子进程树一起杀）。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'run_status',
    description: '看现在有没有任务在跑、跑到哪了（返回最近几行输出）。回答「跑完了吗」先调它。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
]

const isMainTool = (name: string): boolean => MAIN_TOOLS.some((t) => t.name === name)
/** 要走管道（而不是本地数据层）的工具 */
const viaPipe = (name: string): boolean => isUiTool(name) || isMainTool(name)

/** 单次请求单次连接：调用不密集，不值得维护长连接。
 *  ui_* / screen_text 落到渲染进程，run_task / stop_task 落到主进程 —— 同一根管子。 */
function callPipe(tool: string, args: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const sock = connect(PIPE)
    let buf = ''
    let done = false
    const finish = (fn: (v: unknown) => void, v: unknown): void => {
      if (done) return
      done = true
      try {
        sock.destroy()
      } catch {
        /* 已经断了 */
      }
      fn(v)
    }
    sock.setEncoding('utf8')
    sock.on('connect', () => sock.write(`${JSON.stringify({ tool, args })}\n`))
    sock.on('data', (chunk: string) => {
      buf += chunk
      const i = buf.indexOf('\n')
      if (i < 0) return
      try {
        const msg = JSON.parse(buf.slice(0, i)) as { error?: string; data?: unknown }
        if (msg.error) finish(reject, new Error(msg.error))
        else finish(resolve, msg.data)
      } catch {
        finish(reject, new Error('工作台的回话看不懂'))
      }
    })
    sock.on('error', (e: NodeJS.ErrnoException) =>
      finish(reject, new Error(`连不上工作台界面（${e.code || e.message}）—— 应用没开？`))
    )
    sock.setTimeout(30_000, () => finish(reject, new Error('工作台界面 30 秒没回话')))
  })
}

const err = (...a: unknown[]): void => {
  process.stderr.write(`[workbench-mcp] ${a.join(' ')}\n`)
}
const send = (msg: unknown): void => {
  process.stdout.write(`${JSON.stringify(msg)}\n`)
}

function result(id: unknown, payload: unknown): void {
  send({ jsonrpc: '2.0', id, result: payload })
}

function toolError(id: unknown, message: string): void {
  result(id, { content: [{ type: 'text', text: message }], isError: true })
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

async function handle(msg: { id?: unknown; method?: string; params?: Record<string, unknown> } | null): Promise<void> {
  const { id, method, params } = msg || {}

  // JSON-RPC 通知 = 没有 id 字段。id 为 0 / '' 是**合法请求**，不能当通知丢弃
  if (id === undefined) {
    if (method === 'notifications/initialized') err('client initialized')
    return
  }

  switch (method) {
    case 'initialize': {
      const asked = typeof params?.protocolVersion === 'string' ? params.protocolVersion : ''
      const protocolVersion = asked && KNOWN_PROTOCOLS.includes(asked) ? asked : DEFAULT_PROTOCOL
      result(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'workbench', version: '0.1.0' },
        instructions:
          '这是「NURION」的数据层（任务 / 机器人）。工具都在这一层上操作，' +
          '和界面用的是同一套读写，所以改完打开应用就能看到。'
      })
      err(`initialize done, protocol ${protocolVersion}`)
      return
    }

    case 'ping':
      result(id, {})
      return

    case 'tools/list': {
      const list = agent
        .list()
        .filter((t) => t.ready)
        .map((t) => ({ name: t.name, description: t.describe, inputSchema: t.inputSchema }))
        .concat(UI_TOOLS)
        .concat(MAIN_TOOLS)
      result(id, { tools: list })
      err(`tools/list → ${list.map((t) => t.name).join(', ')}`)
      return
    }

    case 'tools/call': {
      const name = typeof params?.name === 'string' ? params.name : ''
      if (!name) {
        toolError(id, '缺少工具名')
        return
      }
      const args = (params?.arguments || {}) as Record<string, unknown>
      try {
        const out = viaPipe(name) ? await callPipe(name, args) : await agent.call(name, args)
        result(id, { content: [{ type: 'text', text: asText(out) }], isError: false })
      } catch (e) {
        err(`tools/call ${name} failed: ${(e as Error).message}`)
        toolError(id, (e as Error).message || String(e))
      }
      return
    }

    default:
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `这个方法没实现：${method}` } })
  }
}

// ---- 逐行读 JSON-RPC ----
let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk: string) => {
  buf += chunk
  let i: number
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    let msg: any
    try {
      msg = JSON.parse(line)
    } catch {
      err(`skipping a line that is not JSON: ${line.slice(0, 120)}`)
      continue
    }
    handle(msg).catch((e) => err(`handler for ${msg?.method} threw: ${(e as Error).message}`))
  }
})

process.stdin.on('end', () => {
  err('stdin closed, exiting')
  process.exit(0)
})

process.on('uncaughtException', (e) => {
  err(`crashed (stderr only, protocol unaffected): ${e.message}`)
})

err(`started, tools -> ${agent !== undefined ? 'agent loaded' : '?'}`)
