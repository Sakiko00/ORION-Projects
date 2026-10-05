import { Icon } from './Icon'
import { LiquidToggle } from './LiquidToggle'
import { useT } from '../i18n'
import type { ScriptLite } from '../agent-chat'
import { SCHEDULE_PRESETS, scheduleText, type Draft } from './studio-types'

/**
 * ③ 配置卡 —— 它是什么（节点头）+ 怎么接的（字段 + 动作）。
 * 跑起来什么样归 RunPanel（独立一张卡），不在这里。
 */
interface Props {
  draft: Draft
  onChange: (patch: Partial<Draft>) => void
  dirty: boolean
  attached: ScriptLite[]
  showScripts: boolean
  onToggleScripts: () => void
  busy: boolean
  running: boolean
  runningThis: boolean
  onSave: () => void
  onTryRun: () => void
  onStop: () => void
  onDuplicate: () => void
  onRemove: () => void
}

export function TaskDetail({
  draft,
  onChange,
  dirty,
  attached,
  showScripts,
  onToggleScripts,
  busy,
  running,
  runningThis,
  onSave,
  onTryRun,
  onStop,
  onDuplicate,
  onRemove
}: Props) {
  const t = useT()
  return (
    <section className="card build-detail">
      {/* 节点头：它是什么。名字 + 它实际跑的那条命令，一眼对得上 */}
      <div className="node">
        <span className="node-icon" data-on={draft.enabled}>
          <Icon name={draft.id ? 'activity' : 'plus'} size={15} />
        </span>
        <span className="node-id">
          <input
            className="node-title"
            value={draft.name}
            placeholder={t(draft.id ? 'bd.unnamed' : 'bd.newtask')}
            spellCheck={false}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </span>
        {draft.id && attached.length > 0 && (
          <button className="node-chip" title={t('bd.scripts')} onClick={onToggleScripts}>
            <Icon name="file" size={11} /> {t('bd.scriptcount', { n: attached.length })}
          </button>
        )}
        <span className="node-acts">
          {dirty && <span className="chip warn">{t('bd.unsaved')}</span>}
          <LiquidToggle
            on={draft.enabled}
            onChange={(v) => onChange({ enabled: v })}
            label={t('bd.enable')}
          />
        </span>
      </div>

      {showScripts && attached.length > 0 && (
        <div className="node-scripts">
          {attached.map((s) => (
            <div key={s.name} className="node-script">
              <Icon name="file" size={11} />
              <code>scripts/{s.name}</code>
              <span className="node-script-meta">
                {(s.size / 1024).toFixed(1)} KB · {s.updatedAt}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 中间这块自己滚 —— 「一屏不滚」是页面不滚，不是卡片不能滚 */}
      <div className="studio-scroll scroll">
        <div className="studio-fields">
          <label className="field field-cmd">
            <span>{t('bd.cmd')}</span>
            <input
              value={draft.cmd}
              placeholder="python scripts/douban_top250.py"
              spellCheck={false}
              onChange={(e) => onChange({ cmd: e.target.value })}
            />
          </label>

          <label className="field">
            <span>{t('bd.cwd')}</span>
            <input
              value={draft.cwd}
              placeholder={t('bd.cwd.placeholder')}
              spellCheck={false}
              onChange={(e) => onChange({ cwd: e.target.value })}
            />
          </label>

          <div className="field">
            <span>{t('bd.schedule')}</span>
            <span className="field-row">
              {SCHEDULE_PRESETS.map((s) => (
                <button
                  key={s}
                  className={`chip clickable${draft.schedule === s ? ' on' : ''}`}
                  onClick={() => onChange({ schedule: s })}
                >
                  {/* 按钮上的人话一律走词条 —— 存的是数据（`'手动触发'`），
                      显示要跟着语言走 */}
                  {scheduleText(s, t)}
                </button>
              ))}
              {/* 自定义时间：只认「每天 HH:MM」。输入后 chips 都不亮，点预设即切回 */}
              <input
                className="chip-input"
                value={!SCHEDULE_PRESETS.includes(draft.schedule) ? draft.schedule : ''}
                placeholder={t('bd.custom')}
                spellCheck={false}
                onChange={(e) => onChange({ schedule: e.target.value })}
              />
            </span>
          </div>
        </div>

        <p className="hint">{t('bd.datehint', { date: '{date}' })}</p>
      </div>

      <div className="studio-actions">
        <button className="action-btn primary" disabled={busy} onClick={onSave}>
          <Icon name="save" size={15} /> {t('bd.save')}
        </button>
        <button
          className="action-btn"
          disabled={busy || running || !draft.cmd.trim()}
          title={draft.cmd.trim() ? t('bd.run.hint') : t('bd.run.nocmd')}
          onClick={onTryRun}
        >
          <Icon name="play" size={15} /> {t('bd.run')}
        </button>
        {runningThis && (
          <button className="action-btn" onClick={onStop}>
            <Icon name="stop" size={15} /> {t('bd.stop')}
          </button>
        )}
        <span style={{ flex: 1 }} />
        {draft.id && (
          <button className="action-btn secondary" disabled={busy} onClick={onDuplicate}>
            <Icon name="layers" size={15} /> {t('bd.duplicate')}
          </button>
        )}
        <button className="action-btn secondary" disabled={busy} onClick={onRemove}>
          <Icon name="trash" size={15} /> {t(draft.id ? 'bd.delete' : 'bd.clear')}
        </button>
      </div>
    </section>
  )
}
