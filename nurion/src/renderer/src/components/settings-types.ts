import type { PetConfig } from '../run-types'
import type { FontSize, Lang, ThemeMode } from '../ui-prefs'

/**
 * 设置页的类型与常量 —— 容器和三个模块共用一份。
 *
 * 单独一个文件是为了让「加一个配置项」只改一处：
 * 以前类型散在组件里，加个字段要同时改三四个地方，漏一个就是 undefined。
 */

export interface EngineState {
  state?: string
  message?: string
  /** 机器原因码（`eng.reason.*` 里有对应词条）—— 界面按它翻，不再直接用 message */
  reason?: string
  /** reason 里要填进词条的动态部分（退出码、秒数、异常原文） */
  detail?: string
  python?: string | null
  pyVersion?: string | null
  /** 引擎来自「随包」还是「用户机器上的 Python」—— 隔离有没有生效，看这个 */
  source?: 'bundled' | 'system' | null
  installed?: boolean
  version?: string | null
  pid?: number | null
  config?: string
  /** 我们亲手拉起引擎的时刻；外部已在跑时为 null（不编数字） */
  since?: number | null
  /** 监听端口，和日志里那条 endpoint 对得上 */
  apiPort?: number
}

export interface EngineSettings {
  baseURL: string
  apiKey: string
  model: string
  workspace: string
}

export const EMPTY_SETTINGS: EngineSettings = {
  baseURL: '',
  apiKey: '',
  model: '',
  workspace: ''
}

/** 状态的 i18n key —— 标签文案走词典，不在代码里写死 */
export const STATE_LABEL_KEY: Record<string, string> = {
  stopped: 'set.engine.stopped',
  starting: 'set.engine.starting',
  running: 'set.engine.running',
  error: 'set.engine.error'
}

/** 状态点的语义色：ok = 绿，wait = 中性，bad = 红 */
export type Tone = 'ok' | 'wait' | 'bad'

export const STATE_TONE: Record<string, Tone> = {
  running: 'ok',
  starting: 'wait',
  stopped: 'wait',
  error: 'bad'
}

export const PET_SHAPES: { id: PetConfig['shape']; label: string }[] = [
  { id: 'cube', label: 'shape.cube' },
  { id: 'ball', label: 'shape.ball' },
  { id: 'pill', label: 'shape.pill' },
  { id: 'hexagon', label: 'shape.hexagon' }
]

export const PET_EYES: { id: PetConfig['eyes']; label: string }[] = [
  { id: 'slant', label: 'eyes.slant' },
  { id: 'dots', label: 'eyes.dots' },
  { id: 'squares', label: 'eyes.squares' }
]

export const THEME_MODES: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'theme.light' },
  { id: 'dark', label: 'theme.dark' },
  { id: 'system', label: 'theme.system' }
]

export const FONT_SIZES: { id: FontSize; label: string }[] = [
  { id: 'sm', label: 'font.sm' },
  { id: 'md', label: 'font.md' },
  { id: 'lg', label: 'font.lg' }
]

export const LANGUAGES: { id: Lang; label: string }[] = [
  { id: 'zh', label: 'lang.zh' },
  { id: 'en', label: 'lang.en' }
]
