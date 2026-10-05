import * as vault from './vault'
import * as runner from './runner'

/**
 * 调度器 —— 到点真的会跑。
 *
 * 只认一种写法：**「每天 HH:MM」**。其他（「每 4 小时」「手动触发」）一律当手动。
 * 不引 cron 库：这一种写法的解析就是几行正则，引个库反而多一份要读的文档。
 *
 * 「今天这个点跑过没有」不去维护额外的状态文件，直接查 runs.json ——
 * 少一份状态，就少一处会不一致的地方。
 *
 * ⚠️ 一个刻意的决定：**错过太久不补跑**。超过 2 小时才启动应用，
 * 不会突然把早上的采集补起来 —— 那种「悄悄补跑」比不跑更让人困惑。
 */

const TICK_MS = 30_000
/** 迟到多久之内还算「该跑」，超过就跳过（补跑要人自己点） */
const GRACE_MS = 2 * 3600_000

let timer: NodeJS.Timeout | null = null
let log: (msg: string) => void = () => undefined

function parseDaily(schedule: string): { h: number; m: number } | null {
  const hit = /每天\s*(\d{1,2})[:：](\d{2})/.exec(String(schedule || ''))
  if (!hit) return null
  const h = Number(hit[1])
  const m = Number(hit[2])
  if (h > 23 || m > 59 || Number.isNaN(h) || Number.isNaN(m)) return null
  return { h, m }
}

function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function tick(): Promise<void> {
  const now = new Date()
  const today = localDay(now)
  const tasks = await vault.listTasks()
  const runs = await vault.listRuns()

  for (const t of tasks) {
    if (!t.enabled || !String(t.cmd || '').trim()) continue
    const at = parseDaily(t.schedule)
    if (!at) continue

    const due = new Date(now)
    due.setHours(at.h, at.m, 0, 0)
    if (now.getTime() < due.getTime()) continue // 还没到点
    if (now.getTime() - due.getTime() > GRACE_MS) continue // 迟到太久，不补

    const already = runs.some(
      (r) => r.taskId === t.id && localDay(new Date(r.at)) === today && new Date(r.at).getTime() >= due.getTime()
    )
    if (already) continue

    try {
      log(`到点触发「${t.name}」`)
      await runner.start(t.id, 'schedule')
    } catch (e) {
      log(`「${t.name}」没跑起来：${(e as Error).message}`)
    }
  }
}

export function start(onLog: (msg: string) => void): void {
  log = onLog
  if (timer) return
  timer = setInterval(() => void tick().catch(() => undefined), TICK_MS)
  void tick().catch(() => undefined)
  log(`调度器已起（每 ${TICK_MS / 1000} 秒看一次）`)
}

export function stop(): void {
  if (timer) clearInterval(timer)
  timer = null
}
