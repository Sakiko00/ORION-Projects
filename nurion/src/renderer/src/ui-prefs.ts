/**
 * 界面偏好（主题 / 字号 / 语言）。
 *
 * 为什么用 localStorage、不落进 vault：
 *   1. 它们是「这台机器上看着舒服」的事，不是数据 —— 跟着备份跑到别人机器上没意义
 *   2. 更要紧的是**启动时序**：读 vault 要等一次 IPC 往返，那之前页面已经按默认样式画了
 *      一帧 —— 主题不对就会先闪一下。localStorage 是同步的，第一帧就是对的样子。
 */

export type ThemeMode = 'light' | 'dark' | 'system'
export type FontSize = 'sm' | 'md' | 'lg'
export type Lang = 'zh' | 'en'

export interface UiPrefs {
  theme: ThemeMode
  font: FontSize
  lang: Lang
}

const KEY = 'workbench.ui'

const DEFAULTS: UiPrefs = { theme: 'light', font: 'md', lang: 'zh' }

/** 字号：改 html 的 font-size —— 整个界面是按 rem 写的，一处改、处处跟着变 */
const FONT_PX: Record<FontSize, string> = { sm: '14px', md: '16px', lg: '18px' }

export function readPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const p = JSON.parse(raw) as Partial<UiPrefs>
    return {
      /* ⚠️ 回退值也要跟着 DEFAULTS 走 —— 这里曾是硬写的 'dark'，
         改默认主题时只改 DEFAULTS 不改这里，就会出现「默认值说是浅色，
         实际读到存盘记录又变成深色」的不一致。 */
      theme: p.theme === 'dark' || p.theme === 'system' ? p.theme : DEFAULTS.theme,
      font: p.font === 'sm' || p.font === 'lg' ? p.font : 'md',
      lang: p.lang === 'en' ? 'en' : 'zh'
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writePrefs(patch: Partial<UiPrefs>): UiPrefs {
  const next = { ...readPrefs(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* 存不下就算了，不该让界面挂掉 */
  }
  applyPrefs(next)
  return next
}

/** 系统现在是不是深色 */
export function systemDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveDark(theme: ThemeMode): boolean {
  return theme === 'system' ? systemDark() : theme === 'dark'
}

/** 把偏好写到 document 上 —— 只有这一个地方改样式，别让各处自己 toggle */
export function applyPrefs(p: UiPrefs): void {
  document.body.classList.toggle('dark', resolveDark(p.theme))
  document.documentElement.style.fontSize = FONT_PX[p.font]
  document.documentElement.lang = p.lang === 'en' ? 'en' : 'zh-CN'
  /* 顺手把主题告诉主进程：开机动画（闪屏）是 main 里一段自带内容的 HTML，
     它必须**在渲染层跑起来之前**就有颜色，读不到这里的 localStorage
     （见 main 的 themePref / vault/ui.json）。
     浏览器预览里没有真桥，所以整条链都写成可选的。 */
  void window.workbench?.app?.setTheme?.(p.theme)
}
