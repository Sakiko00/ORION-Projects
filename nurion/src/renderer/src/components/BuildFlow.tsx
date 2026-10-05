import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Pipeline } from './Pipeline'
import { useT } from '../i18n'
import { mdClick, renderMarkdown } from '../md'
import type { BuildFlowState } from '../build-state'
import type { BuildStep, ChatMessage } from '../run-types'

/**
 * 构建流程的轮播 —— **构建一件事的时候，它接管整个助手界面**。
 *
 * 为什么是"接管"而不是"在上面加一块"：
 *   建一件新事的时候，用户要做的决定**只有一个 —— 放不放行**。
 *   聊天区摆在那儿，就变成两个并列的东西，人会先想"我该看哪儿"。
 *   而这个界面要**足够无脑**：一次只给他一件事，和**一个大按钮**。
 *
 * 它说的话、它干的事不会因此丢掉 —— 都收在**当前那张卡里**（点「它这一轮」展开）。
 * 也就是说：**一个东西、一个位置**，不用来回切。
 *
 * 「无脑」的三条具体做法：
 *   1. 一次只显一张卡（轮播），其他五张不在视野里
 *   2. 通过 = **整条大按钮**，不是一堆并列的小按钮
 *   3. 打回降级成一行小字（"有问题？"），点了才出输入框 —— 它是例外，不是常态
 */

const TOTAL = 6

/**
 * `ask` 是助手停下来的那句话（约定：最多三行、一行一件事）。
 *
 * 他要是写了【贴纸】小标题，就拆成「标签 + 一句」两列 —— 比一整段好扫。
 * 没写就原样渲染（别拿能忍的排版当成规定）。
 */
function Ask({ text }: { text: string }): JSX.Element {
  const t = useT()
  const parts = text
    .split(/(?=【)/)
    .map((x) => x.trim())
    .filter(Boolean)
  /* 没按约定写【小标题】的时候**不能当纯文本塞进一个 <p>**：
     它可能带着 Markdown（列表、加粗、表格、代码块），塞进去就成了一坨，
     而且换行会被 HTML 吃掉 —— 看上去就是「输出很乱、看不全」。
     所以退回默认形态也是 Markdown，而且自己能滚。 */
  if (parts.length < 2) {
    return (
      <div
        className="car-ask md"
        onClick={(e) => mdClick(e, t)}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(text, t('md.copy')) }}
      />
    )
  }
  return (
    <div className="car-ask">
      {parts.map((p) => {
        const m = /^【(.+?)】\s*([\s\S]*)$/.exec(p)
        return m ? (
          <div className="ask-row" key={p}>
            <span className="ask-k">{m[1]}</span>
            <span className="ask-v">{m[2]}</span>
          </div>
        ) : (
          <p className="ask-plain" key={p}>
            {p}
          </p>
        )
      })}
    </div>
  )
}

function dotState(s: BuildStep, now: boolean): string {
  if (s.state === 'passed') return 'passed'
  if (now) return s.state === 'wait' ? 'wait' : s.state === 'rejected' ? 'rejected' : 'now'
  return 'todo'
}

function Card({
  s,
  now,
  done,
  ask,
  activity,
  why,
  setWhy,
  asking,
  setAsking,
  busy,
  blocked,
  stalled,
  onPass,
  onReject,
  onNudge
}: {
  s: BuildStep
  now: boolean
  done: boolean
  ask?: string
  activity?: ChatMessage
  why: string
  setWhy: (v: string) => void
  asking: boolean
  setAsking: (v: boolean) => void
  busy: boolean
  blocked: string
  /** 它这一轮已经说完了 —— 却没停在门槛上。无脑的界面最不能有的就是没出口的状态 */
  stalled: boolean
  onPass: () => void
  onReject: () => void
  onNudge: () => void
}): JSX.Element {
  const passed = s.state === 'passed'
  const waiting = now && !done && s.state === 'wait'
  const doing = now && !done && s.state === 'doing'
  const dead = now && !done && s.state === 'rejected'
  const hasWork = !!activity?.tools?.length || !!activity?.text
  const t = useT()
  /* 「它这一轮说了什么」：**当前这一步默认摊开**。
     之前为了不啰嗦把它默认收起了 —— 结果用户看到的是「它明明生成了内容，
     可我什么都看不到」。现在反过来：正在做/等点头的这一轮摊开，
     走过去的步骤自动收起（卡片不背着一堆旧报告）。 */
  const [openSaid, setOpenSaid] = useState(false)
  const saidRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    setOpenSaid(now && hasWork)
  }, [now, hasWork, activity?.at])
  /* 还在往外吐字的时候自动跟到底部 —— 不然新内容全在滚动区外面，
     用户看到的永远是开头那几行。 */
  useEffect(() => {
    const el = saidRef.current
    if (!el) return
    if (activity?.streaming) {
      el.scrollTop = el.scrollHeight
    } else {
      /* 说完了要**回到开头**：停在底部的话，看到的是尾巴，
         前半截得自己往上滚 —— 这就是「它写了我却看不全」的一个来源。 */
      el.scrollTop = 0
    }
  }, [activity?.text, activity?.streaming, openSaid])

  return (
    <article className="car-card" data-state={s.state} data-now={now ? 'true' : 'false'}>
      <header className="car-head">
        <span className="car-no">{passed ? <Icon name="check" size={12} /> : s.i}</span>
        <b className="car-name">{s.name}</b>
        {passed && <span className="car-tag ok">{t('bf.passed')}</span>}
        {waiting && <span className="car-tag wait">{t('bf.waiting')}</span>}
        {doing && <span className="car-tag run">{t('bf.doing')}</span>}
        {dead && <span className="car-tag bad">{t('bf.dead')}</span>}
      </header>

      {/* 卡的「身体」：内容长了在这里滚，门槛（下面那块）永远留在卡底 */}
      <div className="car-body">
        <span className="car-does">{s.does}</span>

        {/* 交出来的东西 —— 每一步都得有；拿不出来就不算做完 */}
        {s.note && <p className="car-note">{t('bf.note', { note: s.note })}</p>}
        {!!s.evidence?.length && (
          <div className="car-ev">
            {s.evidence.map((e) => (
              <code key={e}>{e}</code>
            ))}
          </div>
        )}
        {!s.note && !passed && !now && <p className="car-todo">{t('bf.todo')}</p>}

        {/* 它这一轮干了什么 / 说了什么 —— 就在卡里，但要用户主动展开展开 */}
        {hasWork && (
          <div className="car-work">
            {activity?.tools?.length ? (
              <Pipeline
                tools={activity.tools}
                streaming={activity.streaming}
                failed={!!activity.error}
                ms={activity.ms}
                since={activity.at}
                collapsible
              />
            ) : null}
            {activity?.text && (
              <>
                <button className="car-said-toggle" onClick={() => setOpenSaid((v) => !v)}>
                  <Icon name={openSaid ? 'collapse' : 'expand'} size={11} />
                  {t(openSaid ? 'bf.said.hide' : 'bf.said.show')}
                </button>
                {openSaid && (
                  <div                    ref={saidRef}                    className="car-said md"
                    onClick={(e) => mdClick(e, t)}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(activity.text, t('md.copy')) }}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* 门槛：它停在这儿了，等你说话 */}
      {waiting && (
        <div className="car-gate">
          {ask && <Ask text={ask} />}
          {blocked && <p className="car-blocked">{blocked}</p>}

          <button className="car-go" disabled={busy || !!blocked} onClick={onPass}>
            <Icon name="check" size={16} />
            {t('bf.approve')}
          </button>

          {/* 打回是例外，不是常态 —— 所以它是一行小字，不是并排的第二个按钮 */}
          {asking ? (
            <div className="car-why-row">
              <input
                className="car-why"
                autoFocus
                value={why}
                placeholder={t('bf.reject.placeholder')}
                onChange={(e) => setWhy(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && why.trim()) {
                    e.preventDefault()
                    onReject()
                  }
                }}
              />
              <button className="action-btn" disabled={busy || !!blocked} onClick={onReject}>
                {t('bf.reject')}
              </button>
            </div>
          ) : (
            <button className="car-why-open" onClick={() => setAsking(true)}>
              {t('bf.reject.hint')}
            </button>
          )}
        </div>
      )}

      {doing &&
        (stalled ? (
          <div className="car-stall">
            <span>{t('bf.stuck')}</span>
            <button className="action-btn" disabled={busy} onClick={onNudge}>
              {t('bf.nudge')}
            </button>
          </div>
        ) : (
          <p className="car-doing">
            <span className="pipe-pulse" />
            {t('bf.working', { does: s.does })}
          </p>
        ))}

      {dead && <p className="car-rejected">{t('bf.rejected')}</p>}
    </article>
  )
}

export function BuildFlow({
  flow,
  activity
}: {
  flow: BuildFlowState
  /** 它最新那一轮的动静（工具 + 说的话）—— 收在当前卡里 */
  activity?: ChatMessage
}): JSX.Element | null {
  const { build, busy, done, blocked, pass, reject, reset, nudge } = flow
  const [why, setWhy] = useState('')
  const [asking, setAsking] = useState(false)
  const [view, setView] = useState(0)
  const t = useT()

  const step = build?.step ?? 0

  /** 状态一变（点通过 / 它又推进一步），轮播**自动滑过去** */
  useEffect(() => {
    if (step > 0) setView(step - 1)
    setAsking(false)
  }, [step, build?.id, build?.state, build?.finishedAt])

  // 没有进行中的构建 —— 浮窗就还是普通对话，这里什么都不占
  if (!build) return null

  const cur = build.steps[step - 1]

  return (
    <div className="build-flow" data-state={build.state} data-full="true">
      <div className="flow-head">
        <span className="flow-sub">
          {done
            ? t('bf.done')
            : t('bf.step', { step, total: TOTAL, name: cur?.name || '' })}
        </span>

        <span className="car-dots">
          {build.steps.map((s, i) => (
            <button
              key={s.i}
              className="car-dot"
              data-state={dotState(s, !done && step === s.i)}
              title={`${s.i}. ${s.name}${s.note ? ` — ${t('bf.note', { note: s.note })}` : ''}`}
              onClick={() => setView(i)}
            />
          ))}
        </span>

        <span className="car-nav">
          <button
            className="icon-btn"
            title={t('bf.prev')}
            disabled={view <= 0}
            onClick={() => setView((v) => Math.max(0, v - 1))}
          >
            <Icon name="collapse" size={13} />
          </button>
          <button
            className="icon-btn"
            title={t('bf.next')}
            disabled={view >= TOTAL - 1}
            onClick={() => setView((v) => Math.min(TOTAL - 1, v + 1))}
          >
            <Icon name="expand" size={13} />
          </button>
        </span>

        <button
          className="icon-btn"
          title={t(done ? 'bf.clear' : 'bf.abort')}
          disabled={busy}
          onClick={() => void reset()}
        >
          <Icon name="close" size={13} />
        </button>
      </div>

      <div className="carousel">
        <div className="car-track" style={{ transform: `translateX(${-view * 100}%)` }}>
          {build.steps.map((s) => (
            <Card
              key={s.i}
              s={s}
              now={!done && step === s.i}
              done={done}
              ask={build.ask}
              // 只有当前这一步才把它的动静贴出来 —— 旧卡上是历史，别混进来
              activity={!done && step === s.i ? activity : undefined}
              why={why}
              setWhy={setWhy}
              asking={asking}
              setAsking={setAsking}
              busy={busy}
              blocked={blocked}
              // 它说完了却没停 —— 卡在「进行中」得给条出路
              stalled={!!activity && !activity.streaming}
              onPass={() => void pass()}
              onReject={() => void reject(why)}
              onNudge={() => void nudge()}
            />
          ))}
        </div>
      </div>

      {done && (
        <button className="car-go" disabled={busy} onClick={() => void reset()}>
          <Icon name="check" size={16} />
          {t('bf.backchat')}
        </button>
      )}

      {!done && view !== step - 1 && (
        <button className="car-back" onClick={() => setView(step - 1)}>
          {t('bf.backstep', { step, name: cur?.name || '' })} <Icon name="expand" size={11} />
        </button>
      )}
    </div>
  )
}
