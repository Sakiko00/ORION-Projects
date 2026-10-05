import { useEffect, useState } from 'react'

/**
 * 提示条（借 bencho「Notify」）
 *
 * 传达的信息：**刚才那一下到底成没成**。
 * 不弹窗、不打断、不问「确定吗」，自己会走 —— 破坏性操作才需要拦。
 *
 * 通信方式用一个 window 事件，不引状态库：
 * 任何地方（含 agent 工具层回来的回调）都能 toast(...)，不用层层传 props。
 */
export interface ToastItem {
  id: number
  text: string
  tone: 'ok' | 'bad' | 'info'
}

const EVENT = 'workbench:toast'
let seq = 0

export function toast(text: string, tone: ToastItem['tone'] = 'info'): void {
  window.dispatchEvent(new CustomEvent<ToastItem>(EVENT, { detail: { id: ++seq, text, tone } }))
}

export function Toasts() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const onToast = (e: Event): void => {
      const item = (e as CustomEvent<ToastItem>).detail
      setItems((prev) => [...prev.slice(-3), item])
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== item.id)), 3600)
    }
    window.addEventListener(EVENT, onToast)
    return () => window.removeEventListener(EVENT, onToast)
  }, [])

  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast" data-tone={t.tone}>
          <span className="toast-dot" />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  )
}
