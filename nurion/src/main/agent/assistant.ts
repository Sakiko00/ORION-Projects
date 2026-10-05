import { apiBase } from './nanobot'

/**
 * 和引擎说话 —— 走 nanobot 的 **OpenAI 兼容 HTTP 接口**（`nanobot serve`）。
 *
 * 为什么不走它的 WebSocket：那是它自己 WebUI 的私有协议，客户端实现
 * （可复用包里的 `nanobot-chat.js`）并没有随包带出来。而它同时提供了一个
 * **标准 OpenAI 接口** —— 有标准接口就别去逆向私有协议，那是纯白费功夫。
 *
 * 流式：请求 `stream:true`，逐行解 SSE 的 `data: {...}`，把增量实时推给界面。
 * 「发完一句之后几十秒没有任何动静」是最劝退的体验，所以这一步不能省。
 */

export interface AssistantEvent {
  type: 'start' | 'delta' | 'tool' | 'done' | 'error'
  turnId: string
  /** delta：这一小段增量文字 */
  text?: string
  /** tool：它这一轮要调哪个工具 */
  name?: string
  args?: string
  /** done */
  ms?: number
  /** error */
  message?: string
  /** error：是不是「引擎没起来」这类可自救的错 */
  engineDown?: boolean
  /** error：provider（模型服务商）侧的故障 —— 欠费 / key 失效 / 限流 */
  providerDown?: boolean
}

/** OpenAI 兼容流式响应的一帧（我们只读关心的字段） */
interface SseChunk {
  error?: { message?: string } | string
  choices?: Array<{
    delta?: {
      content?: string | null
      tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>
    }
  }>
}

/**
 * provider 故障的识别。
 *
 * 为什么需要这个：**nanobot 会把 provider 的报错当成一句正常回复返回**
 * （HTTP 200，finish_reason: "stop"，错误原文就是 content）。
 * 不认的话，界面会显示成「AI 说：你的 key 欠费了」—— 看起来像助手在说话，
 * 实际是根本没收到任何模型输出。
 *
 * 能用的可靠信号只有一个：**非流式响应里 usage 全是 0**（真回复不可能 0 token）。
 * 但流式响应（我们用的）不带 usage，所以只能退而求其次做**正文特征匹配**。
 * 为降低误判，加了两道限制：
 *   ① 整段回复要短（模型真的在讨论「欠费」会写很长）
 *   ② 只认几种固定说法
 */
const PROVIDER_ERR = /out of quota|in arrears|insufficient (balance|quota|credits)|invalid api key|api key (is )?(invalid|expired)|rejected the request|please top up/i

function looksLikeProviderError(text: string): boolean {
  const t = text.trim()
  if (!t || t.length > 400) return false
  return PROVIDER_ERR.test(t)
}

const listeners = new Set<(e: AssistantEvent) => void>()

export function onEvent(cb: (e: AssistantEvent) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function emit(e: AssistantEvent): void {
  for (const l of listeners) l(e)
}

let current: { turnId: string; controller: AbortController } | null = null

export function busy(): { turnId: string } | null {
  return current ? { turnId: current.turnId } : null
}

export function stop(): boolean {
  if (!current) return false
  try {
    current.controller.abort()
  } catch {
    /* 已经断了 */
  }
  current = null
  return true
}

/** 引擎活着吗？活着才谈得上说话 */
export async function engineAlive(): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase()}/models`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

export function send(text: string): { turnId: string } {
  if (current) throw new Error('上一句还没回完 —— 等它，或者点「停」')
  const turnId = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  const controller = new AbortController()
  current = { turnId, controller }
  emit({ type: 'start', turnId })
  void run(turnId, text, controller)
  return { turnId }
}

async function run(turnId: string, text: string, controller: AbortController): Promise<void> {
  const t0 = Date.now()
  let said = ''
  try {
    const res = await fetch(`${apiBase()}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: text }], stream: true }),
      signal: controller.signal
    })

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '')
      throw new Error(`引擎回了 ${res.status}${detail ? `：${detail.slice(0, 400)}` : ''}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })

      let i: number
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue

        let msg: SseChunk
        try {
          msg = JSON.parse(payload) as SseChunk
        } catch {
          continue
        }
        // 有的实现把错误塞在流里而不是 HTTP 状态码里
        if (msg.error) {
          const m = typeof msg.error === 'string' ? msg.error : msg.error.message || JSON.stringify(msg.error)
          throw new Error(m)
        }
        const d = msg.choices?.[0]?.delta
        if (!d) continue
        if (typeof d.content === 'string' && d.content) {
          said += d.content
          emit({ type: 'delta', turnId, text: d.content })
        }
        if (Array.isArray(d.tool_calls)) {
          for (const tc of d.tool_calls) {
            emit({ type: 'tool', turnId, name: tc?.function?.name, args: tc?.function?.arguments })
          }
        }
      }
    }

    // 模型服务商挂了的话，nanobot 会把错误原文当回答给回来 —— 在这里拦住
    if (looksLikeProviderError(said)) {
      emit({
        type: 'error',
        turnId,
        providerDown: true,
        message: said.trim()
      })
      return
    }

    emit({ type: 'done', turnId, ms: Date.now() - t0 })
  } catch (e) {
    const err = e as Error
    const aborted = err?.name === 'AbortError'
    const engineDown = !aborted && /ECONNREFUSED|fetch failed|aborted/i.test(String(err?.message || ''))
    emit({
      type: 'error',
      turnId,
      engineDown,
      message: aborted ? '已停止' : String(err?.message || err)
    })
  } finally {
    if (current?.turnId === turnId) current = null
  }
}
