import { Icon } from './Icon'
import { useT } from '../i18n'

/**
 * 放大镜导航（借 bencho「Magnifying dock」）
 *
 * 传达的信息：**你在哪一页**。
 * 指针落上去时：全体先收 0.9，落点弹到 1.22，左右邻居各抬 1.06 ——
 * 于是「落点 + 还有谁在旁边」是一次手势就出来的，不用读文字。
 *
 * 为什么搬进顶栏（DESIGN 2.2）：导航项少于 6 个时，它不配占一整列。
 * 左侧一列 216px 意味着正文永远少 216px，而顶栏那一行本来就是空的。
 */
export interface NavItem {
  id: string
  label: string
  icon: string
}

interface NavDockProps {
  items: NavItem[]
  active: string
  onSelect: (id: string) => void
}

export function NavDock({ items, active, onSelect }: NavDockProps) {
  const t = useT()
  return (
    <nav className="dock" aria-label={t('nav.landmark')}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`dock-item${active === item.id ? ' on' : ''}`}
          aria-current={active === item.id ? 'page' : undefined}
          data-agent={`nav-${item.id}`}
          onClick={() => onSelect(item.id)}
        >
          <Icon name={item.icon} size={17} />
          <span className="dock-tip">{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
