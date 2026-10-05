import { useMemo, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { Icon } from './Icon'
import { useT } from '../i18n'
import { catText, noteText } from './kb-types'
import { mdClick, renderMarkdown } from '../md'
import { applyTool, MdEditor } from './MdEditor'
import type { MdTool } from './MdEditor'

/**
 * 知识库右栏 —— 就是**一个 markdown 编辑器**。
 *
 * 写字的地方是 CodeMirror 6（见 `MdEditor`）：语法高亮、回车接着上一行的 `- `、
 * Ctrl+Z 撤销、Ctrl+F 查找，都是内核给的 —— 这些不该自己造。
 * 这个文件只负责**这一页长什么样**：
 *   工具栏（8 个记号按钮 + 预览开关）、标题栏的保存 / 删除。
 * 正经的文字手术（改哪个区间、光标停哪）全在 `applyTool` —— 那边问内核要行号，
 * 不手算偏移。
 *
 * ⚠️ 预览用的是**全应用同一个** `md.ts`（对话 / 产物 / 构建页都是它）。
 */

interface Tool extends MdTool {
  icon: string
  name: string
}

const TOOLS: Tool[] = [
  { icon: 'heading', name: 'kb.t.h', prefix: '# ' },
  { icon: 'bold', name: 'kb.t.bold', pre: '**', post: '**' },
  { icon: 'italic', name: 'kb.t.italic', pre: '*', post: '*' },
  { icon: 'code', name: 'kb.t.inline', pre: '`', post: '`' },
  { icon: 'list', name: 'kb.t.list', prefix: '- ' },
  { icon: 'quote', name: 'kb.t.quote', prefix: '> ' },
  { icon: 'block', name: 'kb.t.block', pre: '```\n', post: '\n```' },
  { icon: 'link', name: 'kb.t.link', pre: '[', post: '](https://)' }
]

interface Props {
  cur: string | null
  curCat: string
  dirty: boolean
  busy: boolean
  text: string
  onText: (v: string) => void
  onSave: () => void
  onRemove: () => void
}

export function KnowledgeBaseEditor({ cur, curCat, dirty, busy, text, onText, onSave, onRemove }: Props) {
  const t = useT()
  /** 编辑器内核的 view —— 工具栏靠它改选区 */
  const view = useRef<EditorView | null>(null)
  const [preview, setPreview] = useState(false)
const html = useMemo(() => renderMarkdown(text, t('md.copy')), [text, t])

  const apply = (tool: Tool): void => {
    if (view.current) applyTool(view.current, tool)
  }

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h3>{cur ? noteText(cur, t) : t('kb.noselect')}</h3>
          <p className="card-sub">
            {curCat ? `${catText(curCat, t)} · ` : ''}
            {t(dirty ? 'kb.dirty' : 'kb.saved')} · {t('kb.hint')}
          </p>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="action-btn primary" disabled={busy || !dirty} onClick={onSave}>
            <Icon name="save" size={14} /> {t('bd.save')}
          </button>
          <button className="action-btn secondary" disabled={busy || !cur} onClick={onRemove}>
            <Icon name="trash" size={14} />
          </button>
        </span>
      </div>

      {!cur ? (
        <p className="placeholder">{t('kb.pick')}</p>
      ) : (
        <div className="kb-edit">
          <div className="kb-tools">
            {/* 预览态不摆插入按钮：那时候改文本你根本看不见结果 —— 只留一个「继续写」 */}
            {!preview &&
              TOOLS.map((tool) => (
                <button
                  key={tool.name}
                  type="button"
                  className="kb-tool"
                  title={t(tool.name)}
                  aria-label={t(tool.name)}
                  /* 别把焦点从写字的地方抢走 —— 抢走了光标就没了 */
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => apply(tool)}
                >
                  <Icon name={tool.icon} size={15} />
                </button>
              ))}
            <span className="kb-tools-gap" />
            <button
              type="button"
              className={`kb-tool kb-tool-wide${preview ? ' on' : ''}`}
              title={t(preview ? 'kb.tool.edit' : 'kb.tool.preview')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPreview((p) => !p)}
            >
              <Icon name={preview ? 'edit' : 'eye'} size={14} />
              {t(preview ? 'kb.tool.edit' : 'kb.tool.preview')}
            </button>
          </div>

          {preview ? (
            <div
              className="kb-view md scroll"
              onClick={(e) => mdClick(e, t)}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <MdEditor
              value={text}
              onChange={onText}
              onSave={onSave}
              placeholder={t('kb.editorplaceholder')}
              onReady={(v) => (view.current = v)}
            />
          )}
        </div>
      )}
    </section>
  )
}
