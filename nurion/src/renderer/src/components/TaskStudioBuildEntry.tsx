import { Icon } from './Icon'
import { useT } from '../i18n'
import { openFloatingAgent } from '../agent-bus'
import type { Build } from '../run-types'

/**
 * ① 开工入口 —— 一句话说清要干什么，回车交给助手。
 * ⚠️ 这里**故意没有对话记录**：对话住在右下角悬浮窗里，页面上只留一条道。
 */
interface Props {
  brief: string
  onBrief: (v: string) => void
  build: Build | null
  busy: boolean
  onStart: () => void
}

export function BuildEntry({ brief, onBrief, build, busy, onStart }: Props) {
  const t = useT()
  return (
    <section className="card build-cmd">
      <span className="build-cmd-icon" aria-hidden="true">
        <Icon name={build ? 'activity' : 'bolt'} size={14} />
      </span>
      {build ? (
        <>
          <span className="build-cmd-input as-text">
            {t('be.building', {
              title: build.title,
              step: build.step,
              name: build.steps[build.step - 1]?.name || ''
            })}
          </span>
          <button className="action-btn" onClick={openFloatingAgent}>
            <Icon name="expand" size={14} /> {t('be.flow')}
          </button>
        </>
      ) : (
        <>
          <input
            className="build-cmd-input"
            value={brief}
            placeholder={t('be.placeholder')}
            onChange={(e) => onBrief(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onStart()
              }
            }}
          />
          <span className="build-cmd-where">{t('be.enter')}</span>
          <button className="action-btn primary" disabled={!brief.trim() || busy} onClick={onStart}>
            <Icon name="bolt" size={14} /> {t('be.start')}
          </button>
        </>
      )}
    </section>
  )
}
