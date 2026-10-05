import { useEffect, useState } from 'react'
import { useT } from '../i18n'

// mac 风格红黄绿窗口控制按钮（无边框窗口）
export function WindowControls() {
  const t = useT()
  const controls = window.workbench?.windowControls
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!controls) return
    controls.isMaximized().then(setMaximized)
    controls.onMaximizeChange(setMaximized)
  }, [controls])

  return (
    <div className="win-controls">
      <button
        className="traffic close"
        onClick={() => controls?.close()}
        title={t('win.close')}
        aria-label={t('win.close')}
      />
      <button
        className="traffic min"
        onClick={() => controls?.minimize()}
        title={t('win.min')}
        aria-label={t('win.min')}
      />
      <button
        className="traffic max"
        onClick={() => controls?.toggleMaximize()}
        title={maximized ? t('win.restore') : t('win.max')}
        aria-label={maximized ? t('win.restore') : t('win.max')}
      />
    </div>
  )
}
