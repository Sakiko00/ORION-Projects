import { createServer, type Server } from 'node:http'
import * as vault from './vault'

/**
 * 接警 —— 把外面的告警收进来。
 *
 * 为什么是我们自己写：**nanobot 不自带 webhook 接收器**（它自己的文档就写着
 * 「要 webhook 就自己写个小服务」）。所以「收警」这一半必须在工作台里。
 *
 * 为什么是本地 HTTP 而不是命名管道：报警来自**别的进程/别的机器**（外部系统、
 * 脚本、采集器），它们只会发 HTTP。管道只有知道名字的本机进程能连。
 * 绑 127.0.0.1，不对外 —— 要给别的机器发，前面自己加一层。
 *
 * 收到的警：
 *   ① 幂等去重（外部系统重发是常态，不去重一次故障能刷出几十条）
 *   ② 落 alerts.json（界面能看见、可追溯）
 *   ③ 广播给界面
 * 处置（交给 agent）不在这里自动做 —— 那是有副作用的动作，先让人点一下。
 */

const PORT = Number(process.env.WORKBENCH_ALERT_PORT || 8971)
/** 多久内的同一条算重发 */
const DEDUPE_MS = 30 * 60_000

export interface AlertEvent {
  type: 'new' | 'ack'
  alert: vault.Alert
  /** 判重命中：没新建，只是又报了一次 */
  deduped?: boolean
}

const listeners = new Set<(e: AlertEvent) => void>()

export function onEvent(cb: (e: AlertEvent) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function emit(e: AlertEvent): void {
  for (const l of listeners) l(e)
}

export function intakeUrl(): string {
  return `http://127.0.0.1:${PORT}/alert`
}

function level(v: unknown): vault.Alert['level'] {
  return v === 'error' || v === 'warn' || v === 'info' ? v : 'warn'
}

/**
 * 收一条警。外部系统直接 POST 到这里。
 * 幂等：同 source+title+正文前 200 字，在 30 分钟内重复出现 → 只在已有那条上累加次数，
 * 不再新建（返回 deduped: true，外部系统重发是安全的）。
 */
export async function intake(input: {
  title?: unknown
  text?: unknown
  source?: unknown
  level?: unknown
}): Promise<{ id: string; deduped: boolean }> {
  const title = String(input.title ?? '').trim() || '未命名告警'
  const text = String(input.text ?? '').trim()
  /* ⚠️ 兜底**不能写中文**：这条会原样出现在界面上（切英文时就露馅了）。
     空着交给渲染层翻 —— 那是「没人说来源」的显示问题，不是数据。 */
  const source = String(input.source ?? '').trim()

  const fp = vault.alertFingerprint(source, title, text)
  const recent = await vault.listAlerts(100)
  const hit = recent.find((a) => {
    const t = Date.parse(a.at)
    const age = Number.isNaN(t) ? 0 : Date.now() - t // 时间戳解析不了就当「刚刚」，别漏掉去重
    return age < DEDUPE_MS && vault.alertFingerprint(a.source, a.title, a.text) === fp
  })
  if (hit) return { id: hit.id, deduped: true }

  const alert: vault.Alert = {
    id: vault.newAlertId(),
    at: new Date().toISOString(),
    source,
    level: level(input.level),
    title,
    text,
    ack: false
  }
  await vault.appendAlert(alert)
  emit({ type: 'new', alert })
  return { id: alert.id, deduped: false }
}

export async function ack(id: string): Promise<vault.Alert> {
  const alert = await vault.ackAlert(id, true)
  emit({ type: 'ack', alert })
  return alert
}

/* ---------------- 收警的 HTTP 入口 ---------------- */

let server: Server | null = null

function json(res: import('node:http').ServerResponse, code: number, body: unknown): void {
  const s = JSON.stringify(body)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(s)
}

export function listen(): number {
  if (server) return PORT

  server = createServer((req, res) => {
    const url = req.url || '/'

    if (req.method === 'GET' && (url === '/health' || url === '/alert/health')) {
      json(res, 200, { ok: true, intake: intakeUrl() })
      return
    }

    if (req.method !== 'POST' || !url.startsWith('/alert')) {
      json(res, 404, { ok: false, error: '只有 POST /alert' })
      return
    }

    let body = ''
    req.on('data', (c) => {
      body += c
      if (body.length > 256 * 1024) req.destroy() // 别让人拿大包把内存灌满
    })
    req.on('end', () => {
      void (async () => {
        try {
          // 两种都收：JSON 体；或者直接把一段文本当 body
          let input: Record<string, unknown>
          const trimmed = body.trim()
          if (trimmed.startsWith('{')) {
            input = JSON.parse(trimmed) as Record<string, unknown>
          } else {
            input = {
              title: new URL(url, 'http://x').searchParams.get('title') || '外部告警',
              text: trimmed,
              source: new URL(url, 'http://x').searchParams.get('source') || '外部'
            }
          }
          const out = await intake(input)
          json(res, 200, { ok: true, ...out })
        } catch (e) {
          json(res, 400, { ok: false, error: String((e as Error)?.message || e) })
        }
      })()
    })
  })

  server.on('error', (e) => {
    console.error(`[接警] 起不来：${e.message}`)
    server = null
  })
  server.listen(PORT, '127.0.0.1', () => console.log(`[接警] ${intakeUrl()}`))
  return PORT
}

export function close(): void {
  try {
    server?.close()
  } catch {
    /* 已经关了 */
  }
  server = null
}

export { PORT as ALERT_PORT }
