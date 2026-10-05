/**
 * 告警标题的**显示层**拼装。
 *
 * 自己生成的告警（`source: 'workbench'`）库里**只存任务名**，句子在词条里 ——
 * 和调度值一个道理：拿中文句子当数据，切到英文就露馅，而且改文案的人
 * 不会知道有代码在依赖那句话。
 *
 * 外部推来的告警标题是别人给的原文，原样显示（翻不了，也不该翻）。
 */
type TFn = (key: string, vars?: Record<string, string | number>) => string

/** 上一版主进程写库的标题形式（`「任务名」执行失败`）。主进程已在读的时候归一，
 *  这里再兜一层：主进程要重启才生效，兜住重启前那一屏，别显示成「…执行失败」执行失败。 */
const LEGACY_FAIL = /^「(.+)」执行失败$/

export function alertTitle(a: { source?: string; title?: string }, t: TFn): string {
  const raw = a.title || ''
  if (a.source !== 'workbench') return raw
  return t('alert.run.fail', { name: LEGACY_FAIL.exec(raw)?.[1] ?? raw })
}
