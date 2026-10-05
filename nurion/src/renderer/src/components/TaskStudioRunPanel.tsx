import { ArtifactList } from './Artifact'
import { useT } from '../i18n'
import type { LiveRun } from '../run-types'
import { fmtAt, secs, TRIGGER_LABEL, type StudioTab, type TaskRun } from './studio-types'

/**
 * 运行卡 —— 独立一张卡，和上面的配置卡分开。
 * 输出 / 产物 / 历史 共用一个地方，日志能占满整张卡，不用和字段挤。
 */
interface Props {
  tab: StudioTab
  onTab: (t: StudioTab) => void
  shownArtifacts: string[]
  myRuns: TaskRun[]
  live: LiveRun | null
  taskId: string
  logLines: string[]
  runningThis: boolean
  lastRunSummary: { ok: boolean; at?: string } | null
  notify: (text: string, tone?: 'ok' | 'bad' | 'info') => void
}

export function RunPanel({
  tab,
  onTab,
  shownArtifacts,
  myRuns,
  live,
  taskId,
  logLines,
  runningThis,
  lastRunSummary,
  notify
}: Props) {
  const t = useT()
  return (
    <section className="card build-run">
      {/* 上次跑得怎么样 —— 放在卡顶，一眼看到 */}
      {lastRunSummary && (
        <div className={`task-last ${lastRunSummary.ok ? 'ok' : 'bad'}`}>
          <span className={`dot ${lastRunSummary.ok ? 'online' : 'error'}`} />
          {t('br.lastrun', { state: t(lastRunSummary.ok ? 'ov.ok' : 'ov.bad') })}
          {lastRunSummary.at ? ` · ${lastRunSummary.at}` : ''}
        </div>
      )}

      <div className="run-log">
        <div className="run-log-head">
          <span className="tabs">
            <button className={`tab${tab === 'log' ? ' on' : ''}`} onClick={() => onTab('log')}>
              {t('ov.output')}
            </button>
            <button className={`tab${tab === 'art' ? ' on' : ''}`} onClick={() => onTab('art')}>
              {t('ov.artifacts', { n: shownArtifacts.length || '' })}
            </button>
            <button className={`tab${tab === 'hist' ? ' on' : ''}`} onClick={() => onTab('hist')}>
              {t('br.history', { n: myRuns.length || '' })}
            </button>
          </span>
          <span className="run-log-cmd">
            {runningThis ? t('br.running') : ''}
            {!runningThis && live?.taskId === taskId && live.done
              ? t('br.exit', { code: live.done.code, s: (live.done.ms / 1000).toFixed(1) })
              : ''}
          </span>
        </div>

        {tab === 'log' ? (
          <pre className={`run-log-body scroll${runningThis ? ' is-live' : ''}`}>
            {live && live.taskId === taskId
              ? live.lines.length
                ? live.lines.slice(-80).join('\n')
                : t('ov.waiting')
              : logLines.length
                ? logLines.slice(-40).join('\n')
                : t('br.noruns')}
          </pre>
        ) : tab === 'art' ? (
          <div className="run-art scroll">
            <ArtifactList names={shownArtifacts} notify={notify} />
          </div>
        ) : (
          <div className="run-hist scroll">
            {myRuns.length ? (
              myRuns.slice(0, 20).map((r) => (
                <div key={r.id} className="run-hist-row">
                  <span className={`dot ${r.ok ? 'online' : 'error'}`} />
                  <span className="run-hist-time">{fmtAt(r.at)}</span>
                  <span className={`run-hist-state ${r.ok ? 'ok' : 'bad'}`}>
                    {t(r.ok ? 'ov.ok' : 'ov.bad')}
                  </span>
                  <span className="run-hist-ms">{secs(r.ms)}</span>
                  <span className="run-hist-trigger">{t(TRIGGER_LABEL[r.trigger || 'manual'])}</span>
                </div>
              ))
            ) : (
              <p className="placeholder">{t('br.empty')}</p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
