import { useEffect, useRef } from 'react'
import { EditorState, Transaction } from '@codemirror/state'
import { EditorView, drawSelection, highlightActiveLine, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { tags as tg } from '@lezer/highlight'

/**
 * markdown **编辑器内核**（CodeMirror 6）。
 *
 * 为什么不再用 `<textarea>`：textarea 什么都不知道 —— 不知道什么是标题、什么是代码块，
 * 所以既没法把 `#` 画成标题、也没法回车自动接着上一行的 `- `、更没法撤销（Ctrl+Z 是浏览器的）。
 * 写字的地方一旦要长期用，这些就是**每天都要碰**的东西。
 *
 * ⚠️ 主题**全部走 CSS 变量**（`--foreground` / `--primary` / `--font-mono`…），
 * 所以浅色深色切换这里不用判断 —— 变量变了它自己就跟着变。
 *
 * ⚠️ 换行符在**边界上**转换（`toDoc` / `fromDoc`）：内核里一律 `\n`，
 * 外面进来的、出去的都还原成文件本来的样子。为什么不在内核里配：
 * `EditorState.lineSeparator` 那个 facet **管不到 `doc.toString()`**（实测：
 * 配了 `\r\n`，序列化出来还是 `\n`），只在切分插入文本时用得上。
 * 不这么绕一下，一篇 CRLF 的笔记一打开就会显示「有改动没保存」，存一次还把你的换行符换掉。
 */

/** 工具栏的一个动作：给选区**套一层**，或给选中的每一行加 / 去前缀 */
export interface MdTool {
  pre?: string
  post?: string
  prefix?: string
}

/** 文件用哪种换行 —— 照它还原回去，不改用户的文件 */
const sepOf = (s: string): string => (s.includes('\r\n') ? '\r\n' : '\n')
const toDoc = (s: string): string => s.replace(/\r\n?/g, '\n')

const mdHighlight = HighlightStyle.define([
  { tag: tg.heading1, fontWeight: '700', fontSize: '1.2em' },
  { tag: tg.heading2, fontWeight: '700', fontSize: '1.1em' },
  { tag: [tg.heading3, tg.heading4, tg.heading5, tg.heading6], fontWeight: '650' },
  { tag: tg.strong, fontWeight: '700' },
  { tag: tg.emphasis, fontStyle: 'italic' },
  { tag: tg.strikethrough, textDecoration: 'line-through', color: 'var(--muted-foreground)' },
  { tag: tg.link, color: 'var(--primary)' },
  { tag: tg.url, color: 'var(--primary)', textDecoration: 'underline' },
  { tag: tg.monospace, color: 'var(--primary)' },
  { tag: tg.quote, color: 'var(--muted-foreground)' },
  { tag: tg.contentSeparator, color: 'var(--muted-foreground)' },
  /* markdown 的记号本身（`#` `**` `-` `>` ` ``` `）—— 灰一点，别跟正文抢眼 */
  { tag: tg.processingInstruction, color: 'var(--muted-foreground)' },
  { tag: tg.meta, color: 'var(--muted-foreground)' }
])

const theme = EditorView.theme({
  '&': { color: 'var(--foreground)', backgroundColor: 'transparent', fontSize: '0.8rem' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.75', overflow: 'auto' },
  '.cm-content': { padding: '12px 14px', caretColor: 'var(--primary)' },
  '.cm-line': { padding: '0' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--foreground) 3%, transparent)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--primary)', borderLeftWidth: '2px' },
  '.cm-selectionBackground': { backgroundColor: 'color-mix(in oklab, var(--primary) 22%, transparent)' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in oklab, var(--primary) 30%, transparent)' },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in oklab, var(--primary) 16%, transparent)' },
  '.cm-placeholder': { color: 'var(--muted-foreground)' },
  /* Ctrl+F 那个查找面板：得跟应用是一套衣服，不然像别的软件弹出来的 */
  '.cm-panels': { backgroundColor: 'var(--card)', color: 'var(--foreground)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--hairline)' },
  '.cm-panel input, .cm-panel button': {
    background: 'var(--secondary)',
    color: 'var(--foreground)',
    border: '1px solid var(--hairline)',
    borderRadius: '6px',
    padding: '2px 6px',
    fontFamily: 'inherit',
    fontSize: '0.72rem'
  },
  '.cm-panel label': { fontSize: '0.72rem', color: 'var(--muted-foreground)' }
})

interface Props {
  value: string
  onChange: (v: string) => void
  onSave: () => void
  placeholder?: string
  /** 内核建好之后把 view 交出去 —— 外面的工具栏要用它改选区 */
  onReady?: (view: EditorView) => void
}

export function MdEditor({ value, onChange, onSave, placeholder, onReady }: Props): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  /** 这篇笔记在磁盘上用的换行符 —— 出去的时候照它还原 */
  const sep = useRef(sepOf(value))
  /* 回调每次渲染都是新的，但内核只建一次 —— 用 ref 兜住最新那份 */
  const cb = useRef({ onChange, onSave, onReady })
  cb.current = { onChange, onSave, onReady }

  useEffect(() => {
    if (!host.current) return undefined
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: toDoc(value),
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          EditorView.lineWrapping,
          markdown(),
          syntaxHighlighting(mdHighlight),
          theme,
          cmPlaceholder(placeholder || ''),
          keymap.of([
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                cb.current.onSave()
                return true
              }
            },
            ...searchKeymap,
            ...historyKeymap,
            ...defaultKeymap,
            indentWithTab
          ]),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return
            const text = u.state.doc.toString()
            /* 出去就把换行符还原成文件本来的 —— 外面的 `text` 始终等于磁盘上的样子 */
            cb.current.onChange(sep.current === '\r\n' ? text.replace(/\n/g, '\r\n') : text)
          })
        ]
      })
    })
    view.current = v
    cb.current.onReady?.(v)
    return () => {
      view.current = null
      v.destroy()
    }
    // 内核只建一次：重建会丢光标、撤销栈和滚动位置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* 外面换了文本（切笔记 / 从预览切回来）→ 把文档同步过去。
     ⚠️ 只有「和内核不一致」时才写，否则会把用户正在打的字覆盖掉。 */
  useEffect(() => {
    const v = view.current
    const doc = toDoc(value)
    sep.current = sepOf(value)
    if (!v || v.state.doc.toString() === doc) return
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: doc },
      // 换文本不进撤销栈 —— 否则 Ctrl+Z 会把你带回「上一篇笔记」
      annotations: Transaction.addToHistory.of(false)
    })
  }, [value])

  return <div className="kb-cm" ref={host} />
}

/**
 * 工具栏按下去要干的事：把记号插进选区。
 *
 * 行号、行首、行尾一律**问内核要**（`doc.lineAt`）——
 * 手算换行符偏移是最容易写出「多吃一行」的地方，上一版就踩过一次。
 */
export function applyTool(view: EditorView, tool: MdTool): void {
  const { state } = view
  const sel = state.selection.main
  const doc = state.doc

  if (tool.prefix) {
    const p = tool.prefix
    /* 选区末尾落在行首时**不算那一行**（拖过换行符而已，不该给它加前缀） */
    const lastPos = sel.to > sel.from ? sel.to - 1 : sel.to
    const first = doc.lineAt(sel.from).number
    const last = doc.lineAt(lastPos).number

    const lines: string[] = []
    let all = true
    for (let n = first; n <= last; n++) {
      const text = doc.line(n).text
      lines.push(text)
      if (!text.startsWith(p)) all = false
    }
    /* 已经全带这个前缀 → 再按一次就是**摘掉**（同键切换） */
    const next = lines.map((l) => (all ? l.slice(p.length) : p + l)).join('\n')
    const from = doc.line(first).from
    const to = doc.line(last).to
    view.dispatch({
      changes: { from, to, insert: next },
      selection: { anchor: from + next.length },
      scrollIntoView: true
    })
    view.focus()
    return
  }

  const pre = tool.pre ?? ''
  const post = tool.post ?? ''
  const picked = state.sliceDoc(sel.from, sel.to)
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: pre + picked + post },
    /* 什么都没选 → 光标停在两个记号**中间**，接着打字就是效果本身 */
    selection: { anchor: sel.from + pre.length + picked.length + (picked ? post.length : 0) },
    scrollIntoView: true
  })
  view.focus()
}
