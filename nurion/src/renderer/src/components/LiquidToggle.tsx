/**
 * 液态开关（借 bencho「Liquid toggle」）
 *
 * 传达的信息：**这个任务现在是活的还是停的**。
 * 有意义的细节不是颜色，是「按下去那一瞬间圆点被压长」——
 * 那一下形变就是「状态正在变」本身，比颜色突变好读。
 */
interface LiquidToggleProps {
  on: boolean
  onChange: (next: boolean) => void
  label?: string
  /** 忙 / 状态还不知道的时候锁住。渠道开关在打 IPC，连点会打两条同源命令 */
  disabled?: boolean
}

export function LiquidToggle({ on, onChange, label, disabled }: LiquidToggleProps) {
  return (
    <button
      type="button"
      className="lq"
      aria-pressed={on}
      disabled={disabled}
      aria-label={label || (on ? '停用' : '启用')}
      title={on ? '已启用，点击停用' : '已停用，点击启用'}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!on)
      }}
    >
      <span className="lq-dot" />
    </button>
  )
}
