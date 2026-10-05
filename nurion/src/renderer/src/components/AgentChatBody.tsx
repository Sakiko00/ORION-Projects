import { useEffect, useRef } from 'react'
import { Icon } from './Icon'
import { Pipeline } from './Pipeline'
import { useT } from '../i18n'
import { mdClick, renderMarkdown } from '../md'
import type { ChatMessage } from '../run-types'

/**
 * 对话的**视觉部分**（消息流 + 输入框）。
 *
 * 状态不在这个文件里 —— 全在 `agent-chat.tsx` 的 provider。
 * 这里只负责画：悬浮窗和 AI 共建页都渲染它，看到的是同一段对话。
 *
 * 尺寸不写死：靠父容器给高度（`flex:1` + `min-height:0`），
 * 所以塞进浮窗（小）和整页（大）都能用。
 */

const EXAMPLES = ['chat.ex1', 'chat.ex2', 'chat.ex3']

function Bubble({ m, compact }: { m: ChatMessage; compact: boolean }): JSX.Element {
  const t = useT()
  return (
    <div className={`msg ${m.role}`}>
      {/* 头像只给 AI。「你」的话靠右对齐就够了 —— 再挂个「你」的标签是废话 */}
      {m.role === 'ai' && (
        <span className="msg-who" title={t('chat.assistant')} aria-hidden="true">
          <Icon name="bolt" size={12} />
        </span>
      )}
      <div className="msg-body">
        {/* 过程：按阶段摊开它干了什么。比一串工具 chip 强在「你能看出走到哪了」 */}
        {m.tools?.length ? (
          <Pipeline
            tools={m.tools}
            streaming={m.streaming}
            failed={!!m.error}
            ms={m.ms}
            since={m.at}
            collapsible={compact}
          />
        ) : null}

        {/* 它说的话走 markdown（模型回的就是 markdown）。
            ⚠️ **你说的不走** —— 敲什么看到什么，你要是打一串 `**` 就该看到那串 `**`。 */}
        {m.text ? (
          m.role === 'ai' ? (
            <div
              className="msg-text md"
              onClick={(e) => mdClick(e, t)}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text, t('md.copy')) }}
            />
          ) : (
            <div className="msg-text">{m.text}</div>
          )
        ) : null}
        {m.streaming && !m.text && !m.tools?.length && <div className="msg-text dim">…</div>}

        {m.error && (
          <div className={`msg-error${m.providerDown ? ' provider' : ''}`}>
            {m.providerDown ? (
              <>
                <b>{t('chat.err.title')}</b>
                <div className="msg-error-detail">{m.error}</div>
                <div className="msg-error-hint">
                  {t('chat.err.prefix')}
                  <b>{t('chat.err.bold')}</b>
                  {t('chat.err.suffix')}
                </div>
              </>
            ) : (
              <>
                {m.error}
                {m.engineDown && t('chat.err.down')}
              </>
            )}
          </div>
        )}

        {m.ms !== undefined && !m.tools?.length && (
          <div className="msg-meta">{(m.ms / 1000).toFixed(1)}s</div>
        )}
      </div>
    </div>
  )
}

export function AgentChatBody({
  msgs,
  engineOk,
  input,
  setInput,
  busy,
  showExamples = true,
  /** 悬浮窗那种小地方：过程干完就折起来，输入框也压小一号 */
  compact = false,
  onAsk,
  onStop,
  onStartEngine,
  starting
}: {
  msgs: ChatMessage[]
  engineOk: boolean | null
  input: string
  setInput: (v: string) => void
  busy: boolean
  /** 浮窗地方小，示例就不铺了 */
  showExamples?: boolean
  /** 悬浮窗：过程干完自动收起（见 Pipeline 的 collapsible） */
  compact?: boolean
  onAsk: (t: string) => void
  onStop: () => void
  onStartEngine: () => void
  starting: boolean
}): JSX.Element {
  const t = useT()
  const listRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // 新消息进来就滚到底
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs])

  /* 输入框随内容长高（ChatGPT 那套）：一行起，最多长到 92px，再高就自己滚。
   * 为什么不用 `rows={2}` 写死：写死两行的话，只说一句话也占着两行 ——
   * 浮窗里每一个像素都是拿正文换的。 */
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 92)}px`
  }, [input])

  return (
    <>
      {engineOk === false && (
        <p className="hint chat-engine-warn">
          {t('chat.noengine')}
          <button className="mini-run" disabled={starting} onClick={onStartEngine}>
            <Icon name="bolt" size={12} /> {t(starting ? 'chat.starting' : 'chat.start')}
          </button>
        </p>
      )}

      <div className="chat scroll" ref={listRef}>
        {!msgs.length && engineOk !== false && (
          <div className="chat-empty">
            {/* 开场白 —— 助手的第一句话，浮窗正中间居中 */}
            <p className="chat-hello">{t('chat.hello')}</p>
            <p className="placeholder">
              {t(showExamples ? 'chat.ask.with' : 'chat.ask')}
            </p>
            {showExamples &&
              EXAMPLES.map((k) => (
                <button key={k} className="pick" onClick={() => onAsk(t(k))}>
                  <Icon name="bolt" size={14} />
                  <span className="pick-main">
                    <span className="pick-meta" style={{ whiteSpace: 'normal' }}>
                      {t(k)}
                    </span>
                  </span>
                </button>
              ))}
          </div>
        )}

        {msgs.map((m) => (
          <Bubble key={m.id} m={m} compact={compact} />
        ))}
      </div>

      {/* 输入框做成一个「胶囊」：按钮在框里面。
          好处不是好看 —— 是省掉一整行高度，而且一眼看出「这里可以打字」 */}
      <div className="chat-input">
        <textarea
          ref={taRef}
          value={input}
          rows={1}
          placeholder={t('chat.placeholder')}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              onAsk(input)
            }
          }}
        />
        <div className="chat-send-row">
          <span className="chat-tip">{t('chat.tip')}</span>
          {busy ? (
            <button
              className="send-btn"
              onClick={onStop}
              title={t('chat.interrupt')}
              aria-label={t('chat.stop.label')}
            >
              <Icon name="stop" size={13} />
            </button>
          ) : (
            <button
              className="send-btn"
              disabled={!input.trim()}
              onClick={() => onAsk(input)}
              title={t('chat.send.title')}
              aria-label={t('chat.send.label')}
            >
              <Icon name="arrowUp" size={17} />
            </button>
          )}
        </div>
      </div>
    </>
  )
}
