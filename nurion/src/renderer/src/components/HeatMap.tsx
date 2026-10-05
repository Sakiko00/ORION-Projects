import { Fragment } from 'react'
import { useT } from '../i18n'

/**
 * 采集健康热力图（借 bencho「Heat map」）
 *
 * 传达的信息：**最近三周，哪个任务哪天成了、哪天断了**。
 * 一行一个任务、一列一天 —— 要的就是「一眼扫过去」：
 * 「总在周三挂」这种事，表格里看不出来，这里一眼就有。
 *
 * ⚠️ 为什么是 21 天：卡片宽 480，格子靠 aspect-ratio 保持方块。
 * 列再多（30 天）每格就比缝还窄，那就不叫密度图了。三周正好三个完整周期。
 *
 * ⚠️ 为什么没有日期轴：21 个「日」的数字除了制造噪点没有别的用处 ——
 * 卡片的副标题已经交代了窗口。真要具体某天，指上去有 title。
 *
 * 布局上「标签列 + 格子」放在**同一个 grid**里，不放两层：
 * 这样标签的行高天然跟格子对齐（格子靠 aspect-ratio 定高），不会错位。
 */
export type HeatLevel = 0 | 1 | 2 | 3 | 4 | 'x' | null

interface HeatMapProps {
  days: string[]
  rows: { name: string; cells: HeatLevel[] }[]
}

export const HEAT_LEGEND: { lv: HeatLevel; label: string }[] = [
  { lv: 0, label: 'heat.none' },
  { lv: 2, label: 'heat.partial' },
  { lv: 4, label: 'heat.ok' },
  { lv: 'x', label: 'heat.fail' }
]

type Tr = (key: string) => string

function describe(lv: HeatLevel, t: Tr): string {
  if (lv === null) return t('heat.empty')
  if (lv === 'x') return t('heat.fail')
  if (lv === 0) return t('heat.none')
  if (lv === 4) return t('heat.ok')
  return t('heat.partlyok')
}

export function HeatMap({ days, rows }: HeatMapProps) {
  const t = useT()
  return (
    <div className="heat" style={{ gridTemplateColumns: `96px repeat(${days.length}, minmax(0, 1fr))` }}>
      {/* 日期轴：第一格留空对齐标签列，后面每列标「日」；每月 1 日加粗突出 */}
      <span />
      {days.map((d) => (
        <span
          key={d}
          className="heat-axis"
          title={d}
          data-start={d.slice(8) === '01' ? 'true' : undefined}
        >
          {d.slice(8)}
        </span>
      ))}
      {rows.map((r) => (
        <Fragment key={r.name}>
          <span className="heat-name" title={r.name}>
            {r.name}
          </span>
          {r.cells.map((c, i) => (
            <span
              key={`${r.name}-${days[i]}`}
              className="heat-cell"
              data-lv={c === null ? undefined : c}
              title={`${days[i]} · ${describe(c, t)}`}
            />
          ))}
        </Fragment>
      ))}
    </div>
  )
}

/** 图例就一行色块 —— 文字说明进 title，别占着一整行 */
export function HeatLegend() {
  const t = useT()
  return (
    <span className="heat-legend">
      {HEAT_LEGEND.map((l) => (
        <span key={l.label} className="heat-legend-item" title={t(l.label)}>
          <i className="heat-cell" data-lv={l.lv === null ? undefined : l.lv} />
          {t(l.label)}
        </span>
      ))}
    </span>
  )
}
