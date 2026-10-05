import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn, ChildProcess } from 'node:child_process'
import { app } from 'electron'
import { getVault, writeEnvMemory } from './vault'

/**
 * nanobot 引擎管家 —— 把引擎「收编」进工作台，不单独开窗口。
 *
 * 只做三件事：
 *   1. 配置桥：读写 ~/.nanobot/config.json（只碰我们关心的键，其余原样保留）
 *   2. 进程管家：随工作台起停 `nanobot gateway`
 *   3. MCP 登记：把工作台自己的 mcp-server 挂进引擎（三处同源）
 *
 * 从可复用包 03-bot/electron/nanobot.js 精简而来，去掉了日记业务的
 * 记忆回灌 / 后台整理 / 画像 / IM 平台通道，只留管家核心。
 */

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const NB_DIR = path.join(HOME, '.nanobot')
const NB_CONFIG = path.join(NB_DIR, 'config.json')

/** 引擎自己的配置目录 —— 设置页「高级」里给了个「打开」按钮，用户去那儿改细项 */
export function configDir(): string {
  return NB_DIR
}

const WS_PORT = 8765
// ⚠️ MCP 键名必须带应用前缀！
// nanobot 的配置是**全局共享**的（~/.nanobot/config.json）。可复用包那一脉的
// 「个人工作台」用的是 `workbench` —— 同名的话后启动的会把先启动的覆盖掉。
// 更坏的是两边工具**重名**（read_note / write_note / ui_snapshot / ui_act / screen_text），
// 同时加载时模型可能就去写隔壁的库了。
const MCP_KEY = 'automation-workbench'
// 预设（用哪个模型）反而是**故意共享**的：同一个 provider、同一把 key，
// 分成两份只会让两边抢 agents.defaults.modelPreset 这个字段。
const PRESET = 'workbench'
const API_PORT = 8900
/**
 * 一整轮的墙钟上限（秒）—— 传给引擎的 `--timeout`。
 *
 * 为什么不是默认的 120：那是「一次请求」的上限，助手在对话里跑个两分钟的采集
 * 就会被整轮掐断（真实踩过，话断在半句上）。10 分钟够它把话说完；
 * 真要跑半小时的活儿，规矩是挂成任务（见 AGENTS.md），那条路不受这个限制。
 */
const REQUEST_TIMEOUT_S = 600
/** 单次模型调用的上限（秒）—— 引擎的同名环境变量。比请求上限短一截，先于它失败更好定位 */
const MODEL_TIMEOUT_S = 300
const LOG_LINES = 300

/**
 * 联网搜索用哪个源。
 *
 * nanobot 默认是 `duckduckgo`，但那一路在本机**走不通**（实测：它内部用 `ddgs`，
 * 去问 search.yahoo.com，直接超时）。而 nanobot 自己早有免 key 的免费通道：
 * `keenable` 不带 key 时会走 `…/v1/search/public`，实测 200 且返回真结果
 * （用 nanobot 自己的 `WebSearchTool` 跑通，不是只 ping 了接口）。
 *
 * **只在本应用的派生配置里改**，不动共享配置 —— 隔壁「个人工作台」用哪个源是它的事。
 */
const SEARCH_PROVIDER = 'keenable'

/**
 * 关掉 web_fetch 的 Jina Reader 前置。
 *
 * nanobot 默认 `useJinaReader: true`，抓任何页面都先试一次 `r.jina.ai`。
 * 本机实测：**它不通，而且每次要白等 16.7 秒**才回退到本地解析。
 * 一次调研抓五个页面 = 白等 80 多秒 —— 对「先调研再动手」是致命的。
 * 回退路径（readability / json）本身是好的，所以直接关掉前置。
 */
const FETCH_USE_JINA = false

let pythonExe: string | null = null
/* Python 版本顺手存在这儿 —— 下面那次探测本来就要跑，
   直接多拿一个值，不给 status() 再添一次进程启动的开销。 */
let pythonVer: string | null = null
let child: ChildProcess | null = null
/* 亲手拉起它时记下时刻 —— 「已经跑了多久」是判断该不该重启的依据。
   外部已经在跑的进程不写这里：不知道它跑了多久，就不编一个数字出来。 */
let startedAt: number | null = null
let logRing: string[] = []
/**
 * 引擎状态。
 *
 * ⚠️ `reason` 是给**界面**看的（渲染层按它查词条），`message` 是给**日志**看的。
 *   以前只有 `message`，而且是中文句子 —— 切英文界面就会冒出中文（测试报告 #4）。
 *   有 reason 的场合一律用 reason，message 只在意外错误时兜底（里面带异常原文）。
 */
let state: {
  state: 'stopped' | 'starting' | 'running' | 'error'
  message: string
  reason?: string
  detail?: string
} = {
  state: 'stopped',
  message: ''
}
/* 引擎意外退出后自动拉起的次数。主动 stop / 正常跑起来都会清零 ——
 * 只有「我们没让停、它自己崩了」才累加，到上限就停手，避免坏配置刷屏重启。 */
let crashRestarts = 0
const MAX_CRASH_RESTARTS = 3
/** 拉起之后等它真的在监听的时间 —— 超了就当失败（消息里的秒数也从这取） */
const WAIT_MS = 30_000

/* ---------------- 小工具 ---------------- */

function pushLog(line: string): void {
  const text = String(line).replace(/\r?\n$/, '')
  if (!text.trim()) return
  for (const l of text.split(/\r?\n/)) {
    logRing.push(l)
    if (logRing.length > LOG_LINES) logRing.shift()
  }
}

/**
 * 给引擎 / 探测子进程的环境变量。**隔离**就是这一段的全部目的。
 *
 * 用户机器上可能自己也装着 Python、nanobot、改过 pip 配置 —— 我们一律不读它的，也不写它的：
 *   - `PYTHONNOUSERSITE`：不读用户自己的 user site-packages
 *     （否则他随便哪个 `pip install --user` 都可能顶替掉我们随包带的库）
 *   - `PYTHONPATH` / `PYTHONHOME`：外部注入会把我们自己的标准库指走，必须清掉
 *   - `PYTHONSTARTUP`：交互模式下会抢先跑用户的脚本
 *   - `PIP_*`：别让用户的 pip 配置影响我们（比如 `require-virtualenv` 会让安装直接失败）
 * `PYTHONIOENCODING` / `PYTHONUTF8` 要留着：Windows 上不设就一定乱码。
 */
function engineEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    PYTHONNOUSERSITE: '1'
  }
  for (const k of [
    'PYTHONPATH',
    'PYTHONHOME',
    'PYTHONSTARTUP',
    'PIP_CONFIG_FILE',
    'PIP_REQUIRE_VIRTUALENV'
  ]) {
    delete env[k]
  }
  return env
}

/** 跑一条命令拿输出。
 *  ⚠️ **默认就带超时**：探测路径上任何一个解释器卡住，都会把「启动引擎」这一步一起拖死
 *  （真踩过 —— 用户机器上一个坏掉的 `python.exe` 能把启动挂住 30 秒以上）。 */
function run(
  cmd: string,
  args: string[],
  opts: { timeout?: number } = {}
): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: true, env: engineEnv() })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      try {
        p.kill()
      } catch {
        /* ignore */
      }
    }, opts.timeout ?? 15000)
    p.stdout?.on('data', (d) => (out += d.toString()))
    p.stderr?.on('data', (d) => (err += d.toString()))
    p.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: -1, out, err: err + e.message })
    })
    p.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, out, err })
    })
  })
}

/** 跑一条 nanobot 子命令。
 * python 路径的解析和兜底只在这一处 —— 别处不要自己 spawn，不然又是一份
 * 「哪台机器上 Python 在哪」的重复判断。 */
export async function runCli(
  args: string[],
  opts: { timeout?: number } = {}
): Promise<{ code: number; out: string; err: string }> {
  const py = await resolvePython()
  if (!py) return { code: -1, out: '', err: '本机没有可用的 Python' }
  return run(py, ['-m', 'nanobot', ...args], opts)
}

/** 跑一段 Python 片段（`-c`）。
 *  给「引擎只给了 Python API、CLI 里没有对应子命令」的功能用（配对就是）。
 *  ⚠️ 输出必须是**纯 ASCII**（`json.dumps` 默认如此）：这段不经过 `python -m nanobot`，
 *     也就拿不到 CLI 开头那段 win32 强制 utf-8 的 reconfigure。 */
export async function runPy(
  script: string,
  args: string[] = [],
  opts: { timeout?: number } = {}
): Promise<{ code: number; out: string; err: string }> {
  const py = await resolvePython()
  if (!py) return { code: -1, out: '', err: '本机没有可用的 Python' }
  return run(py, ['-c', script, ...args], opts)
}

/** 同上，但把子进程交回去 —— 给「要边跑边读输出」的用（比如扫码登录）。
 *  ⚠️ `-u` 必须加：不加的话 Python 会缓冲 stdout，那些二维码块字会卡在缓冲区里，
 *     界面上就是长时间一片空白，然后一次性全吐出来 —— 扫码根本来不及。 */
export async function spawnCli(args: string[]): Promise<ChildProcess | null> {
  const py = await resolvePython()
  if (!py) return null
  return spawn(py, ['-u', '-m', 'nanobot', ...args], {
    windowsHide: true,
    env: engineEnv()
  })
}

/** 源配置（`~/.nanobot/config.json`）—— 用户级那份，渠道开关写这里。
 *  ⚠️ 不能写派生配置：`refreshRuntimeConfig()` 每次启动都从这份重算，写那份会被冲掉。 */
export function readSourceConfig(): Record<string, any> | null {
  return readConfigRaw()
}

export function writeSourceConfig(obj: unknown): void {
  writeConfigRaw(obj)
}

function deepMerge(base: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = base && typeof base === 'object' && !Array.isArray(base) ? { ...(base as Record<string, unknown>) } : {}
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMerge(out[k], v as Record<string, unknown>)
    } else if (v !== undefined) {
      out[k] = v
    }
  }
  return out
}

function readConfigRaw(): Record<string, any> | null {
  try {
    return JSON.parse(fs.readFileSync(NB_CONFIG, 'utf8'))
  } catch {
    return null
  }
}

function writeConfigRaw(obj: unknown): void {
  fs.mkdirSync(NB_DIR, { recursive: true })
  fs.writeFileSync(NB_CONFIG, JSON.stringify(obj, null, 2), 'utf8')
}

/* ---------------- 环境探测 ---------------- */

/**
 * 随包带的那份 Python 在哪。
 *
 * 装完之后用户机器上**不需要装 Python**：`resources/engine/` 里是一份完整的
 * 独立 Python（uv 拉的 standalone，stdlib 齐、自带 pip），由 `extraResources` 打进包。
 * 开发模式下也认这个目录（`resources/engine`），方便先在本机验一遍。
 */
function bundledEngineDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'engine')
    : path.join(app.getAppPath(), 'resources', 'engine')
}

/** 在引擎目录里找 python.exe（浅的优先：uv 会把它放在 `cpython-3.13.x-.../` 下）。 */
function findBundledPython(): string | null {
  const root = bundledEngineDir()
  const hits: string[] = []
  const walk = (dir: string, depth: number): void => {
    if (depth > 3) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) walk(abs, depth + 1)
      else if (/^python\.exe$/i.test(e.name)) hits.push(abs)
    }
  }
  walk(root, 0)
  return hits.sort((a, b) => a.split(path.sep).length - b.split(path.sep).length)[0] || null
}

/** 一个目录下按前缀找子目录（不引第三方 glob：Electron 31 带的 Node 还没有 fs.globSync）。 */
function subdirs(parent: string, prefix: string): string[] {
  try {
    return fs
      .readdirSync(parent, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith(prefix))
      .map((e) => path.join(parent, e.name))
  } catch {
    return []
  }
}

/**
 * 所有**可能**装着 Python 的地方，随包引擎排第一。
 *
 * 为什么要列这么多：「明明装了 nanobot 却检测不到」基本都栽在这一步 ——
 * 用户机器上常常同时躺着三个 Python（商店版 / 官网版 / uv 拉的那份），
 * 而 nanobot 只装在其中一个里，PATH 上排第一的那个偏偏没有。
 * 所以下面不是「找到第一个 3.x 就收工」，而是**把候选挨个问一遍，谁能跑 nanobot 就用谁**。
 */
function candidatePythons(): string[] {
  const out: string[] = []
  const bundled = findBundledPython()
  if (bundled) out.push(bundled)
  out.push(
    ...(process.platform === 'win32'
      ? ['python.exe', 'python3.exe', 'py.exe', 'python', 'py']
      : ['python3', 'python'])
  )
  if (process.platform === 'win32') {
    const home = process.env.USERPROFILE || ''
    const lad = process.env.LOCALAPPDATA || ''
    const probes: [string, string][] = [
      [path.join(lad, 'Programs', 'Python'), 'Python3'],
      [path.join(lad, 'uv', 'python'), 'cpython-3'],
      [path.join(home, '.local', 'bin'), 'python3'],
      ['C:\\', 'Python3']
    ]
    for (const [parent, prefix] of probes) {
      for (const d of subdirs(parent, prefix)) {
        const exe = path.join(d, 'python.exe')
        if (fs.existsSync(exe)) out.push(exe)
      }
    }
    const store = path.join(lad, 'Microsoft', 'WindowsApps', 'python.exe')
    if (fs.existsSync(store)) out.push(store)
  }
  return [...new Set(out)]
}

/** 最后选中的那个 Python 是随包引擎还是用户自己装的 —— 界面和日志要能说出来。 */
let pythonSource: 'bundled' | 'system' | null = null

export function engineSource(): 'bundled' | 'system' | null {
  return pythonSource
}

const VER_PROBE = 'import sys;print(".".join(map(str,sys.version_info[:3])))'

async function resolvePython(): Promise<string | null> {
  if (pythonExe) return pythonExe
  const bundled = findBundledPython()
  let fallback: { exe: string; ver: string } | null = null
  for (const c of candidatePythons()) {
    const r = await run(c, ['-c', VER_PROBE], { timeout: 8000 })
    if (r.code !== 0 || !r.out.trim().startsWith('3')) continue
    const ver = r.out.trim()
    const n = await run(c, ['-m', 'nanobot', '--version'], { timeout: 20000 })
    if (n.code === 0 && /nanobot/i.test(n.out + n.err)) {
      pythonExe = c
      pythonVer = ver
      pythonSource = c === bundled ? 'bundled' : 'system'
      return c
    }
    if (!fallback) fallback = { exe: c, ver }
  }
  if (fallback) {
    pythonExe = fallback.exe
    pythonVer = fallback.ver
    pythonSource = fallback.exe === bundled ? 'bundled' : 'system'
    return fallback.exe
  }
  return null
}

async function probe(): Promise<{
  python: string | null
  pyVersion: string | null
  installed: boolean
  version: string | null
  /** 引擎是随包带来的，还是用户机器上自己的 —— 设置页用它说清「现在跑的是哪份」 */
  source: 'bundled' | 'system' | null
}> {
  const py = await resolvePython()
  if (!py) return { python: null, pyVersion: null, installed: false, version: null, source: null }
  const r = await run(py, ['-m', 'nanobot', '--version'])
  const text = `${r.out}${r.err}`
  const m = text.match(/v?(\d+\.\d+\.\d+)/)
  const installed = r.code === 0 && /nanobot/i.test(text)
  return {
    python: py,
    pyVersion: pythonVer,
    installed,
    version: installed && m ? m[1] : null,
    source: pythonSource
  }
}

async function ensureConfig(): Promise<boolean> {
  if (fs.existsSync(NB_CONFIG)) return true
  const py = await resolvePython()
  if (!py) return false
  pushLog('[引擎] 首次运行，生成 nanobot 默认配置…')
  const r = await run(py, ['-m', 'nanobot', 'onboard', '--workspace', getVault(), '--refresh'])
  pushLog(r.out + r.err)
  return fs.existsSync(NB_CONFIG)
}

/**
 * 探一次本机 Python 环境，写进库里的 `memory/MEMORY.md`。
 *
 * **提示词里不能写死「本机装了哪些库」** —— 那是某台机器的事实。换台机器，
 * 助手会照着自己脑子里的清单「不用问」直接 import，然后炸在一个它以为不存在的问题上。
 * 所以真实清单由这里产出，AGENTS.md 只负责说「去看那段」。
 */
export async function refreshEnvDoc(): Promise<void> {
  try {
    const py = await resolvePython()
    if (!py) return
    const v = await run(py, ['-c', 'import sys;print(".".join(map(str,sys.version_info[:3])))'])
    const r = await run(py, [
      '-u',
      '-m',
      'pip',
      'list',
      '--format=freeze',
      '--disable-pip-version-check'
    ])
    const packages =
      r.code === 0
        ? r.out
            .split(/\r?\n/)
            .map((s) => s.trim().split('==')[0])
            .filter(Boolean)
        : []
    await writeEnvMemory({ python: py, version: v.code === 0 ? v.out.trim() : '', packages })
  } catch {
    /* 探不到就算了 —— 这不该影响启动 */
  }
}

/* ---------------- 配置桥（设置页只认四个字段） ---------------- */

export function engineSettings(): { baseURL: string; apiKey: string; model: string; workspace: string } {
  const cfg = readConfigRaw() || {}
  const provider = cfg?.providers?.custom || {}
  const preset = cfg?.modelPresets?.[PRESET] || {}
  return {
    baseURL: provider.apiBase || '',
    apiKey: provider.apiKey || '',
    model: preset.model || '',
    /* ⚠️ 这里**不能**读 `agents.defaults.workspace`：
       那是**共享配置**里的全局字段，我们故意不写它（写了会抢走隔壁应用的库根），
       所以它要么是空、要么是别人的路径 —— 两种都不能往界面上显示。
       真正在用的那个写在派生配置里，取值就是 getVault()。 */
    workspace: getVault()
  }
}

export async function saveSettings(patch: Record<string, unknown> = {}): Promise<ReturnType<typeof engineSettings>> {
  if (!(await ensureConfig())) throw new Error('还没装 nanobot，先点「安装」')

  const cfg = readConfigRaw() || {}
  const merged = deepMerge(cfg, {
    // 注意：这里**不写** agents.defaults.workspace —— 那个字段是全局的，
    // 写了就会把隔壁应用的库根抢过来。我们的库根只写进派生配置。
    agents: { defaults: { modelPreset: PRESET, fallbackModels: [] } },
    providers: {
      custom: {
        ...(patch.baseURL !== undefined ? { apiBase: patch.baseURL } : {}),
        ...(patch.apiKey !== undefined ? { apiKey: patch.apiKey } : {})
      }
    },
    modelPresets: {
      [PRESET]: {
        provider: 'custom',
        ...(patch.model !== undefined ? { model: patch.model } : {})
      }
    }
  }) as any

  // 地址/模型必须成对存在，否则 nanobot 会静默走回它自己的默认模型
  if (!merged.modelPresets[PRESET].model) delete merged.modelPresets[PRESET]
  if (!merged.modelPresets[PRESET] && merged.agents?.defaults) merged.agents.defaults.modelPreset = null
  if (!merged.providers.custom.apiBase && !merged.providers.custom.apiKey) delete merged.providers.custom

  writeConfigRaw(merged)

  // ⚠️ 光写共享配置不够 —— 真踩过这个坑：
  //   用户在设置页换了 key，引擎还在用**上一次启动时派生出来的那份**，
  //   于是继续失败，而且报的是「API key 欠费」。用户会以为新 key 也是坏的。
  //   （派生配置是快照，共享配置变了它不会自己跟着变。）
  // 所以这里要**当场**重新派生；引擎在跑的话还得重启它，否则要等下次启动才生效。
  deriveConfig()
  if (child) {
    pushLog('[引擎] 配置变了，重启引擎让它用上新配置…')
    await restart()
  }
  return engineSettings()
}

/* ---------------- 进程管家 ---------------- */

function stateOf() {
  return { ...state, pid: child?.pid || null, since: startedAt }
}

/** 引擎现在是什么状态。**纯读内存、不打 HTTP** —— 闪屏要拿它每 200ms 轮一次，
 *  用 `status()` 的话每次都会多打一个健康检查请求。 */
export function stateName(): 'stopped' | 'starting' | 'running' | 'error' {
  return state.state
}

/** 我们真正要用的那个口子：OpenAI 兼容的 HTTP 对话接口（nanobot serve） */
async function isHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${API_PORT}/v1/models`, {
      signal: AbortSignal.timeout(1200)
    })
    return res.ok
  } catch {
    return false
  }
}

export function apiBase(): string {
  return `http://127.0.0.1:${API_PORT}/v1`
}

export async function start() {
  if (state.state === 'running' || state.state === 'starting') return stateOf()

  const env = await probe()
  if (!env.installed) {
    /* 随包引擎都在的情况下还报错，说明包坏了 —— 这句得让人知道该重装，
       而不是像以前那样一律说「没找到 Python」，把人送到错误的方向上去。 */
    const bundled = !!findBundledPython()
    state =
      env.python && !bundled
        ? { state: 'error', message: '这台机器上的 Python 里没有 nanobot', reason: 'noengine' }
        : bundled
          ? { state: 'error', message: '随包引擎跑不起来，重装一下应用', reason: 'brokenengine' }
          : { state: 'error', message: '没找到 Python 3', reason: 'nopython' }
    return stateOf()
  }

  if (await isHealthy()) {
    state = { state: 'running', message: '已在运行（沿用现有进程）', reason: 'already' }
    return stateOf()
  }

  await ensureConfig()
  ensureMcpServer()
  const cfgPath = deriveConfig()
  if (!cfgPath) {
    state = { state: 'error', message: '配置读不出来，去设置页看看', reason: 'badconfig' }
    return stateOf()
  }

  state = { state: 'starting', message: '' }
  logRing = []
  // 起 `serve`（OpenAI 兼容 HTTP API），**不起 gateway**：
  // gateway 是给 WebUI / 微信 / Telegram 那些渠道用的，我们一个都没接。
  // 少一个常驻 python 进程，也少一份「它到底在服务谁」的疑问。
  // --config 给的是派生配置：库根是我们的，工具白名单也只有我们自己。
  //
  // ⚠️ `--timeout` 是**整个请求**的上限（不是单条命令的），nanobot 默认 120 秒 ——
  // 实测踩过：助手把「跑全量采集」放在对话里跑，第 120 秒整轮被掐断，
  // 用户看到的是一句没说完的话，产物只跑了一半。
  // 放宽到 10 分钟：长活儿仍然该挂任务（AGENTS.md 写了），但不该因为一句话说久了就被砍。
  child = spawn(
    env.python!,
    [
      '-u', '-m', 'nanobot', 'serve',
      '--port', String(API_PORT),
      '--timeout', String(REQUEST_TIMEOUT_S),
      '--config', cfgPath
    ],
    {
      cwd: getVault(),
      windowsHide: true,
      env: {
        ...engineEnv(),
        // 同一件事的另一半：模型调用本身也有个 120 秒默认值，一起放宽
        NANOBOT_OPENAI_COMPAT_TIMEOUT_S: String(MODEL_TIMEOUT_S)
      }
    }
  )
  child.stdout?.on('data', (d) => pushLog(d.toString()))
  child.stderr?.on('data', (d) => pushLog(d.toString()))
  child.on('error', (e) => {
    state = { state: 'error', message: `起不来：${e.message}`, reason: 'startfailed', detail: String(e.message || '') }
    child = null
  })
  child.on('close', (code) => {
    pushLog(`[引擎] 进程退出（code=${code}）`)
    child = null
    if (state.state === 'stopped') return
    // 不是我们主动停的 —— 它崩了。有限次数自动拉起来，采集 / 对话才不会突然断供。
    if (crashRestarts < MAX_CRASH_RESTARTS) {
      crashRestarts++
      state = { state: 'error', message: '意外退出，自动重启中…', reason: 'restarting' }
      pushLog(`[引擎] 意外退出，${crashRestarts}/${MAX_CRASH_RESTARTS} 次自动拉起…`)
      void start()
      return
    }
      state = { state: 'error', message: `引擎反复退出（${MAX_CRASH_RESTARTS} 次），已停止自动重启`, reason: 'crashlimit', detail: String(MAX_CRASH_RESTARTS) }
  })

  // 等它真的在监听再报「运行中」
  const deadline = Date.now() + WAIT_MS
  while (Date.now() < deadline) {
    if (child === null) return stateOf()
    if (await isHealthy()) {
      state = { state: 'running', message: '' }
      startedAt = Date.now()
      crashRestarts = 0
      return stateOf()
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  state = { state: 'error', message: '等 30 秒还没起来，看下面日志', reason: 'timeout', detail: String(WAIT_MS / 1000) }
  return stateOf()
}

export async function stop() {
  const pid = child?.pid
  if (child) {
    pushLog('[引擎] 停止…')
    child.stdout?.removeAllListeners()
    child.stderr?.removeAllListeners()
    child.removeAllListeners('close')
    const dying = child
    child = null
    if (process.platform === 'win32' && pid) await run('taskkill', ['/pid', String(pid), '/T', '/F'])
    else dying.kill('SIGTERM')
  }
  crashRestarts = 0
  startedAt = null
  state = { state: 'stopped', message: '' }
  return stateOf()
}

export async function restart() {
  await stop()
  return start()
}

/** 退出时同步收尾：异步 taskkill 跑一半 Electron 就没了，会留野进程 */
export function killSync(): void {
  const pid = child?.pid
  if (!pid) return
  try {
    if (process.platform === 'win32') {
      require('node:child_process').spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
    } else {
      process.kill(pid, 'SIGTERM')
    }
  } catch {
    /* 收尾失败就算了 */
  }
  child = null
  crashRestarts = 0
  state = { state: 'stopped', message: '' }
}

/* ---------------- 给界面的门票 ---------------- */

export async function bootstrap() {
  const res = await fetch(`http://127.0.0.1:${WS_PORT}/webui/bootstrap`, {
    signal: AbortSignal.timeout(5000)
  })
  if (!res.ok) throw new Error(`拿不到引擎门票（HTTP ${res.status}）`)
  const info = (await res.json()) as Record<string, any>
  return {
    token: info.token,
    apiToken: info.api_token || '',
    wsPath: info.ws_path || '/',
    wsUrl: info.ws_url || `ws://127.0.0.1:${WS_PORT}/`,
    modelName: info.model_name || '',
    expiresIn: info.expires_in || 300
  }
}

/* ---------------- 安装 ---------------- */

export async function install() {
  const py = await resolvePython()
  if (!py) throw new Error('机器上没找到 Python 3，装不了')
    state = { state: 'starting', message: '正在装 nanobot…', reason: 'installing' }
  logRing = []
  const p = spawn(py, ['-u', '-m', 'pip', 'install', '--upgrade', 'nanobot-ai', ...(engineSource() === 'bundled' ? ['--break-system-packages'] : [])], {
    windowsHide: true,
    env: engineEnv()
  })
  p.stdout?.on('data', (d) => pushLog(d.toString()))
  p.stderr?.on('data', (d) => pushLog(d.toString()))
  const code = await new Promise<number>((r) => p.on('close', r))
    state = { state: 'stopped', message: code === 0 ? '装好了' : `装失败（code=${code}）`, reason: code === 0 ? 'installed' : 'installfailed', detail: code === 0 ? '' : String(code) }
  return { code, ...(await probe()) }
}

/* ---------------- 把工作台挂给引擎（MCP 三处同源） ---------------- */

/**
 * 引擎能操控工作台的入口：把工作台自己的 MCP server 登记进引擎。
 * ⚠️ 三处必须同源：agents.defaults.workspace / mcpServers.<KEY>.cwd /
 *    mcpServers.<KEY>.env.WORKBENCH_VAULT —— 少一处就会「A 库读、B 库写」。
 * 用 Electron 自己的可执行文件跑 mcp-server（ELECTRON_RUN_AS_NODE=1），
 * 不依赖用户机器上装没装 Node。
 * 键名用 MCP_KEY（带应用前缀），**不要去碰隔壁应用的那个键**。
 */
export function ensureMcpServer(): boolean {
  const cfg = readConfigRaw()
  if (!cfg) return false
  const entry = {
    command: process.execPath,
    args: [path.join(__dirname, 'agent', 'mcp-server.js')],
    env: { ELECTRON_RUN_AS_NODE: '1', WORKBENCH_VAULT: getVault() },
    cwd: getVault()
  }
  const cur = cfg.tools?.mcpServers?.[MCP_KEY]
  if (cur && JSON.stringify(cur) === JSON.stringify(entry)) return false
  cfg.tools = {
    ...(cfg.tools || {}),
    mcpServers: { ...(cfg.tools?.mcpServers || {}), [MCP_KEY]: entry }
  }
  writeConfigRaw(cfg)
  return true
}

/**
 * 派生一份**只属于本应用**的运行时配置。
 *
 * 为什么需要它：`~/.nanobot/config.json` 是全局的，隔壁「个人工作台」也用它。
 * 直接把共享配置交给引擎，会同时加载两边的 MCP server —— 而两边工具**重名**
 * （read_note / write_note / ui_snapshot / ui_act / screen_text），
 * 模型可能就去写隔壁的库了（DESIGN 5.1 那个「A 读 B 写」的跨应用版）。
 *
 * 做法：**完整拷贝共享配置，只改三处** —— 库根、工具白名单、搜索源。
 * 不自己从零拼一份「最小配置」：nanobot 有 schema 校验，缺字段会被直接拒（试过）。
 *
 * ⚠️ 文件必须放在**库外面**：放 `vault/runtime/` 下时，
 *    nanobot 会把配置所在目录当成 workspace，SessionManager 直接抛异常。
 */
function deriveConfig(): string | null {
  const cfg = readConfigRaw()
  if (!cfg) return null
  const out = JSON.parse(JSON.stringify(cfg)) as Record<string, any>
  out.agents = { ...(out.agents || {}) }
  out.agents.defaults = { ...(out.agents.defaults || {}), workspace: getVault() }
  out.tools = {
    ...(out.tools || {}),
    mcpServers: { [MCP_KEY]: (cfg.tools?.mcpServers as any)?.[MCP_KEY] },
    web: {
      ...(out.tools?.web || {}),
      search: { ...(out.tools?.web?.search || {}), provider: SEARCH_PROVIDER },
      fetch: { ...(out.tools?.web?.fetch || {}), useJinaReader: FETCH_USE_JINA }
    }
  }
  const p = path.join(path.dirname(getVault()), 'nanobot.json')
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(out, null, 2), 'utf8')
  return p
}

/**
 * 主动重写派生配置（启动时调一次）。
 * 引擎启动时也会写；提前写一份是为了让磁盘上那份永远是最新的 ——
 * 排查问题时读到的陈旧配置比没有配置更坑人。
 */
export function refreshRuntimeConfig(): string | null {
  return deriveConfig()
}

export function runtimeConfigPath(): string {
  return path.join(path.dirname(getVault()), 'nanobot.json')
}

/* ---------------- 状态 / 日志 ---------------- */

export async function status() {
  if (state.state === 'running' && !(await isHealthy())) {
    state = { state: 'error', message: '进程在但没在服务，试试重启', reason: 'unhealthy' }
  }
  const env = await probe()
  return { ...stateOf(), ...env, config: NB_CONFIG, apiPort: API_PORT }
}

export function logs(n = 80): string {
  // 引擎日志可能 echo 出 API key（配置报错时），推给渲染层前先打码
  return logRing.slice(-n).join('\n').replace(/sk-[A-Za-z0-9_-]{6,}/g, 'sk-***')
}

export { NB_CONFIG, WS_PORT, MCP_KEY, API_PORT }
