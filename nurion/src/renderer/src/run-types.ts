/**
 * 运行事件 —— 主进程的运行器推给界面的东西。
 * 单独一个文件是因为 preload 的 global.d.ts 也要引它（声明文件里不方便定义新类型）。
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

/** 现在在跑什么（应用重启后也能问回来） */
export interface RunningInfo {
  runId: string
  taskId: string
  taskName: string
  cmd: string
  cwd: string
  since: number
  tail: string[]
}

/** 界面上正在跟踪的那一次运行（从 run:event 里长出来） */
export interface LiveRun {
  runId: string
  taskId: string
  taskName: string
  cmd: string
  lines: string[]
  done?: {
    code: number
    ok: boolean
    ms: number
    artifacts?: string[]
    trigger?: 'manual' | 'agent' | 'schedule'
  }
}

/** 产物 —— 就是 output/ 下的文件，展示方式由扩展名定（见主进程 vault.ts） */
export interface ArtifactMeta {
  /** 相对 output/ 的路径 */
  name: string
  size: number
  updatedAt: string
  kind: 'image' | 'table' | 'text' | 'sheet' | 'other'
}

/* ── 构建流程（固定 6 步，每步一道门槛）────────────────────────────────
 * 定义放这儿是为了让 global.d.ts 能引（声明文件里不便定义新类型）。
 * **步名和「这一步交什么」不在这儿** —— 在主进程 vault.ts 的 BUILD_STEPS，
 * 那是唯一一份，界面照着它画。写两处迟早对不上。 */

export type BuildState = 'todo' | 'doing' | 'wait' | 'passed' | 'rejected'

export interface BuildStep {
  i: number
  name: string
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
  title: string
  brief: string
  /** 当前在第几步（1..6） */
  step: number
  state: BuildState
  /** 停在门槛上时必须回的话：干完了什么 / 下一步干什么 / 要你拍板什么 */
  ask?: string
  steps: BuildStep[]
  history: { at: string; step: number; action: 'doing' | 'wait' | 'pass' | 'reject'; note?: string }[]
  taskId?: string
  taskName?: string
  finishedAt?: string
  createdAt: string
  updatedAt: string
}

/** 读回来的产物：图带 dataUrl，文/表带 text，其余只有元信息 */
export interface ArtifactContent extends ArtifactMeta {
  text?: string
  dataUrl?: string
}

/** 一次对话事件（主进程的 assistant 推上来） */
export interface AssistantEvent {
  type: 'start' | 'delta' | 'tool' | 'done' | 'error'
  turnId: string
  text?: string
  name?: string
  args?: string
  ms?: number
  message?: string
  engineDown?: boolean
  /** provider（模型服务商）侧的故障：欠费 / key 失效 / 限流 */
  providerDown?: boolean
}

/** 界面上的一条消息 */
export interface ChatMessage {
  id: string
  role: 'you' | 'ai'
  text: string
  /** 它这一轮调过哪些工具 */
  tools?: {
    name: string
    args?: string
    /** 这个工具事件**到达界面**的时刻（ms）—— 看进度用，落库不在乎 */
    at?: number
  }[]
  /** ISO 时间（落库用） */
  at?: string
  /** 正在流式接收中 */
  streaming?: boolean
  error?: string
  engineDown?: boolean
  /** provider 侧的故障（欠费/失效），不是它答错了 */
  providerDown?: boolean
  ms?: number
}

/** 一条警（主进程的 alerts 推上来） */
export interface VaultAlert {
  id: string
  at: string
  source: string
  level: 'info' | 'warn' | 'error'
  title: string
  text: string
  ack: boolean
}

export interface AlertEvent {
  type: 'new' | 'ack'
  alert: VaultAlert
  deduped?: boolean
}

/** 桌宠形象配置（设置页里换，落 vault/pet.json）。
 * ⚠️ 曾经有 `follow` / `bounce` 两个字段（眼睛跟随幅度 / 回弹）：
 * 桌宠和设置页预览**都传 `external`**，而这两个值一个只在 `external === false`
 * 的分支里被读（`bounce`）、一个只是个线性缩放（`follow`）。
 * 它们只是两个滑块，改不出看得见的差别 —— 删掉，不留在数据里占位。 */
export interface PetConfig {
  shape: 'cube' | 'ball' | 'pill' | 'hexagon'
  eyes: 'slant' | 'dots' | 'squares'
  /** 大小 px，60..90 */
  size: number
  /** 桌宠开不开。默认关 —— 它是个彩蛋，不该谁都一开机就被它占一块桌面 */
  enabled: boolean
}
