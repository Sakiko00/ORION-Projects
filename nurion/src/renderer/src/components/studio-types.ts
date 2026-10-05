/** 构建页的共享类型、常量和小工具 —— 拆分出来的组件都从这里拿 */

export interface StudioTask {
  id: string
  name: string
  agent: string
  schedule: string
  enabled: boolean
  lastRun?: string
  status?: 'ok' | 'alert' | 'idle'
  cmd?: string
  cwd?: string
}

/** 一次已经结束的运行 —— 构建页回看历史用的精简版 */
export interface TaskRun {
  id: string
  taskId: string
  at: string
  ok: boolean
  ms: number
  trigger?: 'manual' | 'agent' | 'schedule'
}

/** 详情卡里正在编辑的那份草稿 */
export interface Draft {
  id: string
  name: string
  cmd: string
  cwd: string
  schedule: string
  agent: string
  enabled: boolean
}

export type StudioTab = 'log' | 'art' | 'hist'

export const BLANK: Draft = {
  id: '',
  name: '',
  cmd: '',
  cwd: '',
  schedule: '手动触发',
  agent: '',
  enabled: true
}

export const SCHEDULE_PRESETS = ['手动触发', '每天 08:30', '每天 09:00', '每天 18:00']

export const TRIGGER_LABEL: Record<string, string> = {
  manual: 'trig.manual',
  schedule: 'trig.schedule',
  agent: 'trig.agent'
}

/**
 * 调度值是**存进 tasks.json 的数据**（「手动触发」「每天 08:30」），不能为了翻译改它 ——
 * 改了老任务就对不上了。所以在显示层做一层映射：认得的翻，认不得的原样返回。
 * 自定义时间（「每天 23:15」这种）也能接住，不用写死预设。
 */
export function scheduleText(s: string, t: (k: string, v?: Record<string, string | number>) => string): string {
  if (s === '手动触发') return t('sched.manual')
  const m = /^每天\s*(\d{1,2}:\d{2})$/.exec(s)
  if (m) return t('sched.daily', { time: m[1] })
  return s
}

export const fmtAt = (iso: string): string =>
  new Date(iso).toLocaleString('zh-CN', { hour12: false }).slice(5)
export const secs = (ms: number): string => `${(ms / 1000).toFixed(1)}s`
