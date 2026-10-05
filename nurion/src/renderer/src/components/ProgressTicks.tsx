/**
 * 步骤刻度（借 bencho「Progress ticks」）
 *
 * 传达的信息：**跑到第几步**。
 * 刻度比百分比诚实 —— 你能看见一共几格、还差几格；
 * 百分比只给一个数，看不出「后面还有没有」。
 */
interface ProgressTicksProps {
  total?: number
  /** 已完成的格数 */
  done?: number
  /** 正在跑的那一格（0 基）。-1 表示没有 */
  current?: number
  /** 失败的那一格（0 基） */
  failed?: number
  /** 直接给每格的状态（「近 7 天哪天成了」这种）。给了它就忽略 total/done/current */
  pattern?: ('on' | 'fail' | '')[]
}

export function ProgressTicks({ total = 0, done = 0, current = -1, failed = -1, pattern }: ProgressTicksProps) {
  const cells: ('on' | 'fail' | 'cur' | '')[] =
    pattern ??
    Array.from({ length: total }, (_, i) =>
      i === failed ? 'fail' : i < done ? 'on' : i === current ? 'cur' : ''
    )

  return (
    <div className="ticks" role="img" aria-label={`共 ${cells.length} 步，已完成 ${cells.filter((c) => c === 'on').length} 步`}>
      {cells.map((c, i) => (
        <span
          key={i}
          className="tick"
          data-on={c === 'on' || c === 'cur'}
          data-cur={c === 'cur'}
          data-fail={c === 'fail'}
        />
      ))}
    </div>
  )
}
