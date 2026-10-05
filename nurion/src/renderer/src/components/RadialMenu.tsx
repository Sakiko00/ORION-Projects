import { useEffect } from 'react'
import { Icon } from './Icon'

/**
 * 径向菜单（借 bencho「Radial menu」）
 *
 * 传达的信息：**「对这一个任务，我能做什么」**。
 * 就地长出来，不跳页、不改上下文 —— 长按哪张卡，菜单就以哪张卡为圆心。
 * 距离是它唯一的优点：鼠标从手指头下走到目标，是「一寸」而不是「一屏」。
 */
export interface RadialItem {
  key: string
  label: string
  icon: string
  danger?: boolean
}

interface RadialMenuProps {
  /** 圆心（视口坐标） */
  x: number
  y: number
  title: string
  items: RadialItem[]
  onPick: (key: string) => void
  onClose: () => void
}

const RADIUS = 96

export function RadialMenu({ x, y, title, items, onPick, onClose }: RadialMenuProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="radial" role="menu" aria-label={title}>
      <div className="radial-scrim" onClick={onClose} onContextMenu={(e) => e.preventDefault()} />

      <div className="radial-core" style={{ left: x, top: y }}>
        {title}
      </div>

      {items.map((item, i) => {
        const a = -90 + (360 / items.length) * i
        return (
          <button
            key={item.key}
            type="button"
            className="radial-item"
            data-danger={item.danger}
            style={{
              left: x,
              top: y,
              ['--i' as string]: i,
              transform: `translate(-50%, -50%) rotate(${a}deg) translateX(${RADIUS}px) rotate(${-a}deg)`
            }}
            onClick={() => {
              onPick(item.key)
              onClose()
            }}
          >
            <Icon name={item.icon} size={17} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
