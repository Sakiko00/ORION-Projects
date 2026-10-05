import { useState } from 'react'
import { ProgressTicks } from './ProgressTicks'

/**
 * 动态岛（借 bencho「Dynamic island」）
 *
 * 传达的信息：**后台在干什么、跑到第几步**。
 *
 * 它存在的原因是 DESIGN 5.2 那句话：「自动 ≠ 偷偷摸摸」。
 * 后台任务最怕的不是失败，是**你不知道它在跑** —— 于是你会去点第二遍。
 * 所以：空闲时它缩成一颗小胶囊（不占地方），一有事就长开（看得见）。
 */
export type IslandState = 'idle' | 'run' | 'done' | 'error' | 'alert'

/** 跑的时候那颗刻度。
 * ⚠️ **是写死的假进度** —— 现在没有真进度可数。写在这里是因为标题栏、桌宠、
 *    设置页预览三处都要它，各写一份早晚会不一样。哪天真能数出来，改这一处。 */
export const RUN_TICKS = { total: 4, done: 1, current: 1 }

interface DynamicIslandProps {
  state: IslandState
  label: string
  meta?: string
  ticks?: { total: number; done: number; current: number }
  action?: { label: string; onClick: () => void }
}

export function DynamicIsland({ state, label, meta, ticks, action }: DynamicIslandProps) {
  const [hover, setHover] = useState(false)
  const open = hover || state === 'run' || state === 'error' || state === 'done'

  return (
    <div
      className="island"
      data-state={state}
      data-open={open}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      role="status"
      aria-live="polite"
    >
      <span className="island-dot" />
      <span className="island-label">{label}</span>

      <div className="island-body">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {ticks && <ProgressTicks total={ticks.total} done={ticks.done} current={ticks.current} />}
          {meta && <span className="island-meta">{meta}</span>}
          {action && (
            <button type="button" className="island-act" onClick={action.onClick}>
              {action.label}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
