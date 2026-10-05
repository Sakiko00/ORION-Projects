import { spawn, type ChildProcess } from 'node:child_process'
import * as alerts from './alerts'
import * as vault from './vault'
import { registerMainOp } from './ui-bridge'

/**
 * 运行器 —— 真的把任务跑起来的那部分。
 *
 * 「插件」的全部就是一条命令行：python / node / ps1 都行，
 * 只要能写成一行、给个工作目录，就能挂成任务。
 * **不发明 manifest、不发明插件 SDK** —— 那类东西的维护成本比它解决的问题大。
 *
 * 为什么执行放在主进程、而不是 agent 子进程（mcp-server）里：
 * 「谁在跑」只能有一份真相。子进程当然也能 spawn，但那样界面看不见实时输出、
 * 也没法统一停掉。所以 agent 要执行，得走管道请主进程代劳（见下方 registerOps）。
 */

export interface RunEvent {
  type: 'start' | 'out' | 'exit'
  runId: string
  taskId: string
  taskName: string
  /** out：这一小段输出 */
  chunk?: string
  /** exit */
  code?: number
  ok?: boolean
  ms?: number
  /** exit：这一次跑动了 output/ 下哪些文件 */
  artifacts?: string[]
  /** exit：谁让它跑的 */
  trigger?: 'manual' | 'agent' | 'schedule'
  /** start */
  cmd?: string
  cwd?: string
}

interface Current {
  runId: string
  taskId: string
  taskName: string
  cmd: string
  cwd: string
  child: ChildProcess
  startedAt: number
  /** 最近若干行输出，供界面一进来就能看到「现在到哪了」 */
  tail: string[]
}

let current: Current | null = null
let starting = false
const listeners = new Set<(e: RunEvent) => void>()
const MAX_TAIL = 300

export function onEvent(cb: (e: RunEvent) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function emit(e: RunEvent): void {
  for (const l of listeners) l(e)
}

export function running(): {
  runId: string
  taskId: string
  taskName: string
  cmd: string
  cwd: string
  since: number
  tail: string[]
} | null {
  if (!current) return null
  return {
    runId: current.runId,
    taskId: current.taskId,
    taskName: current.taskName,
    cmd: current.cmd,
    cwd: current.cwd,
    since: current.startedAt,
    tail: current.tail.slice(-8)
  }
}

function localDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function start(
  taskId: string,
  trigger: 'manual' | 'agent' | 'schedule' = 'manual'
): Promise<{ runId: string }> {
  if (current) throw new Error(`「${current.taskName}」还在跑 —— 等它完，或者先停掉`)
  // 同步占位：start 里有 await，两个并发调用会同时通过上面的 null 检查。
  // 先置位，第二个进来的直接拦下，不等到 spawn 之后才发现撞车。
  if (starting) throw new Error('正在启动一个任务，稍等一下')
  starting = true
  try {
    const task = await vault.getTask(taskId)
    if (!task.enabled) throw new Error(`「${task.name}」已停用`)
    const declared = String(task.cmd || '').trim()
    if (!declared) throw new Error(`「${task.name}」还没接线：这条任务没有命令`)

    // {date} 换成当天 —— 采集类任务的参数几乎总是「今天/昨天」
    const line = declared.replace(/\{date\}/g, localDate())
    const cwd = task.cwd || vault.getVault()
    const runId = vault.newRunId()
    const startedAt = Date.now()

    // 跑之前先给 output/ 拍一张快照 —— 跑完再拍一张 diff 出「这一次动了哪些文件」。
    // 比让脚本自己声明可靠：脚本忘了写声明、或者写错了，界面就瞎了。
    const before = await vault.snapshotArtifacts().catch(() => ({} as Record<string, string>))

    const child = spawn(line, {
      cwd,
      shell: true, // 任务本来就是「用户自己写的一行命令」，这里不做二次解析
      windowsHide: true,
      env: {
        ...process.env,
        // 中文 Windows 上 python 默认按 GBK 输出，Node 按 utf8 读 → 日志全是乱码。
        // 这三个变量治根：让子进程自己就说 UTF-8。
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
        PYTHONUNBUFFERED: '1'
      }
    })

    current = { runId, taskId, taskName: task.name, cmd: line, cwd, child, startedAt, tail: [] }
    emit({ type: 'start', runId, taskId, taskName: task.name, cmd: line, cwd })
    void vault.writeRunLog(runId, `$ cd ${cwd}\n$ ${line}\n\n`)

    const push = (raw: Buffer | string): void => {
      const text = raw.toString()
      void vault.writeRunLog(runId, text)
      if (!current || current.runId !== runId) return
      for (const ln of text.split(/\r?\n/)) {
        if (!ln.trim()) continue
        current.tail.push(ln)
        if (current.tail.length > MAX_TAIL) current.tail.shift()
      }
      emit({ type: 'out', runId, taskId, taskName: task.name, chunk: text })
    }

    child.stdout?.on('data', push)
    child.stderr?.on('data', push)
    child.on('error', (e) => push(`\n[启动失败] ${e.message}\n`))

    child.on('close', (code) => {
      const ms = Date.now() - startedAt
      const exit = typeof code === 'number' ? code : -1
      const ok = exit === 0
      if (current?.runId === runId) current = null
      void vault.writeRunLog(runId, `\n[退出码 ${exit} · ${(ms / 1000).toFixed(1)}s]\n`)

      // 产物要在 emit 之前算完 —— 界面拿到 exit 事件就得能立刻列出产物，
      // 否则得再等一次往返，看起来像「跑完了但没东西」。
      void changedArtifacts(before).then((artifacts) => {
        emit({ type: 'exit', runId, taskId, taskName: task.name, code: exit, ok, ms, artifacts, trigger })
        void vault
          .finishRun(taskId, { runId, ok, ms, code: exit, artifacts, trigger })
          .catch(() => undefined)
      })

      // 失败就出一条警 —— 这是「第一个警」：不用等外部告警源，数据现成。
      // 传 source: 'workbench' 让它一眼能和外部推来的警区分开。
      //
      // ⚠️ 正文里**不要放 runId**：去重是按「来源+标题+正文前 200 字」算的，
      // 带上 runId 就每次都不一样 —— 同一任务连挂 5 次会刷出 5 条警。
      // 要查是哪一次，用 list_runs / read_run_log 就行（agent 有这两个工具）。
      if (!ok) {
        void alerts
          .intake({
            source: 'workbench',
            level: 'error',
            /* ⚠️ 标题只存**任务名**（数据），正文也只用中性写法：
               「失败」那句话和标签在显示层用词条拼（切英文才不会露中文）。 */
            title: task.name,
            text: `exit ${exit} · ${(ms / 1000).toFixed(1)}s\n${line}`
          })
          .catch(() => undefined)
      }
    })

    return { runId }
  } finally {
    starting = false
  }
}

/**
 * 跑前跑后两张 output/ 快照的 diff。
 *
 * 判据是「新增的」或「变过的」，**不含「被删掉的」** ——
 * 任务清掉一个临时文件，不该在界面上被当成产出展示。
 */
async function changedArtifacts(before: Record<string, string>): Promise<string[]> {
  const after = await vault.snapshotArtifacts().catch(() => ({} as Record<string, string>))
  return Object.entries(after)
    .filter(([name, sig]) => before[name] !== sig)
    .map(([name]) => name)
    .sort()
}

/** Windows 上子进程常常带孙进程（python 起浏览器），只 kill 自己会留孤儿 */
function killTree(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  } else {
    try {
      child.kill('SIGTERM')
    } catch {
      /* 已经没了 */
    }
  }
}

export function stop(): boolean {
  if (!current) return false
  killTree(current.child)
  return true
}

/** 退出应用时别留孤儿进程 */
export function killSync(): void {
  if (!current) return
  killTree(current.child)
  current = null
}

/* ---------- 让 agent（MCP 子进程）能请主进程代跑 ---------- */

export function registerOps(): void {
  registerMainOp('run_task', async (args) => {
    const id = String(args.id || '')
    if (!id) throw new Error('缺少 id')
    // 走管道来的都是**引擎（AI）**让跑的，和界面上手动点要能区分开
    return start(id, 'agent')
  })
  registerMainOp('stop_task', async () => ({ stopped: stop() }))
  registerMainOp('run_status', async () => running())
}
