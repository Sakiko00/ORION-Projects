/**
 * 「组件即契约」：界面上的组件对智能体开放，它能像你一样点。
 *
 * 两条路一起用：
 *   1. 显式声明 —— 重要组件写 data-agent="settings.engine.restart"，名字稳定跨版本
 *   2. 自动收编 —— 没标的按钮/输入框/下拉，按「类型:文字」自动编号
 *
 * 原则：动作是真的调用它的点击/输入，走和用户手指一模一样的代码路径 ——
 * 界面能拦、能校验、能报错，不会出现「数据被改了但界面没反应」。
 */

const SEL = 'button, a[href], input, select, textarea, [data-agent]'

const short = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 28)

function labelOf(el: HTMLElement & { value?: string; placeholder?: string }): string {
  return (
    el.getAttribute('data-agent-label') ||
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    el.getAttribute('placeholder') ||
    el.textContent ||
    el.value ||
    ''
  )
}

function isVisible(el: HTMLElement & { type?: string }): boolean {
  if (el.type === 'hidden') return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

function kindOf(el: HTMLElement & { type?: string }): string {
  const tag = el.tagName.toLowerCase()
  if (tag === 'a') return '链接'
  if (tag === 'select') return '下拉'
  if (tag === 'textarea') return '多行输入'
  if (tag === 'input') {
    if (el.type === 'checkbox') return '开关'
    if (el.type === 'password') return '密码框'
    return '输入框'
  }
  return '按钮'
}

function gather(): { name: string; el: HTMLElement & { type?: string; checked?: boolean; value?: string; disabled?: boolean } }[] {
  const seen = new Map<string, number>()
  return [...document.querySelectorAll<HTMLElement>(SEL)]
    .filter(isVisible)
    .map((el) => {
      let name = el.getAttribute('data-agent')
      if (!name) {
        name = `${el.tagName.toLowerCase()}:${short(labelOf(el))}`
        const n = (seen.get(name) || 0) + 1
        seen.set(name, n)
        if (n > 1) name = `${name}#${n}`
      }
      return { name, el: el as HTMLElement & { type?: string; checked?: boolean; value?: string; disabled?: boolean } }
    })
}

function describe(el: HTMLElement & { type?: string; checked?: boolean; value?: string; disabled?: boolean }): Record<string, unknown> {
  const out: Record<string, unknown> = { kind: kindOf(el), label: short(labelOf(el)) }
  const note = el.getAttribute('data-agent-note')
  if (note) out.note = note
  if (el.type === 'checkbox') out.checked = (el as HTMLInputElement).checked
  else if ('value' in el && el.type !== 'password') out.value = short((el as HTMLInputElement).value)
  if (el.disabled) out.disabled = true
  return out
}

export function snapshot(): unknown {
  return {
    page: location.hash || '#/',
    targets: gather().map(({ name, el }) => ({ name, ...describe(el) }))
  }
}

export function screenText(limit = 4000): unknown {
  return {
    page: location.hash || '#/',
    main: (document.querySelector('.content')?.textContent || '').slice(0, limit),
    topbar: (document.querySelector('.topbar')?.textContent || '').slice(0, 400)
  }
}

/** React 把 value 绑在内部状态上，直接 el.value = x 它收不到。必须走原生 setter 再派发事件 */
function setNative(el: HTMLElement, value: string): void {
  const proto =
    el.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT'
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')
  desc?.set?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function pressKey(el: HTMLElement, key: string): void {
  el.focus?.()
  const opts = { key, code: key, bubbles: true, cancelable: true }
  el.dispatchEvent(new KeyboardEvent('keydown', opts))
  if (key === 'Enter') el.dispatchEvent(new KeyboardEvent('keypress', opts))
  el.dispatchEvent(new KeyboardEvent('keyup', opts))
}

const tick = (ms = 160): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function act(args: { name?: string; action?: string; value?: string } = {}): Promise<unknown> {
  const { name, action = 'click', value } = args
  const hit = gather().find((t) => t.name === name)
  if (!hit) {
    const near = (snapshot() as { targets: { name: string }[] }).targets.slice(0, 12).map((t) => t.name)
    return { ok: false, error: `这一屏没有叫「${name}」的组件。现在有的是：${near.join('、')}` }
  }
  const el = hit.el
  if (el.disabled) return { ok: false, error: `「${name}」现在是禁用的` }

  if (action === 'click') el.click()
  else if (action === 'check') {
    if (!(el as HTMLInputElement).checked) el.click()
  } else if (action === 'uncheck') {
    if ((el as HTMLInputElement).checked) el.click()
  } else if (action === 'set') {
    if (value === undefined || value === null) return { ok: false, error: 'set 要带 value' }
    if (el.type === 'checkbox') return { ok: false, error: '开关类用 check / uncheck，不用 set' }
    setNative(el, String(value))
  } else if (action === 'key') {
    pressKey(el, String(value || 'Enter'))
  } else {
    return { ok: false, error: `不认识的动作「${action}」（能用：click / set / check / uncheck / key）` }
  }

  await tick()
  return { ok: true, acted: name, after: snapshot() }
}

/** 主进程通过 IPC 递进来的调用，统一从这儿进 */
export async function run({ tool, args }: { tool?: string; args?: Record<string, unknown> } = {}): Promise<unknown> {
  if (tool === 'ui_snapshot') return snapshot()
  if (tool === 'ui_act') return act(args as { name?: string; action?: string; value?: string })
  if (tool === 'screen_text') return screenText((args?.limit as number) ?? undefined)
  return { ok: false, error: `界面不认识「${tool}」` }
}
