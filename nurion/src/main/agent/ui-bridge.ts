import { createServer, Server, Socket } from 'node:net'
import type { BrowserWindow } from 'electron'

/**
 * 界面直通管道：mcp-server.js → 主进程 → 渲染进程 → 原路返回。
 *
 * 为什么需要：MCP server 是 nanobot 拉起的独立子进程，能读写文件，但看不见界面。
 * 而「操控组件」这件事只有渲染进程做得到（DOM 在那儿）。
 * 为什么用命名管道不用 TCP：端口全机可见，管道只有知道名字的进程能连。
 *
 * 主进程只当搬运工：把请求转给渲染进程（agent:uiCall），
 * 渲染进程干完（agent:uiResult）再把结果写回那条 socket。
 *
 * 但有一类请求不该转给渲染进程：「执行任务」必须主进程自己做
 * —— 「谁在跑」只能有一份真相。所以这里还有一层 mainOps，见下方。
 */

// ⚠️ 管道名必须带应用名：可复用包的另一个应用（个人工作台）用的是
// `workbench-agent`。同名的话后启动的那个 listen 会 EADDRINUSE ──
// 更坏的情况是能连上但连到了隔壁应用的界面，agent 就去点别人家的按钮了。
const PIPE =
  process.platform === 'win32'
    ? '\\\\.\\pipe\\automation-workbench-agent'
    : '/tmp/automation-workbench-agent.sock'
const CALL_TIMEOUT = 20_000

let server: Server | null = null
let target: BrowserWindow | null = null
let seq = 0
const pending = new Map<
  string,
  { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
>()

/* ---------- 主进程自己的操作 ----------
 * agent 眼里，「操作界面」和「执行任务」都是「请工作台干活」，走同一条管道；
 * 区别只在落到哪一层：界面操作转给渲染进程，执行任务留在主进程。
 */
type MainOp = (args: Record<string, unknown>) => Promise<unknown>
const mainOps = new Map<string, MainOp>()

export function registerMainOp(name: string, fn: MainOp): void {
  mainOps.set(name, fn)
}

export function mainOpNames(): string[] {
  return [...mainOps.keys()]
}

export function send(tool: string, args: unknown): Promise<unknown> {
  const win = target
  if (!win || win.isDestroyed()) {
    return Promise.reject(new Error('界面还没准备好'))
  }
  const callId = `ui-${++seq}`
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(callId)
      reject(new Error(`界面 ${CALL_TIMEOUT / 1000} 秒没回话`))
    }, CALL_TIMEOUT)
    pending.set(callId, { resolve, reject, timer })
    win.webContents.send('agent:uiCall', { callId, tool, args })
  })
}

/** 渲染进程干完活，从这儿把结果交回来，写回那条 socket */
export function settle(callId: string, payload: unknown): boolean {
  const p = pending.get(callId)
  if (!p) return false
  clearTimeout(p.timer)
  pending.delete(callId)
  p.resolve(payload)
  return true
}

export function listen(win: BrowserWindow): string {
  target = win
  if (server) return PIPE

  server = createServer((sock: Socket) => {
    sock.setEncoding('utf8')
    let buf = ''
    sock.on('data', async (chunk: string) => {
      buf += chunk
      let i: number
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 1)
        if (!line.trim()) continue
        let req: { tool?: string; args?: unknown }
        try {
          req = JSON.parse(line)
        } catch {
          sock.write(JSON.stringify({ error: '管道里收到的不是 JSON' }) + '\n')
          continue
        }
        try {
          const name = String(req.tool || '')
          const op = mainOps.get(name)
          const data = op
            ? await op((req.args as Record<string, unknown>) || {})
            : await send(name, req.args || {})
          sock.write(JSON.stringify({ data }) + '\n')
        } catch (e) {
          sock.write(JSON.stringify({ error: (e as Error).message }) + '\n')
        }
      }
    })
    sock.on('error', () => {
      /* 对面断了就算了，下次调用会重连 */
    })
  })

  server.on('error', (e) => {
    console.error(`[界面管道] 起不来：${e.message}`)
    server = null
  })
  server.listen(PIPE, () => console.log(`[界面管道] ${PIPE}`))
  return PIPE
}

export function close(): void {
  for (const p of pending.values()) {
    clearTimeout(p.timer)
    // 关停时把挂起的请求全部失败掉，别让 MCP 客户端永久挂在那等结果
    p.reject(new Error('工作台正在关闭，界面操作已取消'))
  }
  pending.clear()
  try {
    server?.close()
  } catch {
    /* already closed */
  }
  server = null
}

export { PIPE }
