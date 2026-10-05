import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as nanobot from './nanobot'
import type { RunEvent } from './runner'
import { getVault, readRunLog } from './vault'

/**
 * 出站推送 —— 「任务自己跑完 / 跑挂了，怎么让你知道」。
 *
 * ⚠️ **一行推送协议都不实现。**
 *   nanobot 自带 `/trigger`：在任意一个渠道（微信 / 飞书 / 钉钉…）里发一句
 *   `/trigger 工作台`，它就为**那个会话**建一条本地触发器，并回你一个 ID。
 *   之后 `nanobot trigger <ID> "话"` 就能把这句话送进那个会话。
 *   我们只做两件事：**知道那个 ID**、**在该说的时候调用它**。
 *   没有第二条推送路径 —— 少一套要维护的协议，也少一处要填的密钥。
 *
 * 触发器清单落在**库根**里（`<vault>/triggers/triggers.json`，格式见 nanobot 的
 * `triggers/local_store.py`）。之所以能直接读：引擎的 workspace 就是这个库
 * （派生配置里写的），所以**不用让用户手抄那串 ID**，把它绑过的会话列出来给他选。
 *
 * 推送时机：**只推定时自己跑的那一次**（`trigger === 'schedule'`）。
 *   手动跑 / 试跑你本人就在机器前面，正盯着看，推到手机上只是噪音。
 *   真正需要推送的只有一种情况：**没人在看的时候它出事了**。
 */

export interface TriggerRow {
  id: string
  name: string
  /** 绑在哪个渠道：weixin / feishu / dingtalk…（给人看的） */
  channel: string
  enabled: boolean
}

export interface PushState {
  /** 绑定的触发器 ID。空 = 不推送 */
  triggerId: string
  /** 引擎那边已经绑过的会话，给界面列出来选 */
  triggers: TriggerRow[]
}

function storePath(): string {
  return join(getVault(), 'triggers', 'triggers.json')
}

function configPath(): string {
  return join(getVault(), 'push.json')
}

/** 引擎绑过的会话。
 *  文件不存在 = 一条都没绑，**这不是错误**，只是「还没开始用」。 */
export async function listTriggers(): Promise<TriggerRow[]> {
  try {
    const raw = await readFile(storePath(), 'utf8')
    const data = JSON.parse(raw.replace(/^\uFEFF/, '')) as { triggers?: unknown }
    if (!Array.isArray(data?.triggers)) return []
    const rows: TriggerRow[] = []
    for (const item of data.triggers as unknown[]) {
      const t = item as Record<string, unknown>
      if (typeof t?.id !== 'string') continue
      rows.push({
        id: t.id,
        name: typeof t.name === 'string' && t.name ? t.name : t.id,
        channel: typeof t.channel === 'string' ? t.channel : '',
        enabled: t.enabled !== false
      })
    }
    return rows
  } catch {
    return []
  }
}

async function getBound(): Promise<string> {
  try {
    const raw = await readFile(configPath(), 'utf8')
    const v = (JSON.parse(raw.replace(/^\uFEFF/, '')) as { triggerId?: unknown }).triggerId
    return typeof v === 'string' ? v : ''
  } catch {
    return ''
  }
}

/** 绑定 / 解绑。传空串 = 关掉推送。 */
export async function setBound(triggerId: string): Promise<PushState> {
  const id = String(triggerId || '').trim()
  try {
    await writeFile(configPath(), JSON.stringify({ triggerId: id }), 'utf8')
  } catch {
    /* 写不进去就本次会话内生效 */
  }
  return state()
}

export async function state(): Promise<PushState> {
  const [triggerId, triggers] = await Promise.all([getBound(), listTriggers()])
  /* 绑定过的那个会话如果被删了（用户在渠道里 /trigger 撤销，或换了号），
     别在界面上显示成一个「已经绑好」的假象 —— 清掉。 */
  if (triggerId && triggers.length && !triggers.some((t) => t.id === triggerId)) {
    return { triggerId: '', triggers }
  }
  return { triggerId, triggers }
}

/** 把一句话送进绑定的那个会话。也用来做「发一条试试」。 */
export async function send(
  text: string,
  triggerId?: string
): Promise<{ ok: boolean; error?: string }> {
  const id = (triggerId || (await getBound())).trim()
  if (!id) return { ok: false, error: '还没绑定会话' }
  const body = String(text || '').trim()
  if (!body) return { ok: false, error: '没有要发的内容' }

  const r = await nanobot.runCli(['trigger', id, body, '--config', nanobot.runtimeConfigPath()], {
    timeout: 60_000
  })
  if (r.code === 0) return { ok: true }
  /* 失败原因原样带回去 —— 「ID 不存在」「网关卡住了」对用户是两件事，
     吞成一句「推送失败」等于让他自己去猜。 */
  const err = (r.err || r.out || '').trim().split(/\r?\n/).slice(-3).join('\n')
  return { ok: false, error: err || `退出码 ${r.code}` }
}

function secs(ms: number | undefined): string {
  const s = Math.max(0, Math.round((ms ?? 0) / 1000))
  if (s < 60) return `${s} 秒`
  const m = Math.floor(s / 60)
  const rest = s % 60
  return rest ? `${m} 分 ${rest} 秒` : `${m} 分钟`
}

/** 跑完 / 跑挂了要说的那句话。
 *  失败时**把最后一行输出带上** —— 「挂没挂」和「挂在哪」是两件事，
 *  在手机上你没法打开日志，所以那句话就是全部的信息量。 */
async function compose(e: RunEvent): Promise<string> {
  const name = `「${e.taskName}」`
  if (e.ok) {
    const files = e.artifacts || []
    const tail = files.length ? `\n产出 ${files.length} 个文件：${files.slice(0, 4).join('、')}` : ''
    return `✅ ${name}跑完了 · ${secs(e.ms)}${tail}`
  }
  let why = ''
  try {
    const lines = (await readRunLog(e.runId, 40)).map((l) => l.trim()).filter(Boolean)
    const last = lines[lines.length - 1] || ''
    if (last) why = `\n${last.length > 160 ? `${last.slice(0, 160)}…` : last}`
  } catch {
    /* 日志读不到就不带 —— 推送本身不该因为读日志失败而失败 */
  }
  return `❌ ${name}跑挂了 · 退出码 ${e.code ?? '?'}${why}`
}

/** 运行结束 → 该说就说。定时跑才推（理由见文件头）。 */
export async function notifyRun(e: RunEvent): Promise<void> {
  if (e.type !== 'exit') return
  if (e.trigger !== 'schedule') return
  if (!(await getBound())) return
  try {
    const r = await send(await compose(e))
    console.log(r.ok ? `[推送] 已通知：${e.taskName}` : `[推送] 没送出去：${r.error}`)
  } catch (err) {
    console.error('[推送] 出错：', err)
  }
}
