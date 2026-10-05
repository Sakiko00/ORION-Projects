import { NavDock, type NavItem } from './NavDock'
import { DynamicIsland, type IslandState } from './DynamicIsland'
import { WindowControls } from './WindowControls'
import { Icon } from './Icon'
import { useT } from '../i18n'

/**
 * 自绘标题栏（frame: false）—— 借 bencho 的「把导航和状态都收进一条栏」思路。
 *
 * 一条栏上四段：
 *   [放大镜导航]   ……   [动态岛]   ……   [刷新 / 红绿灯]
 *
 * ⚠️ 整条是拖拽区（-webkit-app-region: drag），
 * 里面每个可点元素都必须 no-drag（在 app.css 里统一处理），
 * 否则「点它」等于「拖窗口」。
 */
interface TitleBarProps {
  nav: NavItem[]
  active: string
  onNav: (id: string) => void
  island: {
    state: IslandState
    label: string
    meta?: string
    ticks?: { total: number; done: number; current: number }
    action?: { label: string; onClick: () => void }
  }
  onRefresh: () => void
}

export function TitleBar({ nav, active, onNav, island, onRefresh }: TitleBarProps) {
  const t = useT()
  return (
    <header className="titlebar">
      <div className="tb-left">
        <NavDock items={nav} active={active} onSelect={onNav} />
      </div>

      <div className="tb-center">
        <DynamicIsland {...island} />
      </div>

      <div className="tb-right">
        <button className="icon-btn" title={t('tb.refresh')} data-agent="refresh" onClick={onRefresh}>
          <Icon name="refresh" size={17} />
        </button>
        {/* 红绿灯挪到右上角 —— 关闭/最小化/最大化贴着最右 */}
        <WindowControls />
      </div>
    </header>
  )
}
