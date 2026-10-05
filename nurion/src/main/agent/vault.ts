import { promises as fs, realpathSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * 数据层 —— NURION 唯一读写入口。
 *
 * 沿用「工作台-可复用包」的三条底线：
 *   1. 数据是文件，不是数据库 —— 任务/机器人就存成 JSON 文件，肉眼可查
 *   2. 唯一读写层 —— 界面和 agent 都调这里，不另开后门
 *   3. 路径先规范化再判，越界 / 隐藏目录一律拒
 *
 * 库根：环境变量 WORKBENCH_VAULT 优先（mcp-server 被引擎 spawn 时由
 * ensureMcpServer 显式传入，保证「三处同源」）；否则回退到项目 data/ 目录。
 */

export function getVault(): string {
  return process.env.WORKBENCH_VAULT
    ? path.resolve(process.env.WORKBENCH_VAULT)
    : path.resolve(__dirname, '..', '..', 'data')
}

/**
 * 运行时记录：agent 日志、每次运行的输出、播种标记。
 *
 * ⚠️ 名字**不带点**。以前叫 `.workbench`，在资源管理器里是个隐藏目录 ——
 * 用户排障时要看的日志藏在最深的地方，这没道理。改名 `runtime`，一眼可见。
 */
function workDir(): string {
  return path.join(getVault(), 'runtime')
}

function agentLog(): string {
  return path.join(workDir(), 'agent.log')
}

// 不允许从库根读写的路径段（引擎自己的机器部件 / 运行时记录）
const HIDDEN = new Set([
  'app',
  'node_modules',
  'runtime',
  '.workbench', // 老库可能还有残留
  '.git',
  '.vscode',
  'out'
])

export interface Task {
  id: string
  name: string
  agent: string
  schedule: string
  enabled: boolean
  lastRun?: string
  status?: 'ok' | 'alert' | 'idle'
  /**
   * 要跑的命令行。**这一条就是「插件」的全部**：
   * 任何脚本（python / node / ps1）都是一条命令，不需要插件 SDK。
   * 里面的 {date} 会被换成当天 YYYY-MM-DD。留空 = 还没接线。
   */
  cmd?: string
  /** 工作目录（绝对路径）。不填就按库根。 */
  cwd?: string
}

export interface AgentInfo {
  id: string
  name: string
  status: 'online' | 'offline'
  taskCount: number
}

export class VaultError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function resolve(rel: string): string {
  if (typeof rel !== 'string' || !rel.trim()) throw new VaultError(400, '缺少路径')
  const norm = rel.replace(/\\/g, '/')
  const vault = getVault()
  const abs = path.resolve(vault, norm)
  if (abs !== vault && !abs.startsWith(vault + path.sep)) throw new VaultError(403, '路径越界')
  const parts = path.relative(vault, abs).split(path.sep)
  if (parts.some((seg) => seg.startsWith('.') || HIDDEN.has(seg))) {
    throw new VaultError(403, '这个路径不允许访问')
  }
  // 符号链接逃逸：startsWith 只是词法判断，库内的 symlink 可以指向库外。
  // realpath 解析掉所有 symlink 后再查一次；文件还不存在（写路径）就按原值放行。
  try {
    const real = realpathSync(abs)
    if (real !== abs && !real.startsWith(vault + path.sep)) {
      throw new VaultError(403, '符号链接指向库外，不允许访问')
    }
  } catch (e) {
    if (e instanceof VaultError) throw e
    // 文件不存在（ENOENT）等：交给后续读写去处理
  }
  return abs
}

async function readJSON<T>(rel: string, fallback: T): Promise<T> {
  const abs = resolve(rel)
  const raw = await fs.readFile(abs, 'utf8').catch(() => null)
  if (raw === null) return fallback
  try {
    // ⚠️ **必须先剥 BOM**：记事本、PowerShell 的 `Set-Content -Encoding UTF8`
    // 写出来都带 \uFEFF，JSON.parse 见到它直接抛。
    //
    // 这条不是洁癖 —— 真实踩过：解析失败 → 回退成 [] → ensureSeed 以为库是全新的
    // → 把 tasks.json 重新播种，**用户自己建的任务全没了**。
    // 数据文件的解析失败绝不能被当成「空」。
    return JSON.parse(raw.replace(/^\uFEFF/, '')) as T
  } catch (e) {
    // 文件在、但读不懂：这是**数据事故**，绝不能当「空」。
    // 当空会让下一次「读→改→写」把它覆盖掉 —— 用户可恢复的数据就永久没了。
    // 抛出去，让调用方看到明确的错；至少数据还在盘上等人来救。
    throw new VaultError(500, `${rel} 解析失败，数据可能已损坏：${(e as Error).message}`)
  }
}

async function exists(rel: string): Promise<boolean> {
  return fs
    .access(resolve(rel))
    .then(() => true)
    .catch(() => false)
}

/**
 * 写 JSON —— **原子写**：先写临时文件，再 rename 覆盖。
 *
 * 为什么必须这样：`fs.writeFile` 是「先截断、再写」，中间有一瞬间文件是空的
 * 或只有半截。同一时刻另一个进程（引擎的 MCP 子进程、或用户另开的工具）读它，
 * 拿到的就是残文件 —— 真撞上过：
 *   `[vault] tasks.json 解析失败：Unexpected end of JSON input`
 * 后果是任务列表突然变空、甚至被 ensureSeed 当成新库重新播种。
 *
 * rename 在同一卷上是原子的（POSIX rename / Windows MoveFileEx），
 * 读到旧内容或新内容，不会读到半截。
 *
 * ⚠️ 临时名必须**每次都不一样**。只带 pid 的话，同进程内的并发写会撞同一个名字：
 * 第一个 rename 成功后文件就没了，后面几个 rename 直接 ENOENT ——
 * 真踩过，界面连续存 chat.json 时控制台刷一排
 *   `ENOENT: rename 'chat.json.14988.tmp' -> 'chat.json'`
 * 加上自增序号后各写各的 tmp，最后谁 rename 成功谁生效（内容都是新的，无所谓顺序）。
 */
let tmpSeq = 0

async function writeJSON(rel: string, data: unknown): Promise<void> {
  const abs = resolve(rel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  const tmp = `${abs}.${process.pid}.${++tmpSeq}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  try {
    await fs.rename(tmp, abs)
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => undefined)
    throw e
  }
}

/* 进程内写串行化：所有「读→改→写」排队执行。
 * 不锁的话，两个并发调用读到同一份快照，后写的把先写的覆盖（lost update）。
 * 这只管主进程内的并发（runner / 调度 / IPC 都在这）。引擎的 MCP 子进程是独立
 * 进程，这里管不到，靠 writeJSON 的原子写保证不读到半截。 */
let writeChain: Promise<unknown> = Promise.resolve()

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn) // 前一个失败也要继续走，别让一次错卡死整条链
  writeChain = run.catch(() => undefined)
  return run
}

function newId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/* ---------------- 任务 ---------------- */

/**
 * 读出来的任务过一道归一。
 *
 * ⚠️ 老库里 `lastRun` 存过一个中文占位串（`'从未运行'`），而「没跑过」应该是**空值**：
 *   拿中文当哨兵值，改文案的人不会知道有代码在比对它 —— 一改就静默失效。
 *   调度值（`'手动触发'` / `'每天 08:30'`）**故意保留人话**，翻译在显示层做，
 *   理由写在 `renderer/components/studio-types.ts` 的 `scheduleText` 上。
 */
const NEVER = '从未运行'
/** 告警来源的老占位串（现在这个语义用空值 + 渲染层词条） */
const UNKNOWN = '未知来源'
/** 自己生成的失败告警的老标题 / 老正文（现在标题只存任务名） */
const OLD_FAIL_TITLE = /^「(.+)」执行失败$/
const OLD_FAIL_TEXT = /退出码 (-?\d+) · 耗时 ([\d.]+)s/
function normTask(t: Task): Task {
  return t.lastRun === NEVER ? { ...t, lastRun: '' } : t
}

function normAlert(a: Alert): Alert {
  if (a.source === UNKNOWN) return { ...a, source: '' }
  const m = OLD_FAIL_TITLE.exec(a.title || '')
  if (!m || a.source !== 'workbench') return a
  return { ...a, title: m[1], text: (a.text || '').replace(OLD_FAIL_TEXT, 'exit $1 · $2s') }
}

/**
 * 把老库里的中文哨兵串**落成数据**（幂等，只动那几个字段）。
 *
 * 为什么不能只在读的时候归一：那只让「这次读过的」干净，磁盘上还是旧串 ——
 * 别的读法（浏览器预览直接读文件、用户自己打开 tasks.json）看到的还是它。
 */
async function migrateLegacyStrings(): Promise<void> {
  const list = await readJSON<Task[]>('tasks.json', [])
  if (list.some((t) => t.lastRun === NEVER)) {
    await writeJSON(
      'tasks.json',
      list.map((t) => (t.lastRun === NEVER ? { ...t, lastRun: '' } : t))
    )
  }
  /* 告警：来源的空值化 + 「执行失败」标题取出任务名（两个迁移一起写，只落一次盘） */
  const alerts = await readJSON<Alert[]>('alerts.json', [])
  const fixed = alerts.map(normAlert)
  if (fixed.some((a, i) => a !== alerts[i])) {
    await writeJSON('alerts.json', fixed)
  }
}

export async function listTasks(): Promise<Task[]> {
  const list = await readJSON<Task[]>('tasks.json', [])
  return list.map(normTask)
}

export async function getTask(id: string): Promise<Task> {
  const tasks = await listTasks()
  const hit = tasks.find((t) => t.id === id)
  if (!hit) throw new VaultError(404, `没有这个任务：${id}`)
  return hit
}

export async function createTask(input: {
  name: string
  agent?: string
  schedule?: string
  cmd?: string
  cwd?: string
}): Promise<Task> {
  const name = String(input?.name || '').trim()
  if (!name) throw new VaultError(400, '任务名不能为空')
  return withLock(async () => {
    const tasks = await listTasks()
    const task: Task = {
      id: newId(),
      name,
      agent: String(input?.agent || '').trim(),
      schedule: String(input?.schedule || '').trim() || '手动触发',
      enabled: true,
      status: 'idle',
      lastRun: '',
      cmd: String(input?.cmd || '').trim() || undefined,
      cwd: String(input?.cwd || '').trim() || undefined
    }
    tasks.push(task)
    await writeJSON('tasks.json', tasks)
    return task
  })
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<Task> {
  return withLock(async () => {
    const tasks = await listTasks()
    const idx = tasks.findIndex((t) => t.id === id)
    if (idx < 0) throw new VaultError(404, `没有这个任务：${id}`)
    tasks[idx] = { ...tasks[idx], ...patch, id }
    await writeJSON('tasks.json', tasks)
    return tasks[idx]
  })
}

export async function deleteTask(id: string, allowDelete?: boolean): Promise<{ removed: string }> {
  return withLock(async () => {
    const tasks = await listTasks()
    if (!tasks.some((t) => t.id === id)) throw new VaultError(404, `没有这个任务：${id}`)
    if (!allowDelete) throw new VaultError(409, '删任务是不可逆操作，要删请显式带 allowDelete: true')
    await writeJSON(
      'tasks.json',
      tasks.filter((t) => t.id !== id)
    )
    return { removed: id }
  })
}

/** 一次跑完：记时间戳 + 状态，并往 runs.json 追加一条。**只有运行器调它。** */
export async function finishRun(
  id: string,
  result: {
    runId: string
    ok: boolean
    ms: number
    code: number
    artifacts?: string[]
    trigger?: Run['trigger']
  }
): Promise<Task> {
  const task = await getTask(id)
  const now = new Date()
  const two = (n: number) => String(n).padStart(2, '0')
  const stamp = `${two(now.getHours())}:${two(now.getMinutes())}`
  const updated = await updateTask(id, { lastRun: stamp, status: result.ok ? 'ok' : 'alert' })
  await appendRun({
    id: result.runId,
    taskId: id,
    taskName: task.name,
    at: now.toISOString(),
    ok: result.ok,
    ms: result.ms,
    code: result.code,
    ...(result.artifacts?.length ? { artifacts: result.artifacts } : {}),
    ...(result.trigger ? { trigger: result.trigger } : {})
  })
  return updated
}

/* ---------------- 运行历史 ----------------
 * 界面上那两块（今日时间轴 / 14 天热力图）的唯一数据源。
 * 任务名冗余存一份，是为了任务被删了历史还在。 */

export interface Run {
  id: string
  taskId: string
  taskName: string
  /** ISO 时间戳 */
  at: string
  ok: boolean
  /** 耗时毫秒 */
  ms: number
  /** 退出码；-1 = 压根没启动起来 */
  code: number
  /** 这一次跑**动过**了 output/ 下哪些文件（相对 output/ 的名字） */
  artifacts?: string[]
  /**
   * 谁让它跑的。
   * 加这个是因为真撞上过「任务比排的点早了两分钟跑」而查不出原因 ——
   * 有了它，下次同样的事一行就能定案（是调度错、还是别的东西在调）。
   */
  trigger?: 'schedule' | 'manual' | 'agent'
}

export async function listRuns(): Promise<Run[]> {
  return readJSON<Run[]>('runs.json', [])
}

/** 只追加、不重写：历史是可追溯的。超过 90 天自动滚掉，别让文件无限长 */
export async function appendRun(run: Run): Promise<void> {
  return withLock(async () => {
    const runs = await listRuns()
    const cut = Date.now() - 90 * 864e5
    runs.push(run)
    await writeJSON(
      'runs.json',
      runs.filter((r) => {
        const t = Date.parse(r.at)
        return Number.isNaN(t) ? true : t >= cut // 解析不了的时间戳不丢 —— 丢了就是静默删历史
      })
    )
  })
}

export function newRunId(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/* ---------------- 产物（output/） ----------------
 * **产物不做新概念：output/ 目录里的文件就是产物。**
 *
 * 为什么不让脚本声明「我产出了什么」：
 *   声明就会不一致（写了没落、落了没写）。文件系统才是唯一真相。
 *   要知道是**哪一次**跑出来的，就跑前跑后各拍一张快照 diff —— 见 runner.ts。
 *
 * 为什么展示方式由扩展名决定、不让脚本声明：
 *   脚本作者不该为了「能展示」多学一套协议。png 就是图、csv 就是表、md 就是文。
 */

export type ArtifactKind = 'image' | 'table' | 'text' | 'sheet' | 'other'

/** 单张图最大读 12MB —— base64 会再涨 1/3，再大就别往界面里塞了 */
const MAX_IMAGE = 12 * 1024 * 1024
/** 文本类最多回这么多字，防止把整个 50MB 日志灌进界面 */
const MAX_TEXT = 400 * 1024

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']
const SHEET_EXT = ['.xlsx', '.xls', '.docx', '.pdf', '.zip', '.csv'] // csv 另外判成 table

export function artifactKind(name: string): ArtifactKind {
  const ext = path.extname(name).toLowerCase()
  if (IMAGE_EXT.includes(ext)) return 'image'
  if (ext === '.csv' || ext === '.tsv') return 'table'
  if (['.md', '.txt', '.json', '.log', '.yaml', '.yml', '.ini', '.xml'].includes(ext)) return 'text'
  if (SHEET_EXT.includes(ext)) return 'sheet'
  return 'other'
}

/** 这些后缀点开就等于执行 —— 产物里出现它们一律不给开 */
const NEVER_OPEN = ['.exe', '.bat', '.cmd', '.ps1', '.scr', '.com', '.msi', '.vbs', '.js', '.lnk', '.reg']

export interface ArtifactMeta {
  /** 相对 output/ 的路径（子目录用 / 分隔） */
  name: string
  size: number
  updatedAt: string
  kind: ArtifactKind
}

function artifactPath(rel: string): string {
  const norm = String(rel || '').replace(/\\/g, '/').trim().replace(/^\/+/, '')
  if (!norm || norm.includes('..') || /^[a-zA-Z]:/.test(norm)) {
    throw new VaultError(400, '产物路径不合法')
  }
  // 复用 resolve()：越界 / 隐藏目录它已经拦了
  return resolve(`output/${norm}`)
}

/** 能不能用系统程序打开这个产物（执行类后缀不给开） */
export function canOpenArtifact(rel: string): boolean {
  return !NEVER_OPEN.includes(path.extname(rel).toLowerCase())
}

/** 给 shell.openPath 用的绝对路径 */
export function artifactAbsPath(rel: string): string {
  if (!canOpenArtifact(rel)) throw new VaultError(403, '这个类型的文件不给直接打开')
  return artifactPath(rel)
}

async function walk(dir: string, rel: string, out: ArtifactMeta[]): Promise<void> {
  const ents = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const e of ents) {
    if (e.name.startsWith('.')) continue
    const abs = path.join(dir, e.name)
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) {
      await walk(abs, r, out)
      continue
    }
    const st = await fs.stat(abs).catch(() => null)
    if (!st) continue
    out.push({
      name: r,
      size: st.size,
      updatedAt: st.mtime.toISOString(),
      kind: artifactKind(e.name)
    })
  }
}

/** output/ 下所有产物，新的在前 */
export async function listArtifacts(): Promise<ArtifactMeta[]> {
  const dir = path.join(getVault(), 'output')
  const out: ArtifactMeta[] = []
  await walk(dir, '', out)
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/**
 * 跑之前 / 之后拍一张快照，diff 出「这一次动了哪些文件」。
 * 用 size+mtime 一起比：只看 mtime 会在「同秒内改写」上翻车。
 */
export async function snapshotArtifacts(): Promise<Record<string, string>> {
  const dir = path.join(getVault(), 'output')
  const files: ArtifactMeta[] = []
  await walk(dir, '', files)
  const map: Record<string, string> = {}
  for (const f of files) map[f.name] = `${f.size}:${f.updatedAt}`
  return map
}

/** 读一个产物：图给 dataUrl，文/表给原文，xlsx 之类只给元信息（用系统程序打开） */
export async function readArtifact(
  rel: string
): Promise<ArtifactMeta & { text?: string; dataUrl?: string }> {
  const abs = artifactPath(rel)
  const st = await fs.stat(abs).catch(() => null)
  if (!st || !st.isFile()) throw new VaultError(404, `没有这个产物：${rel}`)

  const name = String(rel).replace(/\\/g, '/')
  const kind = artifactKind(name)
  const base: ArtifactMeta = { name, size: st.size, updatedAt: st.mtime.toISOString(), kind }

  if (kind === 'image') {
    if (st.size > MAX_IMAGE) return base
    const buf = await fs.readFile(abs)
    const ext = path.extname(name).toLowerCase()
    const mime =
      ext === '.svg'
        ? 'image/svg+xml'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.gif'
            ? 'image/gif'
            : ext === '.webp'
              ? 'image/webp'
              : ext === '.bmp'
                ? 'image/bmp'
                : 'image/png'
    return { ...base, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
  }

  if (kind === 'text' || kind === 'table') {
    const raw = await fs.readFile(abs, 'utf8').catch(() => '')
    return {
      ...base,
      text: raw.length > MAX_TEXT ? `${raw.slice(0, MAX_TEXT)}\n…（已截断）` : raw
    }
  }

  return base
}

/* ---------------- 运行日志（.workbench/runs/<id>.log） ----------------
 * 放 .workbench 而不是库根：这是运行时记录，不是用户的数据。 */

function runLogPath(runId: string): string {
  return path.join(workDir(), 'runs', `${runId}.log`)
}

export async function writeRunLog(runId: string, chunk: string): Promise<void> {
  try {
    const p = runLogPath(runId)
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.appendFile(p, chunk, 'utf8')
  } catch {
    /* 记不上日志不应让运行本身失败 */
  }
}

export async function readRunLog(runId: string, tail = 200): Promise<string[]> {
  // runId 是从外面传进来的 → 必须先拦，否则能靠 ../ 跳出 runs 目录
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(runId))) throw new VaultError(400, '运行 id 不合法')
  const raw = await fs.readFile(runLogPath(runId), 'utf8').catch(() => '')
  return raw.split(/\r?\n/).filter(Boolean).slice(-tail)
}

/* ---------------- 知识库（纯 Markdown） ----------------
 * 为什么是文件不是表：用户拿别的工具（Obsidian / 记事本）打开，看到的应该是同一份东西。
 * 这是 DESIGN 第 0 条 —— 数据是文件，不是数据库。所以这里只有 list/read/write/delete，
 * 没有「标签表」「引用表」那些东西。
 */

export interface NoteMeta {
  name: string
  /** 分类（kb/ 下的一级子目录名）。空 = 未分类 */  category?: string
  size: number
  updatedAt: string
}

const MD = '.md'

/** 分类名清理：去首尾斜杠，拒绝越界字符 */
function cleanCat(category: string): string {
  return String(category || '').trim().replace(/^\/+|\/+$/g, '')
}

function noteFile(name: string, category = ''): string {
  const clean = String(name || '').trim().replace(/\.md$/i, '')
  if (!clean || clean.length > 64) throw new VaultError(400, '笔记名要 1-64 个字')
  if (/[\\/:*?"<>|]/.test(clean) || clean.startsWith('.')) {
    throw new VaultError(400, '笔记名里有不能用的字符（\\ / : * ? " < > |）')
  }
  const cat = cleanCat(category)
  if (/[\\/:*?"<>|]/.test(cat) || cat.startsWith('.')) {
    throw new VaultError(400, '分类名里有不能用的字符（\\ / : * ? " < > |）')
  }
  // 交给 resolve 做越界检查，别自己拼路径
  return resolve(cat ? `kb/${cat}/${clean}${MD}` : `kb/${clean}${MD}`)
}

function noteName(name: string): string {
  return String(name || '').trim().replace(/\.md$/i, '')
}

export async function listNotes(): Promise<NoteMeta[]> {
  const root = path.join(getVault(), 'kb')
  const out: NoteMeta[] = []
  const addDir = async (dir: string, cat: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [] as Dirent[])
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      if (e.isDirectory()) continue // 分类只认一级，子目录里的不算
      if (!e.name.toLowerCase().endsWith(MD)) continue
      const abs = path.join(dir, e.name)
      const st = await fs.stat(abs).catch(() => null)
      if (!st) continue
      out.push({
        name: e.name.slice(0, -MD.length),
        category: cat || undefined,
        size: st.size,
        updatedAt: st.mtime.toISOString()
      })
    }
  }
  // 根 = 未分类；一级子目录 = 分类
  await addDir(root, '')
  const subs = await fs.readdir(root, { withFileTypes: true }).catch(() => [] as Dirent[])
  for (const s of subs) {
    if (s.isDirectory() && !s.name.startsWith('.')) await addDir(path.join(root, s.name), s.name)
  }
  // 最近改的排前面 —— 知识库的常用顺序就是这个
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function readNote(name: string, category = ''): Promise<NoteMeta & { text: string }> {
  const abs = noteFile(name, category)
  const text = await fs.readFile(abs, 'utf8').catch(() => null)
  if (text === null) throw new VaultError(404, `没有这篇笔记：${noteName(name)}`)
  return {
    name: noteName(name),
    category: cleanCat(category) || undefined,
    text,
    size: Buffer.byteLength(text, 'utf8'),
    updatedAt: new Date().toISOString()
  }
}

/**
 * 覆盖有内容的笔记必须显式放行 —— 这是 DESIGN 3.1 那条「破坏性操作默认拦」。
 * 界面上的编辑器自己会传 true（人正看着内容在改），agent 走工具层时必须自己带。
 */
export async function writeNote(
  name: string,
  text: string,
  overwrite = false,
  category = ''
): Promise<NoteMeta> {
  const abs = noteFile(name, category)
  const existing = await fs.readFile(abs, 'utf8').catch(() => null)
  if (existing !== null && existing.trim() && !overwrite) {
    throw new VaultError(409, `「${noteName(name)}」已经有内容了。要覆盖请显式带 overwrite: true`)
  }
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, String(text ?? ''), 'utf8')
  const st = await fs.stat(abs)
  return {
    name: noteName(name),
    category: cleanCat(category) || undefined,
    size: st.size,
    updatedAt: st.mtime.toISOString()
  }
}

export async function deleteNote(name: string, category = ''): Promise<{ removed: string }> {
  const abs = noteFile(name, category)
  const exists = await fs
    .access(abs)
    .then(() => true)
    .catch(() => false)
  if (!exists) throw new VaultError(404, `没有这篇笔记：${noteName(name)}`)
  await fs.rm(abs)
  return { removed: noteName(name) }
}

/* ---------------- 分类（kb/ 下的一级子目录） ---------------- */

export async function listCategories(): Promise<string[]> {
  const root = path.join(getVault(), 'kb')
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [] as Dirent[])
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort()
}

export async function createCategory(category: string): Promise<{ category: string }> {
  const c = cleanCat(category)
  if (!c || c.length > 32) throw new VaultError(400, '分类名要 1-32 个字')
  if (/[\\/:*?"<>|]/.test(c) || c.startsWith('.')) {
    throw new VaultError(400, '分类名里有不能用的字符（\\ / : * ? " < > |）')
  }
  await fs.mkdir(path.join(getVault(), 'kb', c), { recursive: true })
  return { category: c }
}

export async function renameCategory(
  from: string,
  to: string
): Promise<{ from: string; to: string }> {
  const f = cleanCat(from)
  const t = cleanCat(to)
  if (!f) throw new VaultError(400, '原分类名不能为空')
  if (!t || t.length > 32) throw new VaultError(400, '新分类名要 1-32 个字')
  if (/[\\/:*?"<>|]/.test(t) || t.startsWith('.')) {
    throw new VaultError(400, '新分类名里有不能用的字符')
  }
  if (f === t) return { from: f, to: t }
  const src = resolve(`kb/${f}`)
  const dst = resolve(`kb/${t}`)
  const exists = await fs
    .access(src)
    .then(() => true)
    .catch(() => false)
  if (!exists) throw new VaultError(404, `没有这个分类：${f}`)
  await fs.rename(src, dst)
  return { from: f, to: t }
}

export async function deleteCategory(
  category: string,
  allowDelete = false
): Promise<{ removed: string }> {
  const c = cleanCat(category)
  if (!c) throw new VaultError(400, '分类名不能为空')
  const dir = resolve(`kb/${c}`)
  const exists = await fs
    .access(dir)
    .then(() => true)
    .catch(() => false)
  if (!exists) throw new VaultError(404, `没有这个分类：${c}`)
  const files = await fs.readdir(dir).catch(() => [] as string[])
  if (files.length && !allowDelete) {
    throw new VaultError(409, `「${c}」下还有 ${files.length} 篇笔记，删分类要显式带 allowDelete: true`)
  }
  await fs.rm(dir, { recursive: true, force: true })
  return { removed: c }
}

/* ---------------- 召回（关键词全文检索） ----------------
 * 知识库会一直长，不能每次把整库塞进上下文 —— 那迟早撑爆，而且大部分跟当前任务无关。
 * 构建任务前先用它召回相关的几篇（只回片段），命中再用 read_note 读全文。
 * 两段式：上下文里永远只装「命中的」，不装「全部」。 */

export interface NoteHit {
  name: string
  category?: string
  /** 命中次数（多个关键词求和，用来排序） */
  hits: number
  /** 首个命中处的上下文片段 —— 够判断要不要读全文 */
  snippet: string
}

export async function searchNotes(query: string, n = 5): Promise<NoteHit[]> {
  const words = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 1)
  if (!words.length) return []
  const list = await listNotes()
  const hits: NoteHit[] = []
  for (const meta of list) {
    let text = ''
    try {
      text = (await readNote(meta.name, meta.category || '')).text
    } catch {
      continue
    }
    const lower = text.toLowerCase()
    let count = 0
    let first = -1
    for (const w of words) {
      let idx = lower.indexOf(w)
      while (idx !== -1) {
        count++
        if (first === -1) first = idx
        idx = lower.indexOf(w, idx + w.length)
      }
    }
    if (!count) continue
    const start = Math.max(0, first - 30)
    const snippet = text.slice(start, first + 70).replace(/\s+/g, ' ').trim()
    hits.push({ name: meta.name, category: meta.category, hits: count, snippet })
  }
  return hits.sort((a, b) => b.hits - a.hits).slice(0, n)
}

/* ---------------- 警 ----------------
 * 一条「警」= 一件**外面发生的事**：告警平台推来的、或者我们自己巡检发现的。
 *
 * 为什么不和 Run 合并成一张表：Run 记的是「我们跑了什么」，Alert 记的是「外面发生了什么」。
 * 合一以后就说不清「这条是采到的、还是被告知的」，而这两者的处置方式完全不同。
 */

export interface Alert {
  id: string
  at: string
  /** 谁报的：外部系统名；我们自己发现的写 'workbench' */
  source: string
  level: 'info' | 'warn' | 'error'
  title: string
  text: string
  /** 人（或 AI）处置过了 */
  ack: boolean
}

export function newAlertId(): string {
  return `al${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

/** 新的在前 —— 警列表只关心最近的 */
export async function listAlerts(n = 50): Promise<Alert[]> {
  const all = await readJSON<Alert[]>('alerts.json', [])
  /* 老库里的两个中文串（没人说来源的占位串、自己生成的「执行失败」标题）
     读的时候一并归一 —— 磁盘上的清理在启动时做（migrateLegacyStrings），
     但那要等下一次启动，这里先把界面兜住。 */
  return all.slice(-n).reverse().map(normAlert)
}

export async function appendAlert(a: Alert): Promise<void> {
  return withLock(async () => {
    const all = await readJSON<Alert[]>('alerts.json', [])
    all.push(a)
    const cut = Date.now() - 30 * 864e5
    // 留 500 条封顶：警是流水，不是账本
    await writeJSON(
      'alerts.json',
      all
        .filter((x) => {
          const t = Date.parse(x.at)
          return Number.isNaN(t) ? true : t >= cut
        })
        .slice(-500)
    )
  })
}

/**
 * 指纹：外部告警系统**重发是常态**，不去重的话一次故障能刷出几十条。
 * 只取正文前 200 字参与计算 —— 真正的差异都在开头，尾巴常带时间戳。
 */
export function alertFingerprint(source: string, title: string, text: string): string {
  return `${source}\u0000${title}\u0000${String(text).slice(0, 200)}`
}

export async function ackAlert(id: string, ack = true): Promise<Alert> {
  return withLock(async () => {
    const all = await readJSON<Alert[]>('alerts.json', [])
    const i = all.findIndex((x) => x.id === id)
    if (i < 0) throw new VaultError(404, `没有这条警：${id}`)
    all[i] = { ...all[i], ack }
    await writeJSON('alerts.json', all)
    return all[i]
  })
}

/* ---------------- 对话记录 ----------------
 * 只存「界面上看到的样子」。
 *
 * 为什么不直接读 nanobot 自己的会话文件（~/.nanobot/sessions/*.jsonl）：
 * 那是它的**内部结构**，版本一变就换形状；而我们要的只是「把页面恢复成原样」。
 * 存一份自己的、字段最少的，比耦合它的内部格式便宜得多。
 */

export interface ChatTurn {
  id: string
  role: 'you' | 'ai'
  text: string
  tools?: { name: string; args?: string }[]
  at: string
  error?: string
}

export async function readChat(): Promise<ChatTurn[]> {
  return readJSON<ChatTurn[]>('chat.json', [])
}

/**
 * 开一段新对话。
 *
 * ⚠️ **不能只清 chat.json**：记忆不在应用里。每轮只把当前这句发给引擎
 * （`messages: [{ role: 'user', content: text }]`），它记住上下文靠的是
 * `~/.nanobot/sessions/<hash>/<base64(会话键)>.jsonl`。只清显示层 = 假的新对话
 * —— 界面上空了，它照样记得前面聊过什么。
 *
 * 所以做两件事：① 把旧对话归档一份、再把 chat.json 清空；② 删掉引擎的会话文件。
 * 删文件还不够 —— 引擎把会话缓在内存里，**得重启**才真断（调用方负责重启）。
 */
export async function newChat(): Promise<{ archived: string | null; wiped: number }> {
  const dir = getVault()
  const src = path.join(dir, 'chat.json')
  const raw = await fs.readFile(src, 'utf8').catch(() => '')
  let archived: string | null = null
  if (raw.trim() && raw.trim() !== '[]') {
    /* 归档名用本地时间：用户自己打开目录找“上回那段”时，看的是本地钟 */
    const d = new Date()
    const p2 = (n: number): string => String(n).padStart(2, '0')
    archived =
      `chat-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}` +
      `-${p2(d.getHours())}${p2(d.getMinutes())}.json`
    await fs.writeFile(path.join(dir, archived), raw, 'utf8')
  }
  await writeJSON('chat.json', [])
  return { archived, wiped: await wipeEngineSessions() }
}

/** 删掉引擎的会话文件（记忆本体）。会话键是 base64，所以不去认名字 —— 只认后缀 */
async function wipeEngineSessions(): Promise<number> {
  const roots = [path.join(os.homedir(), '.nanobot', 'sessions'), path.join(workDir(), 'sessions')]
  let n = 0
  for (const root of roots) {
    const subs = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
    for (const sub of subs) {
      if (!sub.isDirectory()) continue
      const dir = path.join(root, sub.name)
      const files = await fs.readdir(dir).catch(() => [])
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue
        await fs.rm(path.join(dir, f), { force: true }).catch(() => undefined)
        n++
      }
    }
  }
  return n
}

export async function writeChat(turns: ChatTurn[]): Promise<void> {
  // 只留最近 200 条：对话是过程，不是账本
  await writeJSON('chat.json', turns.slice(-200))
}
/* ---------------- 脚本 ----------------
 * AI 写的、**可复用**的 Python 脚本放这儿。
 *
 * 为什么单独一个目录，不塞进 kb/：
 *   知识库是给人读的笔记，脚本是要被执行的资产 —— 混一起两边都不好找。
 *   而且 scripts/ 下的东西能直接被 `python scripts/x.py` 跑，kb/ 下的不能。
 *
 * 为什么文件名限 ASCII：脚本名会进命令行、进 URL、进日志，
 * 中文名在不同编码环境里迟早出事，而脚本名本来也不需要是中文。
 */

const SCRIPT_EXT = '.py'

export interface ScriptMeta {
  name: string
  size: number
  updatedAt: string
  /** 已经挂成任务的，记下任务 id —— 界面要显示「已接线」 */
  taskId?: string
}

function scriptFile(name: string): string {
  const clean = String(name || '').trim().replace(/\.py$/i, '')
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(clean)) {
    throw new VaultError(400, '脚本名只能用英文字母、数字、- 和 _（会进命令行，中文名迟早出编码问题）')
  }
  return resolve(`scripts/${clean}${SCRIPT_EXT}`)
}

function scriptName(name: string): string {
  return String(name || '').trim().replace(/\.py$/i, '')
}

export async function listScripts(): Promise<ScriptMeta[]> {
  const dir = path.join(getVault(), 'scripts')
  const files = await fs.readdir(dir).catch(() => [] as string[])
  const tasks = await listTasks()
  const out: ScriptMeta[] = []
  for (const f of files) {
    if (!f.toLowerCase().endsWith(SCRIPT_EXT) || f.startsWith('.')) continue
    const st = await fs.stat(path.join(dir, f)).catch(() => null)
    if (!st) continue
    const nm = f.slice(0, -SCRIPT_EXT.length)
    // 哪个任务在跑它？找 cmd 里含 scripts/<名>.py 的
    const owner = tasks.find((t) => (t.cmd || '').replace(/\\/g, '/').includes(`scripts/${nm}.py`))
    out.push({ name: nm, size: st.size, updatedAt: st.mtime.toISOString(), taskId: owner?.id })
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function readScript(name: string): Promise<ScriptMeta & { code: string }> {
  const abs = scriptFile(name)
  const code = await fs.readFile(abs, 'utf8').catch(() => null)
  if (code === null) throw new VaultError(404, `没有这个脚本：${scriptName(name)}`)
  const st = await fs.stat(abs)
  return {
    name: scriptName(name),
    code,
    size: st.size,
    updatedAt: st.mtime.toISOString()
  }
}

/** 和 writeNote 一个规矩：覆盖已有内容必须显式放行 */
export async function writeScript(name: string, code: string, overwrite = false): Promise<ScriptMeta> {
  const abs = scriptFile(name)
  const existing = await fs.readFile(abs, 'utf8').catch(() => null)
  if (existing !== null && existing.trim() && !overwrite) {
    throw new VaultError(409, `「${scriptName(name)}」已经存在了。要覆盖请显式带 overwrite: true`)
  }
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, String(code ?? ''), 'utf8')
  const st = await fs.stat(abs)
  return { name: scriptName(name), size: st.size, updatedAt: st.mtime.toISOString() }
}

export async function deleteScript(name: string): Promise<{ removed: string }> {
  const abs = scriptFile(name)
  const exists = await fs
    .access(abs)
    .then(() => true)
    .catch(() => false)
  if (!exists) throw new VaultError(404, `没有这个脚本：${scriptName(name)}`)
  await fs.rm(abs)
  return { removed: scriptName(name) }
}

/* ---------------- 构建：把一件事变成一条任务 ----------------
 *
 * 为什么要有这个东西：在这之前，「建一个任务」是**一轮对话就干完的事** ——
 * 它一口气查库、写脚本、试跑、挂任务，中途任何一步想歪了，你只能等它全干完才发现，
 * 然后全丢掉重来。用户的原话是「我提需求，ai测试，我测试」——
 * **AI 自己测完，得停一下等你测。**
 *
 * 所以这里把过程切成**固定的 6 步**，每步之间有一道**门槛**：
 * 它干完一步只能停在门槛上（`wait`），**放行只有人能做**（`passBuild`）。
 * 工具层（agent.ts）根本没给 AI 开 `passed` 这个口子 —— 这不是靠叮嘱，是靠接口形状。
 *
 * 为什么同时只允许一条：构建是「我正在跟你把这件事做实」，一次一件是自然的；
 * 而门槛需要你点头，两件并排等你就变成了排队。
 */

export type BuildState = 'todo' | 'doing' | 'wait' | 'passed' | 'rejected'

export interface BuildStep {
  i: number
  name: string
  /** 这一步在干什么（界面上给一行小字，不用解释也看得懂） */
  does: string
  state: BuildState
  /** 交出来的东西，一句人话 */
  note?: string
  /** 证据：脚本名 / 产物名 / 任务 id —— 点得开的，不是嘴上说的 */
  evidence?: string[]
  at?: string
}

export interface Build {
  id: string
  /** 这件事叫什么（第 1 步定的，后面显示在标题上） */
  title: string
  /** 用户最初那句话，原样留着 */
  brief: string
  /** 当前在第几步（1..6）；0 = 没有进行中的构建 */
  step: number
  state: BuildState
  /**
   * 停在门槛上时必须回的话 —— 三句：这一步干完了什么 / 下一步打算干什么 / 要你拍板什么。
   * 缺了它，你只能看到一个「等你点头」，却不知道该点什么头。
   */
  ask?: string
  steps: BuildStep[]
  history: { at: string; step: number; action: 'doing' | 'wait' | 'pass' | 'reject'; note?: string }[]
  /** 第 6 步挂上的任务 */
  taskId?: string
  taskName?: string
  finishedAt?: string
  createdAt: string
  updatedAt: string
}

/**
 * 固定的 6 步 —— **不分任务类型**。
 * 采集、报表、校验、通知，走的都是这六步；变的是每步交出来的东西，不是步数。
 *
 * 为什么不合并「试跑」和「验收」：用户说的是「ai测试，我测试」——
 * **它跑一次**和**你看过说行**是两件事。合成一步的话，它跑完就没你的事了，
 * 而这恰恰是最容易出「退出码 0 但数据全是 0」的地方。
 */
export const BUILD_STEPS: { name: string; does: string; handOver: string }[] = [
  { name: '接单', does: '把你那句话变成「一件事」', handOver: '一句话复述 + 要什么产物 + 多久跑一次' },
  { name: '摸底', does: '查库、查已有脚本、看别人怎么做的', handOver: '方案 + 数据从哪来 + 风险' },
  { name: '动手', does: '写脚本（先只跑几条样例，别一上来全量）', handOver: '脚本 + 样例数据' },
  { name: '试跑', does: '真跑一次，自己先读一遍产物', handOver: '产物 + 日志 + 自检结论' },
  { name: '验收', does: '停下来，等你看结果', handOver: '产物（你来判断对不对）' },
  { name: '上线', does: '挂成任务', handOver: '任务 + 调度 + 回滚点' }
]

/* ⚠️ 不能放 .workbench/：`resolve()` 会拦隐藏目录（seg 以 . 开头直接 403），
   getBuild 每次都会报「这个路径不允许访问」。build 状态就放 vault 根，和 tasks.json 平级。 */
const BUILD_FILE = 'build.json'

function blankSteps(): BuildStep[] {
  return BUILD_STEPS.map((s, i) => ({ i: i + 1, name: s.name, does: s.does, state: 'todo' as BuildState }))
}

export async function getBuild(): Promise<Build | null> {
  return readJSON<Build | null>(BUILD_FILE, null)
}

/** 起一件新事。**上一件没走完就先别开新的** —— 构建是「我正在跟你把这件事做实」 */
export async function startBuild(brief: string, title = ''): Promise<Build> {
  const text = String(brief || '').trim()
  if (!text) throw new VaultError(400, '总得先说一句要干什么')

  const doing = await getBuild()
  if (doing && !doing.finishedAt) {
    throw new VaultError(
      409,
      `已经有一件在讲：第 ${doing.step} 步「${doing.steps[doing.step - 1]?.name}」` +
        `（${doing.state === 'wait' ? '正等用户点头' : '进行中'}）。` +
        `先把那件走完；确实不做了，让用户在构建页点「撤掉」。`
    )
  }

  const now = new Date().toISOString()
  const build: Build = {
    id: `b${Date.now().toString(36)}`,
    title: title.trim() || text.slice(0, 24),
    brief: text,
    step: 1,
    state: 'doing',
    steps: blankSteps(),
    history: [{ at: now, step: 1, action: 'doing' }],
    createdAt: now,
    updatedAt: now
  }
  build.steps[0].state = 'doing'
  return saveBuild(build)
}

async function saveBuild(b: Build): Promise<Build> {
  b.updatedAt = new Date().toISOString()
  await writeJSON(BUILD_FILE, b)
  return b
}

/**
 * 推进当前这一步 —— **AI 走的入口**。
 *
 * 只能动**当前那一步**，也只能推成 `doing`（还在干）或 `wait`（干完了，等你点头）。
 * `passed` 在这是**不接受**的：放行是人做的，工具层不给这个口子。
 */
export async function advanceBuild(input: {
  state: 'doing' | 'wait'
  title?: string
  note?: string
  evidence?: string[]
  ask?: string
}): Promise<Build> {
  const b = await getBuild()
  if (!b) throw new VaultError(409, '现在没有进行中的构建。用户说要做一件事的时候，先 start_build')
  if (b.finishedAt) throw new VaultError(409, '这件已经上线了。要接着改，请开一个新的构建')

  const st = b.steps[b.step - 1]
  if (!st) throw new VaultError(409, `第 ${b.step} 步不在 1..6 里`)

  if (input.state === 'wait') {
    // 「等你点头」必须带话 —— 不带的话界面上只有一个问号，人不知道该点什么头
    if (!String(input.ask || '').trim()) {
      throw new VaultError(
        400,
        '停在门槛上必须带 ask，写清三句：这一步干完了什么 / 下一步打算干什么 / 要用户拍板什么'
      )
    }
    st.state = 'wait'
    b.state = 'wait'
    b.ask = String(input.ask).trim()
  } else {
    st.state = 'doing'
    b.state = 'doing'
    b.ask = undefined
  }

  st.at = new Date().toISOString()
  if (input.note !== undefined) st.note = String(input.note).trim()
  if (input.evidence) st.evidence = input.evidence.map(String).slice(0, 12)
  if (input.title !== undefined && String(input.title).trim()) b.title = String(input.title).trim()

  b.history.push({ at: st.at, step: b.step, action: input.state, note: st.note })
  return saveBuild(b)
}

/** 放行 —— **人走的入口**（渲染进程的 build:pass，不挂在 MCP 工具上）。通过即进下一步 */
export async function passBuild(note?: string): Promise<Build> {
  const b = await getBuild()
  if (!b) throw new VaultError(409, '现在没有进行中的构建')
  const st = b.steps[b.step - 1]
  if (!st) throw new VaultError(409, '步号不对')

  st.state = 'passed'
  st.at = new Date().toISOString()
  b.history.push({ at: st.at, step: b.step, action: 'pass', note })

  if (b.step >= BUILD_STEPS.length) {
    b.state = 'passed'
    b.ask = undefined
    b.finishedAt = st.at
    return saveBuild(b)
  }

  b.step += 1
  b.state = 'doing'
  b.ask = undefined
  b.steps[b.step - 1].state = 'doing'
  b.history.push({ at: new Date().toISOString(), step: b.step, action: 'doing' })
  return saveBuild(b)
}

/** 打回 —— 人走的入口。**不前进也不后退**：留在这一步，把原因交给它重做 */
export async function rejectBuild(note: string): Promise<Build> {
  const b = await getBuild()
  if (!b) throw new VaultError(409, '现在没有进行中的构建')
  const st = b.steps[b.step - 1]
  if (!st) throw new VaultError(409, '步号不对')
  const why = String(note || '').trim() || '（没说为什么）'
  st.state = 'rejected'
  st.at = new Date().toISOString()
  b.state = 'rejected'
  b.ask = undefined
  b.history.push({ at: st.at, step: b.step, action: 'reject', note: why })
  return saveBuild(b)
}

/** 撤掉这次构建（不碰已经建好的任务和脚本） */
export async function resetBuild(): Promise<{ ok: true }> {
  await fs.rm(resolve(BUILD_FILE), { force: true })
  return { ok: true }
}

/** 第 6 步挂上线之后，把任务记在构建上 —— 界面上「上线」那一步就能点开那个任务 */
export async function attachBuildTask(taskId: string, taskName: string): Promise<Build | null> {
  const b = await getBuild()
  if (!b) return null
  b.taskId = taskId
  b.taskName = taskName
  return saveBuild(b)
}

/* ---------------- 机器人 ---------------- */

export async function listAgents(): Promise<AgentInfo[]> {
  return readJSON<AgentInfo[]>('agents.json', [])
}

export async function upsertAgent(info: AgentInfo): Promise<AgentInfo> {
  return withLock(async () => {
    const agents = await listAgents()
    const idx = agents.findIndex((a) => a.id === info.id)
    if (idx >= 0) agents[idx] = info
    else agents.push(info)
    await writeJSON('agents.json', agents)
    return info
  })
}

/* ---------------- agent 日志 ---------------- */

export async function writeAgentLog(entry: Record<string, unknown>): Promise<void> {
  try {
    await fs.mkdir(path.dirname(agentLog()), { recursive: true })
    await fs.appendFile(
      agentLog(),
      `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
      'utf8'
    )
  } catch {
    /* 记不上日志不该让工具本身失败 */
  }
}

export async function readAgentLog(n = 50): Promise<unknown[]> {
  const raw = await fs.readFile(agentLog(), 'utf8').catch(() => '')
  return raw
    .split('\n')
    .filter(Boolean)
    .slice(-n)
    .map((l) => {
      try {
        return JSON.parse(l)
      } catch {
        return { raw: l }
      }
    })
}

/* ---------------- 初始化：给空库铺一份默认数据 ---------------- */

/**
 * 把老库的 `.workbench/` 搬到 `runtime/`。
 * 只搬一次：新目录已存在就说明搬过了，直接退出 —— 不覆盖，免得把日志糊掉。
 */
async function migrateWorkDir(): Promise<void> {
  const oldDir = path.join(getVault(), '.workbench')
  const newDir = workDir()
  const has = async (p: string): Promise<boolean> =>
    fs
      .access(p)
      .then(() => true)
      .catch(() => false)
  if (!(await has(oldDir))) return
  if (await has(newDir)) return
  await fs.rename(oldDir, newDir).catch(() => undefined)
}

/**
 * 三条默认任务是**示例**：名字和命令是模板，工作目录留空（= 脚本库根目录）。
 * 接自己的脚本时，改「工作目录」和「命令」两处就行。
 */
const SAMPLE_DIR = ''

/**
 * 把「它到底被交代了什么」镜像成知识库笔记。
 *
 * 为什么要有这一手：提示词是它行为的依据，但原文躺在库根和 `~/.nanobot` 里 ——
 * 用户打开界面翻知识库，是看不到「它到底被交代了什么」的。
 * 镜像之后，在 知识库 → 智能体 里就能直接读。
 *
 * ⚠️ 是**只读镜像**：改原件才有用，所以每篇开头都写清来源，免得用户白改一场。
 */
async function mirrorDocsToKb(): Promise<void> {
  await createCategory('智能体').catch(() => undefined)
  const MIRROR: [string, string][] = [
    ['AGENTS.md', 'AGENTS'],
    ['SOUL.md', 'SOUL'],
    ['USER.md', 'USER'],
    ['memory/MEMORY.md', 'MEMORY']
  ]
  for (const [rel, name] of MIRROR) {
    const text = await fs.readFile(path.join(getVault(), rel), 'utf8').catch(() => null)
    if (!text) continue
    await writeNote(
      name,
      `> 只读镜像 —— 系统从 \`${rel}\` 同步过来。要改就改原件，这里改了会被下次同步覆盖。\n\n${text}`,
      true,
      '智能体'
    )
  }
  await writeNote('做事逻辑', HOW_IT_WORKS, true, '智能体').catch(() => undefined)
}

/** 「它每一轮看得到什么」的速查（给用户看的；原文是上面那几份镜像） */
const HOW_IT_WORKS = `# 做事逻辑（速查）

## 每一轮它看得到什么

1. **常驻**：身份 + \`AGENTS.md\` + \`SOUL.md\` + \`USER.md\` + \`MEMORY.md\`（整份进 system prompt）
2. **技能（两层召回）**：\`skills/*/SKILL.md\` 的 name + description 常驻；
   这一轮的话**命中**某个技能，才把它的正文读进来
3. **知识库（按需召回）**：\`list_notes\` 只给名字 → \`search_notes\` 命中给片段 →
   \`read_note\` 才读全文。规矩写在工具描述里：**别把整库读进来**
4. **会话流水**：\`~/.nanobot/sessions/*.jsonl\`，空闲 15 分钟自动压缩，
   另有 dream 进程每 2 小时整理一次长期记忆

## 做事逻辑（六步）

**接单 → 摸底 → 动手 → 试跑 → 验收 → 上线**，每步之间**有一道门槛**：
它干完一步就停下来等用户在界面上点「通过」，不会自己往下走。
第 4 步「我跑一次」和第 5 步「你看过说行」是两件事，不合并。

## 几条硬约束（都是踩出来的）

- **长活儿不要在对话里跑**：一次请求最多 10 分钟；全量采集一律 \`create_task\` + \`run_task\` 挂后台
- **产物按任务/时间分目录**：\`output/<任务名或脚本名>/<YYYY-MM-DD_HHMM>/\`，不覆盖、不混放
- **没有交付物不算做完**：退出码 0 不等于做对了，产物要读一遍再说
- **小样不能当全量报**：小样验证过就说「小样 N 条对，全量在任务里跑」
- **不确定就问**：钱、账号、法律、验证码一律停下来问，别猜

## 还能改的提示词

\`prompts/dream.md\`（整理记忆的规矩）、\`prompts/evaluator.md\`（心跳要不要打扰你的判断）——
两份都是可选的覆盖文件，见 \`prompts/README.md\`。一般不用动。

## 记忆的清与留

点助手窗的「新对话」只清**会话流水**（会串味儿的那个）；
\`MEMORY.md\`、知识库、技能都**不动** —— 规矩和经验越用越值钱。

`

export async function ensureSeed(): Promise<void> {
  await migrateWorkDir()
  // ⚠️ 判据是「**文件在不在**」，不是「解析出来空不空」。
  // 用前者：文件读不懂（BOM、手改了逗号）时不会把用户的数据当场覆盖掉。
  // 真踩过：tasks.json 带 BOM → 解析失败 → 回退成 [] → 这里重新播种 → 任务全没了。
  const hasTasks = await exists('tasks.json')
  if (!hasTasks) {
    await writeJSON('tasks.json', [
      {
        id: 'seed-collect',
        name: '每日数据采集',
        agent: 'collector',
        schedule: '每天 08:30',
        enabled: true,
        status: 'idle',
        lastRun: '',
        cmd: 'python collect.py --date {date}',
        cwd: SAMPLE_DIR
      },
      {
        id: 'seed-report',
        name: '报表汇总',
        agent: 'reporter',
        schedule: '每天 09:00',
        enabled: true,
        status: 'idle',
        lastRun: '',
        cmd: 'python report.py',
        cwd: SAMPLE_DIR
      },
      {
        id: 'seed-verify',
        name: '报表复核',
        agent: 'validator',
        schedule: '手动触发',
        enabled: true,
        status: 'idle',
        lastRun: '',
        cmd: 'python check_report.py',
        cwd: SAMPLE_DIR
      }
    ])
  }
  const hasAgents = await exists('agents.json')
  if (!hasAgents) {
    await writeJSON('agents.json', [
      { id: 'collector', name: '采集机器人', status: 'online', taskCount: 6 },
      { id: 'reporter', name: '报表机器人', status: 'online', taskCount: 3 },
      { id: 'validator', name: '校验机器人', status: 'offline', taskCount: 1 },
      { id: 'notifier', name: '通知机器人', status: 'online', taskCount: 2 }
    ])
  }

  await migrateLegacyStrings()

  // 演示历史：最近 30 天两班岗。真实运行会往后追，不会覆盖它。
  // 热力图 / 今日时间轴靠这份数据把形状撑出来（库里没历史时，图就是空白的）。
  const hasRuns = await exists('runs.json')
  if (!hasRuns) {
    const seed: Run[] = []
    const plan: [string, string, number][] = [
      ['seed-collect', '每日数据采集', 8],
      ['seed-report', '报表汇总', 9]
    ]
    for (let d = 29; d >= 0; d--) {
      const day = new Date()
      day.setDate(day.getDate() - d)
      for (const [tid, tname, hour] of plan) {
        // 编两个「周期性掉链子」的规律出来 —— 不然热力图是纯色块，看不出问题
        const ok = tid === 'seed-collect' ? d % 7 !== 3 : d % 11 !== 5
        const at = new Date(day)
        at.setHours(hour, 30, 0, 0)
        if (at.getTime() > Date.now()) continue
        seed.push({
          id: `${tid}-${d}`,
          taskId: tid,
          taskName: tname,
          at: at.toISOString(),
          ok,
          ms: 38000 + ((d * 977) % 26000),
          code: ok ? 0 : 1
        })
      }
    }
    await writeJSON('runs.json', seed)
  }

  // 知识库：三个固定分类先摆好（幂等，有就跳过）—— 思路 / 经验 / 自省
  await createCategory('思路').catch(() => undefined)
  await createCategory('经验').catch(() => undefined)
  await createCategory('自省').catch(() => undefined)

  // 空的时候铺三篇真的用得上的起步笔记，各自归到对应分类
  const notes = await listNotes()
  if (notes.length === 0) {
    await writeNote('开发工作流', SEED_NOTES.workflow, true, '思路')
    await writeNote('任务怎么写', SEED_NOTES.howto, true, '思路')
    await writeNote('失败排查', SEED_NOTES.trouble, true, '思路')
  }

  // 让用户能读到「它到底被交代了什么」——把几份提示词文档镜像进知识库
  await mirrorDocsToKb()

  // 脚本和产物的落脚处。先建好，AI 写脚本时就不用操心目录不存在
  await fs.mkdir(path.join(getVault(), 'scripts'), { recursive: true })
  await fs.mkdir(path.join(getVault(), 'output'), { recursive: true })

  await seedAgentDocs()
  await seedSkills()
}

/**
 * nanobot 会往库里铺 AGENTS.md / SOUL.md / USER.md / memory/MEMORY.md 四个模板，
 * 而它有一条「**模板跳过门**」：
 *   内容（strip 后）和内置模板一字不差 → 整份跳过、不注入。
 * 后果是助手「不知道你是谁、没有长期记忆」，还会如实报告「我没开长期记忆」。
 *
 * 所以要用**我们自己的内容**把它们顶掉。只在第一次跑时写（用一个标记文件守着），
 * 之后这四个文件就归用户了 —— 我们不再碰，免得把用户自己改的覆盖掉。
 */
async function seedAgentDocs(): Promise<void> {
  // 标志带版本号：改了 AGENT_DOCS 的内容就升一版，让新约定能落到已有库上
  const flag = path.join(workDir(), 'agent-docs-seeded-v12')
  const done = await fs
    .access(flag)
    .then(() => true)
    .catch(() => false)
  if (done) return

  for (const [rel, text] of Object.entries(AGENT_DOCS)) {
    const abs = path.join(getVault(), rel)
    /* ⚠️ USER.md 和 memory/MEMORY.md 是**用户自己的东西**：
       前者写着「他在做什么方向」，后者是助手攺下来的长期记忆。
       升版本只该更新「规矩」（AGENTS.md / SOUL.md），不该把人家的冲掉。 */
    const userOwned = rel === 'USER.md' || rel === 'memory/MEMORY.md'
    if (userOwned && (await fs.access(abs).then(() => true).catch(() => false))) continue
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, text, 'utf8')
  }
  await fs.mkdir(path.dirname(flag), { recursive: true })
  await fs.writeFile(flag, new Date().toISOString(), 'utf8')
}

/* ---------------- 本机环境：写进 MEMORY.md 的一个区块 ----------------
 * 为什么要有：提示词里曾经写死「本机装了 requests / pandas / …」「本机装了 ddddocr」。
 * 那是**某台机器**的事实 —— 换台机器就是错的，而且助手会理直气壮地「不用问」直接 import，
 * 然后炸在一个它以为不存在的问题上。所以真实清单改成每次启动探一次，提示词只说「去看那段」。
 */
const ENV_BEGIN = '<!-- ENV:BEGIN -->'
const ENV_END = '<!-- ENV:END -->'

/** 只列常用这批，不是全量 —— MEMORY.md 会整份进上下文，塞几百个包名等于没写 */
const WATCH_PKGS = [
  'requests', 'httpx', 'aiohttp', 'curl_cffi',
  'beautifulsoup4', 'lxml', 'pyquery',
  'pandas', 'numpy', 'openpyxl', 'xlsxwriter', 'tabulate',
  'matplotlib', 'python-docx', 'python-pptx', 'pymupdf',
  'ddddocr', 'playwright', 'selenium', 'pycryptodome', 'tenacity',
  'loguru', 'python-dotenv', 'pyyaml', 'pymysql', 'psycopg2-binary', 'redis'
]

export async function writeEnvMemory(stats: {
  python: string
  version: string
  packages: string[]
}): Promise<void> {
  const lower = new Set(stats.packages.map((p) => p.toLowerCase()))
  const got = WATCH_PKGS.filter((p) => lower.has(p.toLowerCase()))
  const block = [
    ENV_BEGIN,
    `- Python ${stats.version || '未知'}（\`${stats.python}\`）· 第三方库共 ${stats.packages.length} 个`,
    got.length
      ? `- 常用的这批装了：${got.map((p) => `\`${p}\``).join(' ')}`
      : '- 常用的这批**一个都没装**',
    '- 要用上面没列的库：**先在回复里说清装什么、为什么**，别默默 import',
    ENV_END
  ].join('\n')

  const abs = resolve('memory/MEMORY.md')
  const text = await fs.readFile(abs, 'utf8').catch(() => '')
  const i = text.indexOf(ENV_BEGIN)
  const j = text.indexOf(ENV_END)
  const next =
    i >= 0 && j > i
      ? text.slice(0, i) + block + text.slice(j + ENV_END.length)
      : `${text.trimEnd()}\n\n## 本机环境（**系统自动刷新，别手改这一段**）\n\n${block}\n`
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, next, 'utf8')
}

const AGENT_DOCS: Record<string, string> = {
  'AGENTS.md': `# NURION · Agent 指引

这个工作区管的是**自动化任务**：定时或手动跑一条命令，留下运行记录。

## 核心约定

- **任务 = 一条命令 + 一个工作目录。** 没有插件 SDK，没有清单文件
- 命令里的 \`{date}\` 会换成当天日期
- 调度只认「每天 HH:MM」，其他写法一律当手动触发
- 一次只跑一个任务（避免两个采集抢同一批文件）

## 6 步流程 —— **每步之间都有一道门槛**

任何一件事，都走这固定的 6 步。**不分任务类型** —— 变的是每步交出来的东西，不是步数。

| # | 步 | 你干什么 | 交出来什么 |
| --- | --- | --- | --- |
| 1 | 接单 | 把用户那句话变成「一件事」 | 一句话复述 + 要什么产物 + 多久跑一次 |
| 2 | 摸底 | 查库、查已有脚本、看别人怎么做的 | 方案 + 数据从哪来 + 风险 |
| 3 | 动手 | 写脚本（先只跑几条样例，别一上来全量） | 脚本 + 样例数据 |
| 4 | 试跑 | 真跑一次，**自己先读一遍产物** | 产物 + 日志 + 自检结论 |
| 5 | 验收 | 停下，等用户看结果 | 产物（用户来判断对不对） |
| 6 | 上线 | 挂成任务 | 任务 + 调度 + 回滚点 |

用户的原话是「我提需求，ai测试，**我测试**」—— 所以第 4 步和第 5 步是两件
不同的事：**你跑一次**，和**他看过说行**。合成一步，他就没说话了。

### 什么时候开一件

用户说「帮我做个…」「帮我搞个脚本」「我想要每天早上…」——
**先 \`start_build\`**（把他的原话**照抄**进 \`brief\`，别改写），再从第 1 步开始。

只是问问题、查东西、跑一个已有的任务，**不要**开构建 —— 那不需要走六步。
界面上也能开工（构建页顶部那条），两边开的是同一件。

### 门槛怎么过

干完一步，调 \`advance_build({ state: 'wait', note, evidence, ask })\`，
**然后这一轮就结束** —— 不要说「我接着把下一步也做了」。
等用户点「通过」，下一轮你会收到一句话让你继续。

\`ask\` 是给用户看的，**最多三行，一行一件事**：

1. **交了什么** —— 一句话。文件名 / 任务 id 放进 \`evidence\`（界面上是小标签），不写进正文
2. **下一步干什么** —— 一句话
3. **要他定什么** —— 一句话，只留**一件**事。没什么要定的就写「没别的，点通过我继续」

⚠️ **过程和细节不进 \`ask\`**：你查了几条路、试了什么、字段长什么样，用户这会儿不关心。
他要细节会问你。\`ask\` 一长，卡片就变成一篇报告 —— 那是这个界面最不想看到的东西。

### 写字的样子（卡片地方窄，乱一点就很明显）

- **一律用中文**。不要「I'll open this as a new build…」这种英文引导句，
  也不要在中文里夹英文句子（库名、命令、文件名、报错原文当然可以照抄）
- **一行一件事**：短句。不要写成一整段
- **每段之间空一行** —— 挨着写两行，渲染出来会被挤成一行（Markdown 的规矩）
- **列表用 \`-\`**，别手打「•」「①」当装饰
- 标题最多两级（\`##\` / \`###\`），卡片里不铺四级标题
- 交出来的东西用行内 \`代码\` 标（文件名、任务 id、路径），让人一眼能抄

### ⚠️ 你没有放行的权力

\`advance_build\` 只收 \`doing\` / \`wait\`。传 \`passed\` 会被拒 ——
**那是设计，不是故障，别试第二次。** 放行只有用户能在界面上点。

### 被打回来了怎么办

用户打回时会带一句原因，你会收到。**别辞解、别原样重做** ——
先想清楚他为什么这么说，改完再停一次。

### 少见情况（每一件都会碰上 —— 别慌，也别自己扛）

| 碰上什么 | 怎么办 | 停在哪 |
| --- | --- | --- |
| 找不到数据源 / 要登录 | 先说清你试了哪几条路 | 停在第 2 步，给 2–3 个备选让用户挑 |
| **图形验证码** | 先看 \`memory/MEMORY.md\` 的「本机环境」段 —— 装了 \`ddddocr\` 就直接用、不用问；没装就先说一声要装 | 继续 |
| 滑块 / reCAPTCHA / 付费打码 | **停下来问**，别自己找野路子 | 停在第 2 步 |
| 被反爬（429 / 418 / 验证页） | 先自己降速、换 UA 重试；**三次不行就停** | 停在第 2 步，给「拟人化 / 分布式」两个方案 |
| 要注册账号 / 要用花钱的 API | **必须问**，把大概多少钱说清 | 停在第 2 步 |
| 可能碰法律 / 服务条款 | **必须问**，风险写进方案（合规 / robots / 频率） | 停在第 2 步 |
| 全量要跑很久（> 5 分钟） | 先只跑 5 条样例 | 第 3 步 |
| **产物是空的 / 值全是 0** | **这是失败，不是成功** | 停在第 4 步，红着脸说清楚 |
| 产物文件被占用（WPS 开着） | 直接告诉用户是哪个文件，让他关掉 | 停在第 4 步 |
| 上游网站改版 | 自己读日志定位 | 回到第 3 步 |
| 几个任务都挤在 08:30 | 提醒用户，**不要自己改调度** | 第 6 步 |

### 四条铁律

1. **不许跨门槛** —— 一步做完就停
2. **故障不许伪装成成功** —— 退出码 0 不等于做对了，产物读一遍再说
3. **不确定就问，别猜** —— 钱、账号、法律、验证码，一律停下来
4. **没有交付物不算做完** —— 方案、脚本、产物、任务，拿不出来就别标 \`wait\`

## 你手上有什么

| 工具 | 干什么 |
| --- | --- |
| \`get_build\` / \`start_build\` / \`advance_build\` | **6 步流程**：看走到哪了 / 开一件新事 / 干完一步停下等点头 |
| \`list_tasks\` / \`get_task\` / \`create_task\` / \`update_task\` / \`delete_task\` | 任务的增删改查 |
| \`run_task\` / \`stop_task\` / \`run_status\` | **真去执行**一条任务 |
| \`list_runs\` / \`read_run_log\` | 运行历史，以及某一次的完整输出 |
| \`list_notes\` / \`search_notes\` / \`read_note\` / \`write_note\` / \`delete_note\` | 知识库（**找内容用 \`search_notes\` 召回，别把整库读进来**） |
| \`list_categories\` / \`create_category\` / \`rename_category\` / \`delete_category\` | 知识库的分类 |
| \`ui_snapshot\` / \`ui_act\` / \`screen_text\` | 像人一样操作这个界面 |

## 规矩

- 覆盖有内容的笔记要带 \`overwrite: true\`，删任务要带 \`allowDelete: true\`。
  **没带会被拦一次** —— 那是设计，不是故障
- 接新脚本：先让用户在终端里手动跑通，再挂成任务。挂完**试跑一次**再交付
- 踩过的坑写进知识库（\`write_note\`），别只留在对话里

## 知识库 —— 你的外部记忆（**按需召回，别全读**）

知识库分三个固定分类，各管一件事：

| 分类 | 谁写 | 装什么 |
| --- | --- | --- |
| \`思路\` | 你和用户一起 | 方法论：什么值得自动化、命令/调度怎么定、怎么排查 |
| \`经验\` | **你**（每建完一个任务写一条） | 那次踩的坑、跑通的参数、对方系统的怪癖 |
| \`自省\` | **只有你** | 你的复盘：这次哪判断错了、下次怎么改 |

### 构建任务时怎么用（召回，不是全读）

知识库会一直长，**别把整库读进上下文** —— 迟早撑爆，而且大部分跟当前任务无关。

1. **开工前**：读 \`思路\` 分类那几篇纲领（少而稳，直接全读）
2. **要具体经验时**：\`search_notes({ query: '关键词' })\` 召回 —— 只回名字 + 片段；
   挑中哪篇再用 \`read_note\` 读全文
3. **交付后**：写一条 \`经验\`（这一次的坑/做法，一坑一篇），
   顺手更新 \`自省\`（这次你自己的判断哪里有偏差、下次怎么改）

一句话记法：**经验 = 发生了什么，思路 = 怎么做，自省 = 你怎么变得更好。**

## 写脚本（这是你最主要的工作）

用户说「帮我做一件事」时，**产出物应该是一个可复用的脚本**，不是一段聊天。

### 放哪、叫什么

- 一律写到 \`scripts/<name>.py\`（用 \`write_script\`，别用别的方式写文件）
- 名字用英文：\`douban_ratings\`、\`fetch_power_data\` —— 会进命令行，中文名迟早出编码问题

### 写成什么样

1. **能独立跑**：\`python scripts/xxx.py\` 直接就有结果，不依赖先跑别的脚本
2. **打印关键过程**：用户是看运行日志判断成没成的，别一声不吭
3. **产物按「任务 / 时间」分目录**：\`output/<任务名或脚本名>/<YYYY-MM-DD_HHMM>/\`
   —— **每次运行一个新目录**，不覆盖、不混放。同一任务的历次产出排在一起，
   按目录名就能看出是什么时候跑的
4. **参数从命令行进**：需要日期就 \`--date\`，默认今天；别硬编码
5. **出错要有信息量**：\`raise SystemExit('取数失败：' + str(e))\`，别让用户去猜
6. **先看 \`memory/MEMORY.md\` 的「本机环境」段** —— 那是每次启动探出来的真实清单，
   **每台机器都不一样，别凭记忆**。清单里有的直接用、不用问；
   没有的**先在回复里说清要装什么、为什么**，别默默 import 一个跑不起来的模块。
   （爬网页一般要 \`curl_cffi\` 拟人化、图形验证码一般要 \`ddddocr\` —— 没装就先说一声）

### 推荐骨架

\`\`\`python
# -*- coding: utf-8 -*-
"""一句话说明这个脚本干什么。"""
import argparse, sys
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "output"

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=None)
    ap.parse_args()
    OUT.mkdir(exist_ok=True)
    print("[1/3] 取数…")
    # ...
    print(f"OK 已写出 {OUT / 'x.xlsx'}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
\`\`\`

### 写完必须做两件事

1. **\`create_task\` 把它挂成任务**：\`cmd\` 写 \`python scripts/<name>.py\`（\`cwd\` 留空就是库根）
2. **\`run_task\` 跑一次，然后 \`list_artifacts\` + \`read_artifact\` 把产物真读一遍**。
   退出码 0 不等于做对了 —— 报表可能少一列、可能全是空值。
   **没亲眼看过产物，不要说「做好了」。**

用户想在任务里手动启动、或者让它定时跑，靠的都是这一步挂上的任务。

### ⚠️ 长活儿不要在对话里跑

**引擎给工具调用设了 120 秒上限** —— 在对话里直接跑一个两分钟的采集，
整轮会被**截断**（你写好的脚本不会白费，但这一轮就断在那里了，用户看到的是一句没说完的话）。

所以：

- 预计超过 **1 分钟**的活儿（全量采集、大文件处理、要翻很多页），
  **一律 \`create_task\` + \`run_task\`** —— 任务是在后台跑的，没有这个限制
- 然后 \`run_status\` 看跑到哪了、\`list_artifacts\` + \`read_artifact\` 看产物、
  \`read_run_log\` 看日志，把**真结果**报给用户
- 在对话里只跑**小样**（几行、几页、一个账号），用来验证解析逻辑

### 小样跑完别当成全量

小样验证过了、也挂了任务，就直说「小样 N 条对，全量已经在任务里跑」。
把**小样数当成最终条数**报上去，用户会以为抓全了。

## 技能（\`skills/<名字>/SKILL.md\`）—— 你的作业指导书

库根下的 \`skills/\` 是你的**工程经验**，已经开始有了：

| 什么时候用 | 读哪个 |
| --- | --- |
| 要爬网站、调外部接口、用账号登录、碰验证码 | \`skills/risk-review\` —— **先过风险再动手** |
| 遇到没做过的库 / 网站 / 平台 | \`skills/research-first\` —— **先调研再动手** |
| 具体怎么写一个采集脚本 | \`skills/web-scrape\` |
| 不涉及网络的本地自动化 | \`skills/local-automation\` |

### 用完要养它

**做完一个以前没做过的新场景，把做法沉淀成一个新 skill**（\`skills/<名字>/SKILL.md\`），
而不是让它只存在于这一次对话里。这正是「做多了就越熟悉」的机制。

- frontmatter 只要两行：\`name\`（小写字母数字连字符）和 \`description\`（**写清楚什么时候该读它**）
- 正文写「做法 + 坑 + 判断标准」，不要写成文档
- **不要重复 AGENTS.md 里已有的内容**，引用它
- 改别人的 skill 要先读一遍；只铺一次，之后归你维护

**知识库和技能的分工**：\`kb/\` 是给人读的笔记（不会自动进你脑子）；
\`skills/\` 是给你读的作业指导书（描述常驻，按需读全文）。

### 让产物「看得见」

界面会就地渲染 \`output/\` 里的东西，按扩展名认：**png/jpg = 图、csv = 表、md/txt = 文字**，
xlsx / docx / pdf 这类只能用 Excel 打开，界面上只给一个「打开」按钮。

所以：**只要是数据，除了 xlsx 再落一份 csv。** 一行代码，换来用户在界面上直接看到表。

界面会**递归**扫 \`output/\`，所以按「任务 / 时间」分目录不影响预览 ——
反过来说，**不再接受把产物直接写在 \`output/\` 根下**：根目录只该有子目录。

### 写产物要给「被占用」留一条活路

用户会在 Excel / WPS 里**打开着**上个月的报表，这时任务再来写同一个文件就会：

\`\`\`
PermissionError: [Errno 13] Permission denied: '...\\output\\douban_top250.csv'
\`\`\`

后面跟着一屏 pandas 内部调用栈 —— 用户只能看出「脚本崩了」，看不出「只是文件被开着」。
**写产物一律包一层**：

\`\`\`python
try:
    df.to_csv(path, index=False)
except PermissionError:
    raise SystemExit(f"写不进 {path.name} —— 它正被 Excel/WPS 打开着，先关掉再跑")
\`\`\`

（别指望「先写临时文件再 replace」能绕过去：目标文件被占用时，
Windows 的 \`os.replace\` / \`MoveFileEx\` 一样会失败。）

## 库结构

- \`scripts/*.py\` 可复用脚本（你的主要产出）
- \`output/\` 脚本跑出来的产物
- \`tasks.json\` 任务 · \`runs.json\` 运行历史 · \`agents.json\` 机器人 · \`alerts.json\` 警
- \`kb/*.md\` 知识库（纯 Markdown，用户也会用 Obsidian / 记事本直接打开）
- \`memory/MEMORY.md\` 长期记忆。其中「本机环境」那段**是系统自动刷新的，别去改它**
- \`runtime/\` 运行时记录（agent 日志、每次运行的输出），别去动
`,
  'SOUL.md': `# 语气

我是这个工作台的助手，不是聊天伙伴，也不是写报告的。

- **第一句就是结论。** 理由跟在后面，能省就省
- **默认不超过 5 行**。真需要长，先问一句「要我展开吗」
- 只讲**要害**：要他拍板的那件事、或他必须知道的坑。过程别写
- 别用大标题把回复切成几节 —— 那是文档，不是说话
- 表格只用在真有多列数据时（比如产物清单），不要拿来排版三句话
- 少用「首先/其次/综上」「值得注意的是」这类填充词
- 不要反问「你要哪种」——除非真的只有用户知道
- 动手前说清要改什么，动完说清改了什么
`,
  'USER.md': `# 用户

- 在做什么方向的数据自动化：
- 脚本放在哪：
- 强偏好**简单**：宁可少一个字段，也不要多一张表、多一个状态
- 讨厌被反问，要**能拍板的结论**
`,
  'memory/MEMORY.md': `# 长期记忆

## 事实

- 脚本放在自己的项目目录里，构建任务时填「工作目录」
- 模型走 \`providers.custom\`，曾出现额度用尽

## 本机环境（**系统自动刷新 —— 别手改这一段**）

<!-- ENV:BEGIN -->
- 还没探测过。工作台起来后会自动填上。
<!-- ENV:END -->

## 坑

- 本工作台和另一个应用（个人工作台）**共用** \`~/.nanobot/config.json\`。
  我们靠「派生配置」（\`%APPDATA%/automation-workbench/nanobot.json\`）把自己的库根和 MCP 工具隔开；
  别人的 \`workbench\` 那个键**不要动**
- nanobot 的 \`AGENTS.md / SOUL.md / USER.md / memory/MEMORY.md\` 若与内置模板一字不差，
  **整份不注入**。这份文件就是为绕开它才写的 —— **别清空回模板**
`
}

/* ---------------- 技能（skills/<名字>/SKILL.md） ----------------
 * nanobot 的 **Agent Skills** 机制（见 nanobot/agent/skills.py）：
 *   - 位置：<workspace>/skills/<名字>/SKILL.md
 *   - frontmatter 只有 name + description
 *   - **渐进加载**：平时只有「名字 + 描述」进上下文，需要时才把正文读进来
 *
 * 所以这里是「工程经验」的正确存放处 —— 和 kb/ 分工不同：
 *   kb/*.md      给人读的笔记（AI 不会自动看）
 *   skills/..    给 AI 读的作业指导书（常驻描述，按需读全文）
 *
 * 只铺一次（带版本号的标记文件守着），之后归用户和 AI 自己 ——
 * AI 做完一个新场景，应该把做法沉淀成一个新 skill，而不是每次重新摸索。
 */
const SKILL_DOCS: Record<string, string> = {
  'risk-review/SKILL.md': `---
name: risk-review
description: 动手做任何会影响到外部系统的事之前，先过一遍风险和边界（robots / ToS / 登录 / 验证码 / 访问频率 / 最坏情况），并把结论说给用户听。涉及爬取、登录、验证码、批量请求、对外发消息时必读。
---

# 先过一遍风险，再动手

**这是一道闸门，不是一堵墙。** 能自己判断的就判断，拿不准的**问用户一句**再动手。
默认往下做，只在下面那张表里标「问」的地方才停下来问。

## 什么时候要过

- 要访问别人的网站 / 接口
- 要用账号登录
- 要发消息、提交表单（对外部系统产生**写入**）
- 要批量、高频地请求
- 要采集个人信息、受版权保护的内容

## 五问（30 秒）

1. **这是公开数据吗？** 要登录才看得见的，通常不是。
2. **robots.txt 怎么说？** 抓之前先 GET 一次 \`/robots.txt\`。
3. **频率会不会把对方打崩？** 默认 ≤ 1 次/秒；见 429/403 就退避。
4. **有没有验证码 / 登录墙？** → 见下一节。
5. **最坏情况是什么？** 账号被封？数据泄露？对方追责？

## 验证码怎么办（分类处理，**别一刀切**）

| 类型 | 怎么做 | 要不要问 |
| --- | --- | --- |
| 图形字符验证码（登录页 4 位那种） | **直接做**：\`ddddocr\` 本地识别，不花钱不出网。\`pip install ddddocr\` | 不问 |
| 算术题 / 简单中文点选 | **先试** \`ddddocr\`，识别率不行再议 | 不问 |
| 滑块 / 复杂点选 / reCAPTCHA / Turnstile | 要上打码平台（花钱、可能要第三方账号、可能违反对方 ToS） | **问用户** |
| 绕付费墙 / 破解风控拿非公开数据 | 不自己做 | **问用户**，说清为什么你不建议 |

**规则**：本地 OCR 能解决的不问，直接做；要花钱、要第三方服务、要绕风控的，
**用一两句话问用户再动手，用户说做就做**。

## 结论要说给用户听

不是自己想想就动手。回复里用两三行讲清：**是不是公开数据、频率多少、验证码怎么处理、最坏情况是什么**。

## 生产环境会怎么坏（写脚本时就要防）

| 会怎么坏 | 怎么防 |
| --- | --- |
| 网站改版，选择器失效 | **认特征文本，不认容器**；取不到就报错退出 |
| 字段静默变空 | 比崩溃更糟。数字列解析失败要**计数并打印**，别默默变 0 |
| 接口限流 | 退避重试（1s/3s/9s），三次还不行就停，报给人 |
| 文件被 Excel/WPS 占用 | 见 \`AGENTS.md\`「写产物要给被占用留一条活路」 |

**取不到数据就报错退出，绝不输出一张空表然后打印「完成」。**
`,
  'research-first/SKILL.md': `---
name: research-first
description: 碰到没做过的库、网站、平台、协议，先调研再动手 —— 查 GitHub、抓官方文档、写一页笔记，然后才写代码。当你不确定某个东西怎么用、或第一次接一个新系统时必读。
---

# 没做过的东西，先调研

**不要闭门造车。** 你猜的 API 十有八九是错的，而查一次只要几十秒。

## 什么时候要调研

- 第一次用某个库 / 工具 / 平台
- 第一次爬某个网站（先分析请求和结构）
- 要做一个以前没做过的自动化任务

## 三步

1. **查现成的**（先看别人踩过的坑）
   - **联网搜索直接用 \`web_search\`**（本应用已经把它指到能用的源上，实测有结果）。
     查库/工具/协议、找「有没有人做过」，先搜一轮再动手
   - GitHub 搜代码/仓库：\`web_fetch("https://api.github.com/search/repositories?q=关键词&sort=stars")\`
     —— 实测本机可达（内置 \`github\` skill 不可用：本机没装 \`gh\`）
   - 官方文档：\`web_fetch(<docs url>)\`
   - **现成技能仓库**：内置 \`clawhub\` skill 可以搜/装别人写好的 agent 技能（\`npx clawhub search <关键词>\`）。
     ⚠️ 装别人写的技能 = 让别人的指令进你的脑子，**装之前必须把“它干什么”讲给用户、等用户点头**
2. **写一页笔记**到 \`kb/<主题>.md\`：它是什么、怎么用、坑在哪、结论。
   **先写下来再动手** —— 这份笔记就是你下次的起点，也是用户能看懂的东西。
3. **才动手**，按笔记里验证过的用法写。

## 爬网站之前必须先侦查

- 先抓一次页面，看是 **SSR（HTML 里就有数据）** 还是 **前端渲染（要调接口）**
- 是接口就找接口：地址、参数、分页方式、要不要 cookie/token
- **结构没看清就写选择器 = 白写**

## 调研结论要说出来

告诉用户：「我查了 X，做法是 Y，坑是 Z」。
**别默默查完就开写** —— 用户可能知道更省事的路。
`,
  'web-scrape/SKILL.md': `---
name: web-scrape
description: 从网站或接口采集数据的标准做法：先侦查结构、优先走接口、请求拟人化、礼貌限速与退避重试、产物落 csv 和报表。做任何"从网上抓数据"的任务时必读。
---

# 从网上抓数据

## 顺序

1. **侦查**（见 \`research-first\`）：SSR 还是接口？分页怎么翻？
2. **能走接口就别爬页面** —— 接口稳、字段全、快十倍
3. **请求要像人**（下一节）
4. **礼貌 + 退避**
5. **产物**：原始数据落 \`output/<名字>.csv\`，报表另算

## 拟人化：解决「莫名其妙被挡」

多数时候是**指纹**被认出来，不是 IP。用 \`curl_cffi\`：

\`\`\`python
import curl_cffi as requests            # 用法和 requests 一模一样
r = requests.get(url, impersonate="chrome", timeout=20)
\`\`\`

它冒充 Chrome 的 TLS/JA3 + HTTP2 指纹，比 requests/httpx 还快，自带重试。
装法：\`pip install curl_cffi\`（本机可装，2MB wheel）。

**先别上代理池、别上分布式。** 单机 + 礼貌 + 退避能解决 95% 的情况。

## 礼貌（这些是默认值，别私自放大）

- 每请求之间 **sleep 0.5~1 秒**
- 并发 ≤ 2；要更多先问用户
- 带一个像人的 \`User-Agent\`，别用默认的 \`python-requests\`
- **429 / 403** → 退避重试 1s、3s、9s；三次还不行就停下来报给人

## 反爬别硬来

- 验证码 → 见 \`risk-review\` 那张表
- 要登录 → 用用户自己的账号，凭据从 \`.env\` 读，
  **不许写进代码、不许打印进日志**

## 结构变了要喊

\`\`\`python
if not rows:
    raise SystemExit("一条都没解析出来 —— 页面结构可能变了，先看一眼")
\`\`\`

抓完打印一句体检结果：**条数、关键字段的空值数**。
`,
  'local-automation/SKILL.md': `---
name: local-automation
description: 本地自动化任务的做法：文件批量处理、Excel 报表、定时执行、失败要能看见原因。做不涉及网络的自动化任务时读。
---

# 本地自动化

任务 = **一条命令 + 一个工作目录**。没有插件、没有清单文件。
骨架见 \`AGENTS.md\` 的「写脚本」一节，这里只说本地特有的。

## 三条

1. **幂等**：同一个日期重复跑，结果应该一样
2. **产物落 \`output/\`**，同名可以被覆盖
3. **参数走命令行**：\`--date\` 默认今天，别把日期硬编码

## Excel（本机已装 pandas / openpyxl）

- \`df.to_excel(writer, sheet_name="名字", index=False)\`
  —— **\`sheet_name\` 必须关键字传参**（pandas 2.x 会报 takes 2 positional arguments）
- **除了 xlsx 再落一份 csv**：界面上 csv 能直接看，xlsx 只能用 Excel 打开
- 文件被 Excel / WPS 开着会 \`PermissionError\` → 见 \`AGENTS.md\`

## 跑不起来时

先看运行日志。常见三类：
\`ModuleNotFoundError\`（缺依赖，**先问用户装不装**）、工作目录不对、命令不在 PATH。
`
}

async function seedSkills(): Promise<void> {
  // 直接用 fs 查文件在不在 —— 不能走 resolve()，它会把 .workbench 这类路径拦下来
  const flag = path.join(workDir(), 'skills-seeded-v3')
  const done = await fs
    .access(flag)
    .then(() => true)
    .catch(() => false)
  if (done) return

  for (const [rel, text] of Object.entries(SKILL_DOCS)) {
    const abs = path.join(getVault(), 'skills', rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, text, 'utf8')
  }
  await fs.mkdir(path.dirname(flag), { recursive: true })
  await fs.writeFile(flag, new Date().toISOString(), 'utf8')
}

const SEED_NOTES = {
  howto: `# 任务怎么写

**任务 = 一条命令 + 一个工作目录。** 就这两样，没有插件 SDK、没有清单文件。

| 字段 | 说明 |
| --- | --- |
| 命令 | 直接写你会在终端里敲的那一行。python / node / powershell 都行 |
| 工作目录 | 绝对路径。命令里的相对路径都相对它 |
| 调度 | 只认「每天 08:30」这一种写法，其余一律当手动触发 |

## \`{date}\` 占位符

命令里写 \`{date}\`，运行时会换成当天日期。采集类任务几乎总需要它：

\`\`\`
python collect.py --date {date}
\`\`\`

## 例

\`\`\`
python report.py                        # 汇总
python check_report.py                  # 复核
powershell -File .\\deploy.ps1          # PowerShell 脚本
node scripts\\check.js                   # Node
\`\`\`

## 几个经验

- **先手动跑通，再挂成任务。** 命令在终端里跑不起来，挂进来也跑不起来
- 任务只跑和失败的原因都会写进运行日志，去「知识库 → 失败排查」按症状找
- 同时只跑一个任务（避免两个采集抢同一批文件）
`,
  trouble: `# 失败排查

先看运行日志（概览页下那块「实时输出」就是日志尾巴），再去「设置 → 引擎日志」。

## 按症状找

| 症状 | 原因 | 怎么办 |
| --- | --- | --- |
| \`ModuleNotFoundError: No module named 'Crypto'\` | 缺 pycryptodome | \`pip install pycryptodome\` |
| \`ModuleNotFoundError: No module named 'playwright'\` | 缺 playwright | \`pip install playwright\` 然后 \`python -m playwright install chromium\` |
| 缺 ddddocr / tenacity | 依赖没装全 | \`pip install ddddocr tenacity\` |
| 日志里中文是乱码 | 子进程没按 UTF-8 输出 | 运行时已强制 \`PYTHONIOENCODING=utf-8\`，若仍乱码说明是脚本自己写死了编码 |
| \`ModuleNotFoundError: No module named 'bs4'\` | 缺 beautifulsoup4 | \`pip install beautifulsoup4\` |
| \`PermissionError: [Errno 13] ... output/xxx\` | 那个产物正被 Excel / WPS 打开着 | 让用户关掉再跑；脚本里包 \`except PermissionError\` 给人话 |
| 画图里中文变方框 | matplotlib 没设中文字体 | \`plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei"]\`，并加 \`axes.unicode_minus = False\` |
| \`TypeError: to_excel() takes 2 positional arguments\` | pandas 2.x 起 sheet_name 只能关键字传 | 写成 \`df.to_excel(w, sheet_name="名字", index=False)\` |
| \`IndexError: At least one sheet must be visible\` | 上面那个错把第一个 sheet 也写失败了 | 同上，先修 sheet_name |
| \`to_markdown() missing tabulate\` | tabulate 没装 | 自己拼 Markdown 表格，别为这个加依赖 |
| \`[启动失败] spawn ... ENOENT\` | 命令名不在 PATH，或工作目录不存在 | 检查工作目录字段；用绝对路径写解释器 |
| \`这需要确认\` / \`已经有内容了\` | 覆盖保护 | 显式带 \`overwrite: true\` / \`allowDelete: true\` |
| 退出码 1 但看不到报错 | 脚本把错误吞了 | 让它别 catch 住顶端异常，或加 \`--log-level DEBUG\` |

## 一般套路

1. 把命令复制到终端里手敲一遍 —— 任务跑不起来的，手敲多半也跑不起来
2. 终端能跑、任务不能跑 → 八成是**工作目录**或**PATH 里的解释器**不一样
3. 偶发失败 → 去概览的热力图看有没有周期性（「总在周三挂」通常是对方系统维护）
`,
  workflow: `# 开发工作流

三步固定顺序：**Spec Kit 定方向 → 开发实现 → OpenCodeReview 审查**。

## 为什么是这个顺序

- **先定方向再动手** —— 不然后面全是返工
- **写完过一遍审查** —— 自己看不出自己的错

Spec Kit 是**前置步骤，不是可选项**：动手前先定「做什么、怎么做」，写完再 \`ocr\` 过一遍。

## 一、Spec Kit 定方向

**Spec Kit**（\`github/spec-kit\`，GitHub 官方）—— 「规范驱动开发」工具包。不是写代码的，是给 AI 编码助手套一层流程，让它**先写规范、再动手**。

九步流程：

| 步 | 干嘛 |
| --- | --- |
| constitution | 定规矩 |
| specify | 写需求 |
| clarify | 澄清 |
| plan | 技术方案 |
| checklist | 检查 |
| tasks | 拆任务 |
| analyze | 一致性分析 |
| implement | 实现 |
| converge | 收敛验收 |

日常用前三步就够：\`/speckit-specify → plan → tasks\`，定了「做什么、怎么做」再写代码。

**状态**：源码已下（\`spec-kit-main\` 目录），CLI 还没装。下次开工前先装 \`specify-cli\` 并初始化。

## 二、开发实现

按定好的规范写代码。

## 三、OpenCodeReview 审查

**OpenCodeReview**（\`ocr\`，阿里 \`alibaba/open-code-review\`）—— AI 代码审查 CLI。读 Git diff → 交给可配置的 LLM（带工具调用的 agent）→ 产出**精确到行**的结构化审查意见，内置多语言规则（空指针、线程安全、XSS、SQL 注入等）。

**状态**：已装好、配好 DeepSeek，随时 \`ocr review\` / \`ocr scan\`。

## 一句话

**定方向 → 写代码 → 过一遍审查。** Spec Kit 是前置，不是可选项。
`
}
