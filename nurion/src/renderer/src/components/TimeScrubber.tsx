import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useT } from '../i18n'

/**
 * 时间轴（借 bencho「Reasoning slider」的发光尾巴 +「Time scrubber」的刻度）
 *
 * 传达的信息：**今天这 24 小时里，哪几段真的跑过**。
 * 轴下面那条「像条码一样」的小竖线就是跑过的时刻 —— 密度一眼可读，
 * 红色那几根是失败的。拖到任意时刻，上面就报那一刻的状态。
 *
 * ⚠️ 拖动时 --p 和时钟文字**直接写 DOM**，只有松手才回调父组件。
 * 每帧 setState 会让整张大卡重渲染，手一快就掉帧。
 */
export interface ScrubMark {
  /** 0..24 之间的小时数 */
  h: number
  ok: boolean
  text: string
}

interface TimeScrubberProps {
  /** 当前落点，0..24 小时 */
  value: number
  marks: ScrubMark[]
  onSeek: (h: number) => void
}

const DAY = 24

export function TimeScrubber({ value, marks, onSeek }: TimeScrubberProps) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const clock = useRef<HTMLSpanElement>(null)
  const at = useRef<HTMLSpanElement>(null)
  const p = useRef(value / DAY)
  const [live, setLive] = useState(false)

  const paint = (v: number): void => {
    p.current = v
    const el = box.current
    if (!el) return
    el.style.setProperty('--p', v.toFixed(4))
    const h = v * DAY
    const hh = Math.floor(h)
    const mm = Math.round((h - hh) * 60)
    if (clock.current) {
      clock.current.textContent = `${String(hh).padStart(2, '0')}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`
    }
    if (at.current) {
      const near = marks
        .filter((m) => m.h <= h)
        .sort((a, b) => b.h - a.h)[0]
      at.current.textContent = near ? near.text : '这一刻没有记录'
    }
  }

  // 落点变了（拖完 / 父组件改了 value）就重画读数。
  // 拖动过程中不 setState，所以这个 effect 只在「松手」时跑一次。
  useEffect(() => {
    paint(value / DAY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, marks])

  const toValue = (clientX: number): number => {
    const el = box.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)))
  }

  const down = (e: PointerEvent<HTMLDivElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setLive(true)
    paint(toValue(e.clientX))
  }
  const move = (e: PointerEvent<HTMLDivElement>): void => {
    if (live) paint(toValue(e.clientX))
  }
  const up = (e: PointerEvent<HTMLDivElement>): void => {
    if (!live) return
    setLive(false)
    const v = toValue(e.clientX)
    paint(v)
    onSeek(v * DAY)
  }

  return (
    <div
      ref={box}
      className={`scrub${live ? ' is-live' : ''}`}
      style={{ ['--p' as string]: (value / DAY).toFixed(4) }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      role="slider"
      aria-label={t('ov.timeline')}
      aria-valuemin={0}
      aria-valuemax={24}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
    >
      <div className="scrub-track" />
      <div className="scrub-fill" />
      <div className="scrub-marks">
        {marks.map((m, i) => (
          <span
            key={i}
            className="scrub-mark"
            data-ok={m.ok}
            style={{ left: `${(m.h / DAY) * 100}%` }}
            title={`${String(Math.floor(m.h)).padStart(2, '0')}:${String(Math.round((m.h % 1) * 60)).padStart(2, '0')} ${m.text}`}
          />
        ))}
      </div>
      <div className="scrub-knob" />
      {/* 读数完全由上面的 paint() 写进来 —— React 不管这两个 span 的文字 */}
      <div className="scrub-readout">
        <span className="scrub-clock" ref={clock} />
        <span className="scrub-at" ref={at} />
      </div>
    </div>
  )
}
