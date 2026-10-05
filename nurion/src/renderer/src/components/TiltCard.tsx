import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react'

/**
 * 倾斜卡（借 bencho「Tilt card」+ 柔光 glare）
 *
 * 传达的信息：**「这一块是可以指的东西」**——
 * 高光跟着指针走 = 它有实体；没有高光的区域就是背景，不是控件。
 *
 * 关键实现：--mx / --my 和 transform **直接写到 DOM 上，不走 state**。
 * 鼠标一动就 setState 会把整页重渲染（DESIGN 1.4 专门点名过这条）。
 */
interface TiltCardProps {
  children: ReactNode
  className?: string
  /** 最大倾斜角度。超过 5° 就开始晕，默认 3.2° */
  max?: number
  style?: CSSProperties
}

export function TiltCard({ children, className = '', max = 3.2, style }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null)

  const onMove = (e: PointerEvent<HTMLDivElement>): void => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const nx = (e.clientX - r.left) / r.width
    const ny = (e.clientY - r.top) / r.height
    el.style.setProperty('--mx', `${(nx * 100).toFixed(2)}%`)
    el.style.setProperty('--my', `${(ny * 100).toFixed(2)}%`)
    el.classList.add('is-live')
    el.style.transform =
      `perspective(1000px) rotateX(${((0.5 - ny) * max).toFixed(2)}deg)` +
      ` rotateY(${((nx - 0.5) * max).toFixed(2)}deg)`
  }

  const reset = (): void => {
    const el = ref.current
    if (!el) return
    el.classList.remove('is-live')
    el.style.transform = ''
  }

  return (
    <div
      ref={ref}
      className={`tilt ${className}`}
      style={style}
      onPointerMove={onMove}
      onPointerLeave={reset}
    >
      {children}
    </div>
  )
}
