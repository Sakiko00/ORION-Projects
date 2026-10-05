import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { LiquidToggle } from './LiquidToggle'
import { FONT_SIZES, LANGUAGES, THEME_MODES } from './settings-types'
import type { FontSize, Lang, ThemeMode } from '../ui-prefs'

/**
 * ③ 通用 —— 主题 / 字号 / 语言 / 开机自启，外加数据目录。
 *
 * 这几项的共同点：**跟「这台机器上怎么用」有关，跟某一条任务无关**。
 * 所以横跨一整行摆开，一眼看完，不用翻。
 *
 * 数据放在这里是因为它本来就在这张卡上（原来叫「数据」），
 * 而它确实属于「通用」：换机器要搬的是它，平时不用管。
 */
export function SettingsGeneral({
  theme,
  onTheme,
  font,
  onFont,
  lang,
  onLang
}: {
  theme: ThemeMode
  onTheme: (v: ThemeMode) => void
  font: FontSize
  onFont: (v: FontSize) => void
  lang: Lang
  onLang: (v: Lang) => void
}) {
  const t = useT()
  const [count, setCount] = useState<number | null>(null)
  const [autoStart, setAutoStart] = useState<boolean | null>(null)
  const [paths, setPaths] = useState<Record<string, string> | null>(null)

  useEffect(() => {
    void window.workbench?.artifacts
      ?.list()
      .then((l) => setCount(l.length))
      .catch(() => setCount(null))
    void window.workbench?.app
      ?.getAutoStart()
      .then(setAutoStart)
      .catch(() => setAutoStart(null))
    void window.workbench?.app
      ?.paths()
      .then((p) => setPaths(p as unknown as Record<string, string>))
      .catch(() => setPaths(null))
  }, [])

  const toggleAuto = async (): Promise<void> => {
    const next = !autoStart
    setAutoStart(next)
    /* 以主进程读回来的为准 —— 写失败时别在界面上骗自己 */
    const real = await window.workbench.app.setAutoStart(next).catch(() => next)
    setAutoStart(real)
  }

  return (
    <section className="card set-gen">
      <div className="card-head">
        <h3>{t('gen.title')}</h3>
      </div>

      <div className="set-blocks">
        {/* ① 界面 —— 主题 / 字号 / 语言 / 自启 */}
        <div className="set-block">
          <div className="set-block-title">{t('gen.ui')}</div>
          <div className="set-fields">
            <div className="set-field">
              <span>{t('gen.theme')}</span>
              <div className="set-seg">
                {THEME_MODES.map((m) => (
                  <button
                    key={m.id}
                    className={`set-seg-btn${theme === m.id ? ' on' : ''}`}
                    onClick={() => onTheme(m.id)}
                  >
                    {t(m.label)}
                  </button>
                ))}
              </div>
            </div>

            <div className="set-field">
              <span>{t('gen.font')}</span>
              <div className="set-seg">
                {FONT_SIZES.map((f) => (
                  <button
                    key={f.id}
                    className={`set-seg-btn${font === f.id ? ' on' : ''}`}
                    onClick={() => onFont(f.id)}
                  >
                    {t(f.label)}
                  </button>
                ))}
              </div>
            </div>

            <div className="set-field">
              <span>{t('gen.lang')}</span>
              <div className="set-seg">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.id}
                    className={`set-seg-btn${lang === l.id ? ' on' : ''}`}
                    onClick={() => onLang(l.id)}
                  >
                    {t(l.label)}
                  </button>
                ))}
              </div>
            </div>

            <div className="set-field">
              <span>{t('gen.autostart')}</span>
              <LiquidToggle
                on={!!autoStart}
                disabled={autoStart === null}
                onChange={() => void toggleAuto()}
                label={t('gen.autostart')}
              />
            </div>
          </div>

          {lang === 'en' && <p className="set-note">{t('gen.langnote')}</p>}
        </div>

        {/* ② 文件位置 —— 磁盘上每一处落脚点都列出来，**不折叠**：
               用户问「我的东西在哪」时，不该还得先展开一层才看得到 */}
        <div className="set-block">
          <div className="set-block-title">
            {t('gen.paths')}
            <span className="set-hint">
              {count === null ? '' : t('gen.datacount', { n: count })}
            </span>
          </div>
          <div className="set-paths">
            {[
              { k: 'gen.p.data', v: paths?.vault, open: 'vault' as const },
              { k: 'gen.p.runtime', v: paths?.runtime },
              { k: 'gen.p.cache', v: paths?.userData },
              { k: 'gen.p.engine', v: paths?.engine, open: 'nanobot' as const },
              { k: 'gen.p.derived', v: paths?.derived }
            ].map((row) => (
              <div className="set-path-row" key={row.k}>
                <span>{t(row.k)}</span>
                <code title={row.v || ''}>{row.v || '—'}</code>
                {row.open ? (
                  <button
                    className="set-mini"
                    onClick={() =>
                      void window.workbench.app.openFolder(row.open!).catch(() => undefined)
                    }
                  >
                    {t('gen.open')}
                  </button>
                ) : (
                  <i className="set-mini-ghost" />
                )}
              </div>
            ))}
          </div>
          <p className="set-note">{t('gen.pathnote')}</p>
        </div>
      </div>
    </section>
  )
}
