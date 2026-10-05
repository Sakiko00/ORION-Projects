import { useRef, useState, type PointerEvent } from 'react'
import { Icon } from './Icon'

/**
 * 滑动确认（借 bencho「Slide to confirm」）
 *
 * 传达的信息：**这一下是「真的要动手了」**。
 * 「立即运行」会真去采集、真写文件、真覆盖昨天那份 Excel —— 点一下太轻了。
 * 拖到底才算数：防误触。这是这里唯一值得加一道摩擦的动作。
 *
 * 松手时没过线就弹回原位（回弹曲线走 --ease-spring），
 * 「差一点」和「够到了」在手上的感觉完全不同 —— 不用文字解释。
 */
const KNOB = 32
const INSET = 3
const THRESHOLD = 0.82

interface SlideToConfirmProps {
  label: string
  hint?: string
  disabled?: boolean
  onConfirm: () => void
}

export function SlideToConfirm({ label, hint = '拖到底', disabled = false, onConfirm }: SlideToConfirmProps) {
  const track = useRef<HTMLDivElement>(null)
  const p = useRef(0)
  const [live, setLive] = useState(false)
  const [done, setDone] = useState(false)

  const travel = (): number => {
    const el = track.current
    return el ? Math.max(1, el.clientWidth - KNOB - INSET * 2) : 1
  }

  const paint = (v: number): void => {
    p.current = v
    const el = track.current
    if (!el) return
    el.style.setProperty('--p', v.toFixed(4))
    const knob = el.querySelector('.slide-knob') as HTMLElement | null
    if (knob) knob.style.translate = `${(v * travel()).toFixed(1)}px 0`
  }

  const down = (e: PointerEvent<HTMLDivElement>): void => {
    if (disabled || done) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setLive(true)
  }

  const move = (e: PointerEvent<HTMLDivElement>): void => {
    if (!live) return
    const el = track.current
    if (!el) return
    const x = e.clientX - el.getBoundingClientRect().left - INSET - KNOB / 2
    paint(Math.max(0, Math.min(1, x / travel())))
  }

  const up = (): void => {
    if (!live) return
    setLive(false)
    if (p.current >= THRESHOLD) {
      setDone(true)
      paint(1)
      onConfirm()
      window.setTimeout(() => {
        setDone(false)
        paint(0)
      }, 900)
    } else {
      paint(0)
    }
  }

  return (
    <div
      ref={track}
      className={`slide${live ? ' is-live' : ''}`}
      data-done={done}
      role="button"
      aria-label={`${label}（按住滑块拖到最右）`}
      aria-disabled={disabled}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <div className="slide-fill" />
      <span className="slide-label">{done ? '已触发' : label}</span>
      <span className="slide-hint">{done ? '' : hint}</span>
      <div className="slide-knob">
        <Icon name={done ? 'check' : 'play'} size={15} />
      </div>
    </div>
  )
}
