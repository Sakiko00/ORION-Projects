import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Toasts, toast } from './Toasts'
import { AgentChatBody } from './AgentChatBody'
import { BuildFlow } from './BuildFlow'
import { AgentChatProvider, useAgentChat } from '../agent-chat'
import { useBuildFlow } from '../build-state'
import { registerAgentAsk } from '../agent-bus'
import { I18nProvider, useT } from '../i18n'
import { applyPrefs, readPrefs, type UiPrefs } from '../ui-prefs'

/**
 * 助手窗口 —— 一个独立的桌面窗口（main 进程 `?agent=1` 建的，420×640 无边框）。
 *
 * 主窗口导航栏点「助手」→ 打开这个窗口。头部是拖拽区，能拖到桌面任何地方；
 * 对话 + 构建轮播都住在这里。主窗口只留一个入口按钮，不再有浮窗。
 */

function AgentWindowInner({ running }: { running: boolean }): JSX.Element {
  const t = useT()
  const chat = useAgentChat()
  const flow = useBuildFlow(toast)
  /** 它最新那一轮 —— 收在构建卡里，构建时不用切走去看它在干什么 */
  const lastAi = [...chat.msgs].reverse().find((m) => m.role === 'ai')

  /* 注册自己：窗口内部的 askFloatingAgent（BuildFlow 通过/打回）直接递话给 chat */
  const chatRef = useRef(chat)
  chatRef.current = chat
  useEffect(() => {
    registerAgentAsk((text) => void chatRef.current.ask(text))
    // 主窗口（或别处）递话进来 —— 「开工」「让 AI 处置」都走这条
    window.workbench?.agentWindow?.onIncoming((text) => void chatRef.current.ask(text))
    return () => registerAgentAsk(null)
  }, [])

  /* 打开时读一次构建 —— 主窗口刚点了开工，这里要能看到第 1 步 */
  const refreshBuild = flow.refresh
  useEffect(() => {
    void refreshBuild()
  }, [refreshBuild])

  const dot = chat.thinking
    ? 'thinking'
    : flow.waiting
      ? 'ask'
      : running
        ? 'task'
        : chat.engineOk
          ? 'idle'
          : 'down'
  const dotTitle =
    dot === 'thinking'
      ? t('ag.moving')
      : dot === 'ask'
        ? t('ag.ask', { n: flow.build?.step ?? 0 })
        : dot === 'task'
          ? t('ag.task')
          : dot === 'down'
            ? t('ag.down')
            : t('ag.idle')

  return (
    <div className="agent-float agent-window">
      <div className="agent-float-head">
        <span className="agent-float-avatar" data-state={dot} aria-hidden="true">
          <Icon name="bolt" size={13} />
        </span>
        <span className="agent-float-id">
          <b>{t('nav.agent')}</b>
          <em data-state={dot}>{dotTitle}</em>
        </span>
        <button
          className="icon-btn"
          title={t('ag.newchat')}
          onClick={() => {
            /* 开新对话会把助手对刚才的对话的记忆清掉（不是只清屏幕）—— 所以要问一句 */
            if (window.confirm(t('ag.newchat.confirm'))) void chat.clear()
          }}
        >
          <Icon name="plus" size={14} />
        </button>
        <button
          className="icon-btn"
          title={t('ag.close')}
          onClick={() => window.workbench?.agentWindow?.close()}
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      <div className="agent-float-body">
        {flow.build ? (
          <BuildFlow flow={flow} activity={lastAi} />
        ) : (
          <AgentChatBody
            msgs={chat.msgs}
            engineOk={chat.engineOk}
            input={chat.input}
            setInput={chat.setInput}
            busy={chat.busy}
            showExamples={false}
            compact
            onAsk={(t) => void chat.ask(t)}
            onStop={() => void chat.stopTurn()}
            onStartEngine={() => void chat.startEngine()}
            starting={chat.starting}
          />
        )}
      </div>

      <Toasts />
    </div>
  )
}

export function AgentWindow(): JSX.Element {
  const [running, setRunning] = useState(false)
  /*
   * 偏好（主题 / 字号 / 语言）跟主窗口走。
   *
   * 悬浮窗是**另一个 document** —— 主窗口把偏好写到自己的 body 上，这里一点都不知道，
   * 所以之前它永远是硬编码深色 + 中文。
   * 同步靠 localStorage 的 `storage` 事件：它**只在其他窗口**触发，正好就是我们要的方向。
   */
  const [prefs, setPrefs] = useState<UiPrefs>(() => readPrefs())

  useEffect(() => applyPrefs(prefs), [prefs])

  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === 'workbench.ui' || e.key === null) setPrefs(readPrefs())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  /* 跟系统主题：主窗口那边也有同样一段 —— 两边各管自己那个 document */
  useEffect(() => {
    if (prefs.theme !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = (): void => applyPrefs(readPrefs())
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [prefs.theme])

  /* 有没有任务在跑 —— 决定能不能再让它动手（busy） */
  useEffect(() => {
    let alive = true
    const check = async (): Promise<void> => {
      try {
        const r = await window.workbench.run.running()
        if (alive) setRunning(!!r)
      } catch {
        /* 主进程没起来就不动 */
      }
    }
    void check()
    const id = setInterval(() => void check(), 3000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  return (
    <I18nProvider lang={prefs.lang}>
      <AgentChatProvider notify={toast} onTasksChanged={async () => undefined} tasks={[]} running={running}>
        <AgentWindowInner running={running} />
      </AgentChatProvider>
    </I18nProvider>
  )
}
