import { useLayoutEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { useT } from '../i18n'
import type { ScriptLite } from '../agent-chat'
import { scheduleText, type StudioTask } from './studio-types'

/**
 * ② 任务清单 —— 勾着的=在跑，空着的=停了，一眼分得出来。
 * 底下还挂着「还没接线的脚本」—— 脚本写完不挂任务，等于没写。
 */
interface Props {
  tasks: StudioTask[]
  draftId: string
  runningTaskId: string | null
  onCount: number
  orphans: ScriptLite[]
  onPick: (t: StudioTask) => void
  onToggle: (t: StudioTask) => void
  onMakeTask: (s: ScriptLite) => void
  onNew: () => void
}

export function TaskList({
  tasks,
  draftId,
  runningTaskId,
  onCount,
  orphans,
  onPick,
  onToggle,
  onMakeTask,
  onNew
}: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const t = useT()
  /** 选中高亮条的位置/高度 —— 切换时靠 CSS transition 滑过去，而不是跳变 */
  const [slider, setSlider] = useState<{ top: number; height: number } | null>(null)

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const row = list.querySelector<HTMLElement>('.check-row[data-picked="true"]')
    if (!row) {
      setSlider(null)
      return
    }
    setSlider({ top: row.offsetTop, height: row.offsetHeight })
  }, [draftId, tasks])

  /* 任务状态 → 点色 + 文字。
     ⚠️ `status` 是**空的**就是「从没跑过」（和没有 lastRun 一致），**不是「正常」**——
     给它配个灰点加「未跑」，别让它看着像一切正常。 */
  const taskState = (s?: string): { tone: string; dot: string; label: string } =>
    s === 'ok'
      ? { tone: 'ok', dot: 'online', label: 'bl.st.ok' }
      : s === 'alert'
        ? { tone: 'bad', dot: 'error', label: 'bl.st.bad' }
        : { tone: 'none', dot: '', label: 'bl.st.none' }

  return (
    <section className="card build-list">
      <div className="card-head">
        <div>
          <h3>{t('bl.title')}</h3>
          <p className="card-sub">{t('bl.count', { n: tasks.length, on: onCount })}</p>
        </div>
        <button className="icon-btn" title={t('bl.new')} onClick={onNew}>
          <Icon name="plus" size={16} />
        </button>
      </div>

      <div className="check-list scroll" ref={listRef}>
        {slider && (
          <span
            className="list-slider"
            style={{ height: slider.height, transform: `translateY(${slider.top}px)` }}
          />
        )}
        {tasks.map((task) => {
          const state = taskState(task.status)
          return (
            <div key={task.id} className="check-row" data-picked={draftId === task.id}>
              <button
                className="check-box"
                data-on={task.enabled}
                title={t(task.enabled ? 'bl.disable' : 'bl.enable')}
                onClick={() => onToggle(task)}
              >
                {task.enabled && <Icon name="check" size={11} />}
              </button>
              <button
                className="check-main"
                onClick={() => onPick(task)}
                title={task.cmd || t('bl.notwired')}
              >
                <b>{task.name}</b>
                <em>
                  {task.cmd
                    ? task.lastRun
                      ? t('bl.last', {
                          schedule: scheduleText(task.schedule, t),
                          last: task.lastRun
                        })
                      : scheduleText(task.schedule, t)
                    : t('bl.notwired')}
                </em>
              </button>
              {/* 状态：**点和字一起给**。
                  原来只有一个 7px 的点 —— 6 个任务里 4 个是没状态的灰点，
                  剩下两个也得靠颜色分辨「正常还是失败」，而且完全读不出来是什么。
                  颜色是给扫视的，文字是给确认的，两个都要。
                  「正在跑」和状态合成一个行尾块，不然它俩会各自占一列。 */}
              <span className="check-side">
                {runningTaskId === task.id && <span className="dot online" />}
                <span className={`check-st ${state.tone}`}>
                  <i className={`dot ${state.dot}`} />
                  {t(state.label)}
                </span>
              </span>
            </div>
          )
        })}
        {!tasks.length && <p className="placeholder">{t('bl.empty')}</p>}

        {orphans.length > 0 && (
          <>
            <p className="check-sep">{t('bl.orphans', { n: orphans.length })}</p>
            {orphans.map((s) => (
              <div key={s.name} className="check-row" data-orphan="true">
                <span className="check-box" data-ghost="true">
                  <Icon name="file" size={10} />
                </span>
                <span className="check-main as-text">
                  <b>{s.name}</b>
                  <em>{t('bl.written')}</em>
                </span>
                <button className="mini-run" onClick={() => onMakeTask(s)}>
                  {t('bl.maketask')}
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  )
}
