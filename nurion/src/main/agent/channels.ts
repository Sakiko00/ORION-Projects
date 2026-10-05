import type { ChildProcess } from 'node:child_process'
import * as nanobot from './nanobot'

/**
 * 渠道（微信 / QQ / 飞书 / 钉钉 / 邮件 / WhatsApp…）。
 *
 * ⚠️ **这里一行协议都不实现。**
 *   nanobot 自带 14 个渠道、扫码登录、消息投递和通知路由，我们只做三件事：
 *     1. 起停它的 gateway（`--background`，所以它不依赖我们这个进程活着）
 *     2. 把渠道状态读出来给设置页看
 *     3. 把扫码登录跑起来，把二维码交给界面
 *
 * 为什么走 CLI 而不是它 webui 那套 HTTP：
 *   webui 的对外面是 **WebSocket 消息协议**（`webui/ws_http.py` 把消息名映射到内部路由），
 *   而静态资源要单独 build —— 实测把 gateway 起起来之后 `/` 是 404，进不去它的界面。
 *   相对地，CLI 是稳定公开面：`channels status` 给状态，`channels login <name>` 会把
 *   二维码以 **ASCII 块字符**打到 stdout（实测过）。抓下来用等宽字体显示，手机照样能扫。
 *   代价是二维码没有图片版 —— 换来的是零依赖、走官方通道、不逆向任何协议。
 *
 * ⚠️ 渠道开关必须写 **`~/.nanobot/config.json`（源配置）**，不能写派生配置：
 *   `refreshRuntimeConfig()` 每次启动都从源配置重算派生那份，写它会被冲掉。
 *   写完要立刻再刷一次派生配置，否则磁盘上那份是旧的 —— 排查问题时会被它骗。
 */

/** 网关端口。避开 8900（引擎 API）/ 8765（WS）/ 8971（收警入口）。 */
const GATEWAY_PORT = 8901

export interface ChannelRow {
  /** 配置里的键：weixin / qq / feishu…（扫码登录要用它） */
  id: string
  /** CLI 给的显示名：WeChat / QQ / Feishu…（给人看的） */
  name: string
  enabled: boolean
}

export interface ChannelsState {
  /** 网关进程在不在跑。渠道靠它收发消息 —— 它不在，扫了码也是死的 */
  gateway: boolean
  pid: number | null
  port: number
  channels: ChannelRow[]
  /** CLI 没跑通时把原话带回来。别吞：这里失败的原因（没装 Python / 配置坏了）都很具体 */
  error?: string
}

/** CLI 显示名 → 配置键。大部分能靠「去掉非字母数字再转小写」对上，这三个对不上。 */
const ID_ALIAS: Record<string, string> = {
  microsoftteams: 'msteams',
  napcatqq: 'napcat',
  wechat: 'weixin'
}

/** 把 `channels status` 那张字符表解出来。
 *  ⚠️ 按 `│` 切，**不能按空格切** —— "Microsoft Teams" 和 "Napcat (QQ)" 里都有空格。 */
function parseChannelTable(text: string): ChannelRow[] {
  const rows: ChannelRow[] = []
  for (const raw of text.split(/\r?\n/)) {
    const parts = raw.split('│')
    if (parts.length < 3) continue
    const name = parts[1].trim()
    const mark = parts[2].trim()
    if (!name || name === 'Channel' || !/[A-Za-z]/.test(name)) continue
    const key = name.replace(/[^A-Za-z0-9]/g, '').toLowerCase()
    rows.push({ id: ID_ALIAS[key] || key, name, enabled: /[✓✔√]/.test(mark) })
  }
  return rows
}

/** 从 `gateway status/start/stop` 的输出里读 `Running:` 和 `PID:` */
function parseGateway(text: string): { running: boolean; pid: number | null } {
  const running = /^Running:\s*yes/im.test(text)
  const m = text.match(/^PID:\s*(\d+)/im)
  return { running, pid: m ? Number(m[1]) : null }
}

/**
 * 当前状态：网关 + 14 个渠道。
 * 渠道列表**以 CLI 为准**，不以配置文件为准 —— 配置里有 17 个键，但
 * telegram / slack / matrix 在当前安装里并不出现在 `channels status` 里
 * （要插件），照配置列出来会让用户去开一个开不了的东西。
 */
export async function load(): Promise<ChannelsState> {
  const cfg = nanobot.runtimeConfigPath()
  const [ch, gw] = await Promise.all([
    nanobot.runCli(['channels', 'status', '--config', cfg], { timeout: 20000 }),
    nanobot.runCli(['gateway', 'status', '--config', cfg], { timeout: 10000 })
  ])
  const text = ch.out + ch.err
  const g = parseGateway(gw.out + gw.err)
  const rows = parseChannelTable(text)
  /* 这行日志是给「渠道列表怎么是空的」这种问题留的 —— 没它就只能猜。
     列表以 CLI 为准，CLI 的表格一旦改版，这里会先掉到 0，日志能立刻看出来。 */
  console.log(`[渠道] 读到 ${rows.length} 个 · 网关 ${g.running ? 'on' : 'off'}`)
  return {
    gateway: g.running,
    pid: g.pid,
    port: GATEWAY_PORT,
    channels: rows,
    error: ch.code === 0 ? undefined : text.trim().slice(0, 400)
  }
}

/**
 * 起 / 停 / 重启网关。`--background` 是关键的：纳管的是**独立进程**，我们只是发号施令。
 *
 * ⚠️ **`start` 不是子命令！** `nanobot gateway` 只有 status / logs / stop / restart /
 *    install-service。要起它是**顶层那几条参数**：`nanobot gateway --background`。
 *    这里以前写的是 `['gateway', action, …]`，也就是 `gateway start` ——
 *    CLI 直接 `No such command 'start'` 退出 2，而结果**没人检查**，
 *    所以界面上永远只是「未启动」，谁也不说为什么。
 *    下游代价：用户扫完码在微信里发消息没人理 —— 因为网关根本没跑。
 *
 * ⚠️ 超时给到 90 秒而不是 40：引擎启动时如果发现某个**开着的**渠道缺 SDK
 *    （钉钉要 `dingtalk-stream`、飞书要 `lark-oapi`），它会**自己 pip install**
 *    （`ensure_enabled_channel_dependencies`）。第一次开这两个渠道会慢很久，
 *    40 秒会误判成失败。装不上它也只标记该渠道出错，不会拖垮整个网关。
 */
export async function gatewayAction(action: 'start' | 'stop' | 'restart'): Promise<ChannelsState> {
  const cfg = nanobot.runtimeConfigPath()
  const port = ['--port', String(GATEWAY_PORT)]
  const args =
    action === 'start'
      ? ['gateway', '--background', ...port, '--config', cfg]
      : ['gateway', action, ...port, '--config', cfg]
  const r = await nanobot.runCli(args, { timeout: 90000 })
  const state = await load()
  /* 失败就把 CLI 的原话挂上去（界面里 `.set-hint` 会显示）。
     不报的话「点了启动还是未启动」就是个没出口的谜 —— 已经有一个人栽在这上面了。 */
  if (r.code !== 0) {
    const why = (r.err || r.out || '')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-3)
      .join(' · ')
    return { ...state, error: why || `gateway ${action} 退出码 ${r.code}` }
  }
  return state
}

/**
 * 读某个渠道在**源配置**里的那一节（表单回填用）。
 * 返回的是原始对象 —— 里面混着布尔和数组，界面只挑自己要的几个键。
 */
export function getConfig(id: string): {
  ok: boolean
  config: Record<string, unknown>
  error?: string
} {
  const cfg = nanobot.readSourceConfig()
  if (!cfg) return { ok: false, config: {}, error: '读不到 ~/.nanobot/config.json' }
  const channels = (cfg.channels as Record<string, unknown>) || {}
  return { ok: true, config: (channels[id] as Record<string, unknown>) || {} }
}

/**
 * 改某个渠道的几个字段（开关也是它 —— `setEnabled` 就是 `setConfig(id, {enabled})`）。
 *
 * 写源配置 → 立刻重算派生配置。**不重启网关**：调用方（界面）自己决定要不要重启，
 * 因为一次表单保存里可能连着改好几处，中间重启几次纯属浪费。
 *
 * ⚠️ 只合并传进来的键，其余原样保留 —— 引擎那一节有十几个我们不管的开关
 * （streaming / allowFrom / groupPolicy…），整节覆盖会把用户的设置抹掉。
 */
export function setConfig(
  id: string,
  patch: Record<string, unknown>
): { ok: boolean; error?: string } {
  const cfg = nanobot.readSourceConfig()
  if (!cfg) return { ok: false, error: '读不到 ~/.nanobot/config.json' }
  const channels = { ...((cfg.channels as Record<string, unknown>) || {}) }
  channels[id] = { ...((channels[id] as Record<string, unknown>) || {}), ...patch }
  cfg.channels = channels
  try {
    nanobot.writeSourceConfig(cfg)
  } catch (e) {
    return { ok: false, error: `写配置失败：${(e as Error).message}` }
  }
  nanobot.refreshRuntimeConfig()
  return { ok: true }
}

/**
 * 开 / 关一个渠道。
 * 关掉时不去动网关 —— 少一次重启，而且其余渠道不该被连累。
 *
 * 打开时：**顺手确保网关在跑**。渠道收消息全靠它，不开的话就是
 * 「开关是绿的、码也扫了，发消息却没人理」—— 用户刚栽过一次。
 * 网关本来就在跑就不动它（没必要重启，会把别的渠道也断开重连）。
 */
export async function setEnabled(id: string, on: boolean): Promise<{ ok: boolean; error?: string }> {
  const written = setConfig(id, { enabled: on })
  if (!written.ok || !on) return written
  try {
    const cur = await load()
    if (cur.gateway) return written
    const started = await gatewayAction('start')
    return started.error ? { ok: true, error: started.error } : written
  } catch (e) {
    /* 起不来也不能把「开关已经写进去了」说成失败 —— 返回 ok，把原因带上 */
    return { ok: true, error: `渠道已打开，但网关没起来：${(e as Error).message}` }
  }
}

/* ---------------- 配对（谁可以跟助手说话） ----------------
 * 引擎对**陌生私聊**默认是「不回答，回一个配对码」（`BaseChannel._handle_message` 里
 * `is_allowed()` 不过就直接 return，消息根本到不了 agent）。
 * 码要拿去 WebUI 或者**另一个已经配对过的会话**里 `/pairing approve <码>` 才能生效 ——
 * 而第一次接的人两样都没有，于是就是“发消息没人理”。工作台得把这条路摆出来。
 *
 * ⚠️ 引擎没有对应的 CLI 子命令（`handle_pairing_command` 只服务于 chat 里的 `/pairing`），
 *    所以这里直接调它的 Python 模块 —— 那是公开 API，不是我们去改它的状态文件。
 *
 * ⚠️ 必须 `set_config_path`：`pairing.json` 的位置是从 config 路径推出来的
 *    （`store._store_path()` = `get_data_dir()/pairing.json`）。
 *    不设就会读到**另一个目录**下的空 store —— 我第一次查就是 0 条，差点以为码过期了。
 */
const PAIR_SCRIPT = [
  'import json,sys',
  'from pathlib import Path',
  'from nanobot.config.loader import set_config_path',
  'set_config_path(Path(sys.argv[1]))',
  'from nanobot.pairing import list_pending, approve_code, deny_code, revoke',
  'from nanobot.pairing.store import get_approved',
  'cmd = sys.argv[2]',
  'chans = [c for c in (sys.argv[5] if len(sys.argv) > 5 else "").split(",") if c]',
  'if cmd == "list":',
  '    print(json.dumps({"pending": list_pending(), "approved": {c: sorted(get_approved(c)) for c in chans}}))',
  'elif cmd == "approve":',
  '    print(json.dumps({"ok": approve_code(sys.argv[3]) is not None}))',
  'elif cmd == "deny":',
  '    print(json.dumps({"ok": deny_code(sys.argv[3])}))',
  'else:',
  '    print(json.dumps({"ok": bool(revoke(sys.argv[3], sys.argv[4]))}))'
].join('\n')

export interface PendingPair {
  code: string
  channel: string
  sender: string
  /** 还剩多少秒（已经过期的话是 0） */
  left: number
}

export interface PairingState {
  pending: PendingPair[]
  /** 渠道 → 已经允许的发送人。空数组也带上：界面要能看出来「这个渠道一个都没批」 */
  approved: Record<string, string[]>
  error?: string
}

async function runPair(args: string[]): Promise<Record<string, unknown> | null> {
  const r = await nanobot.runPy(PAIR_SCRIPT, [nanobot.runtimeConfigPath(), ...args], {
    timeout: 30000
  })
  if (r.code !== 0) return null
  const line = r.out.trim().split(/\r?\n/).filter(Boolean).pop()
  if (!line) return null
  try {
    return JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
}

/** 当前谁在等、谁已经能说话。渠道列表由调用方给（main 那边刚读过 `channels status`）。 */
export async function pairingState(ids: string[]): Promise<PairingState> {
  const got = await runPair(['list', '', '', ids.join(',')])
  if (!got) return { pending: [], approved: {}, error: '读不到配对状态' }
  const now = Date.now() / 1000
  const raw = Array.isArray(got.pending) ? (got.pending as Record<string, unknown>[]) : []
  return {
    pending: raw.map((p) => ({
      code: String(p.code ?? ''),
      channel: String(p.channel ?? ''),
      sender: String(p.sender_id ?? ''),
      /* 过期时间在**引擎那边**才算得准（同一个时钟），这里只做减法展示 */
      left: Math.max(0, Math.round(Number(p.expires_at ?? 0) - now))
    })),
    approved: (got.approved as Record<string, string[]>) || {}
  }
}

/** 批准 / 拒绝一个待配对；`revoke` 是把已经允许的人移出去。
 *  ⚠️ `revoke` 的参数顺序和另外两个**不一样**（引擎里是 `revoke(channel, sender_id)`）——
 *     统一成 `pairingAct(action, channel, arg)` 之后，在这里回头调对。 */
export async function pairingAct(
  action: 'approve' | 'deny' | 'revoke',
  channel: string,
  arg: string
): Promise<{ ok: boolean; error?: string }> {
  const got =
    action === 'revoke'
      ? await runPair(['revoke', channel, arg, ''])
      : await runPair([action, arg, channel, ''])
  if (!got) return { ok: false, error: '配对操作失败了（读不到引擎的回话）' }
  if (got.ok !== true) {
    return {
      ok: false,
      error:
        action === 'approve'
          ? '这个码已经过期或不存在了 —— 让对方再发一条消息，会得到一个新码'
          : '这条记录已经不在了（可能刚刚过期）'
    }
  }
  return { ok: true }
}

/* ---------------- 扫码登录 ---------------- */

let loginProc: ChildProcess | null = null

/** 二维码是块字符拼的（▀▄█ 加空格）。用它来判断一行是不是二维码。 */
const QR_BLOCK = /[▀▄█▌▐░▒▓]/

/**
 * 跑 `channels login <id>`，把输出分两类推给界面：
 *   `qr`  —— 二维码那一坨（等宽字体原样显示）
 *   `log` —— 其余（"正在等待扫码"这类）
 *
 * ⚠️ 一次只允许一个登录进程。上一个没退就再点一次，会同时有两个进程抢同一个
 *    渠道的凭据，扫描结果落到谁手上不确定。
 *
 * ⚠️ **账号已经登着的时候，这个命令不会生成二维码**：`login()` 一看盘上有凭据
 *    就立刻返回 True，只打一行标题、3 秒后 exit 0（实测）。
 *    所以界面必须把「exit 0 但一帧二维码都没收到」当成**「不用扫」**来读，
 *    而不是「扫完了」—— 否则浮层会在用户还没看到东西的时候自己关掉。
 *    要真的重新出码，得加 `--force`（它会跳过盘上那份凭据重新走扫码）。
 */
export async function loginStart(
  id: string,
  send: (msg: { kind: 'qr' | 'log' | 'done'; text: string; code?: number }) => void,
  force = false
): Promise<{ ok: boolean; error?: string }> {
  loginStop()
  const args = ['channels', 'login', id]
  if (force) args.push('--force')
  args.push('--config', nanobot.runtimeConfigPath())
  const proc = await nanobot.spawnCli(args)
  if (!proc) return { ok: false, error: '本机没有可用的 Python' }
  loginProc = proc

  let buf = ''
  const feed = (chunk: string): void => {
    buf += chunk
    const lines = buf.split(/\r?\n/)
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const t = line.replace(/\s+$/, '')
      if (!t) continue
      send({ kind: QR_BLOCK.test(t) ? 'qr' : 'log', text: t })
    }
  }
  proc.stdout?.on('data', (d: Buffer) => feed(d.toString('utf8')))
  proc.stderr?.on('data', (d: Buffer) => feed(d.toString('utf8')))
  proc.on('close', (code) => {
    if (buf.trim()) send({ kind: QR_BLOCK.test(buf) ? 'qr' : 'log', text: buf.trim() })
    if (loginProc === proc) loginProc = null
    send({ kind: 'done', text: '', code: code ?? -1 })
  })
  return { ok: true }
}

export function loginStop(): void {
  if (!loginProc) return
  try {
    loginProc.kill()
  } catch {
    /* 已经退了 */
  }
  loginProc = null
}
