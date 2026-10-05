import { Icon } from './Icon'
import { useT } from '../i18n'
import type { EngineSettings } from './settings-types'

/**
 * ① 模型 —— 用户**唯一必须配**的东西。
 *
 * 判据是「不填它，就用不起来吗」。这里三格不填满，助手一句话也说不了，
 * 所以它单独占一张卡、摆在左上（第一眼的位置）。其余全部让路 —— 见 `Settings.tsx` 顶部注释。
 */
export function SettingsModel({
  value,
  onChange,
  onSave,
  busy
}: {
  value: EngineSettings
  onChange: (k: 'baseURL' | 'apiKey' | 'model', v: string) => void
  onSave: () => void
  busy: string
}) {
  const t = useT()
  const filled = [value.baseURL, value.apiKey, value.model].filter((s) => s.trim()).length

  return (
    <section className="card set-model">
      <div className="card-head">
        <h3>{t('model.title')}</h3>
        <span className="set-hint">{filled === 3 ? t('model.ready') : `${filled}/3`}</span>
      </div>

      <div className="set-fields">
        <label className="set-field">
          <span>{t('model.baseURL')}</span>
          <input
            value={value.baseURL}
            onChange={(e) => onChange('baseURL', e.target.value)}
            placeholder="https://api.deepseek.com/v1"
          />
        </label>
        <label className="set-field">
          <span>{t('model.apiKey')}</span>
          <input
            type="password"
            value={value.apiKey}
            onChange={(e) => onChange('apiKey', e.target.value)}
            placeholder="sk-…"
          />
        </label>
        <label className="set-field">
          <span>{t('model.name')}</span>
          <input
            value={value.model}
            onChange={(e) => onChange('model', e.target.value)}
            placeholder="deepseek-chat"
          />
        </label>
      </div>

      <div className="set-foot">
        <button className="action-btn primary" disabled={!!busy} onClick={onSave}>
          <Icon name="check" size={14} /> {t(busy ? 'model.saving' : 'model.save')}
        </button>
        <span className="set-hint">{t('model.local')}</span>
      </div>
    </section>
  )
}
