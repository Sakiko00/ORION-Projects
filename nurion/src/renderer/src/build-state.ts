import { useCallback, useEffect, useState } from 'react'
import { askFloatingAgent } from './agent-bus'
import { useAgentChat } from './agent-chat'
import type { Build } from './run-types'

/**
 * 构建流程的状态 —— 提到这里，是因为**两处都要用**：
 *   1. 悬浮窗里的轮播（画流程）
 *   2. 收起时那颗球（它停在门槛上等你点头，球得能看出来）
 *
 * 只放一个地方：`BuildFlow` 只管画，不再自己取数。
 *
 * ⚠️ 刷新时机：它推进流程走的是 MCP（`advance_build`），主进程不会主动通知界面。
 * 所以靠**一轮对话结束**这个信号去重读 —— 它干完一步、说完话，界面就该刷新。
 * 这是不引事件通道也能对上的最省的做法。
 */

/**
 * 构建状态变了 —— 广播一声。
 *
 * 为什么需要：**构建页和悬浮窗各持一份**（两处都得自己知道走到哪了）。
 * 没有这根线就会出现：在构建页点了「开工」，悬浮窗那边还以为没开工，
 * 轮播不出现 —— 而用户明明刚点了。
 * 三个人（含「一轮对话结束」那个信号）能对上，就靠这一声。
 */
const subs = new Set<() => void>()

/** 谁改了 `build.json`，谁喊一声 */
export function bumpBuild(): void {
  for (const f of [...subs]) f()
}

export interface BuildFlowState {
  build: Build | null
  /** 请求进行中（按钮防连点） */
  busy: boolean
  /** 正停在门槛上等你点头 —— 球和页签都靠它亮 */
  waiting: boolean
  /** 已经上线了 */
  done: boolean
  /** 为什么现在不能点（助手还在回话）—— 空串就是能点 */
  blocked: string
  refresh: () => Promise<void>
  start: (brief: string) => Promise<void>
  pass: () => Promise<void>
  reject: (why: string) => Promise<void>
  reset: () => Promise<void>
  /**
   * 催它接着走。
   * 用在哪儿：它这一轮说完了、却没停下来停在门槛上（忘了调 `advance_build`，
   * 或者中途报错断了）。那种时候界面卡在「进行中」——
   * **无脑的界面最不能有的就是一个没有出口的状态**。
   */
  nudge: () => Promise<void>
}

export function useBuildFlow(notify: (text: string, tone?: 'ok' | 'bad' | 'info') => void): BuildFlowState {
  const chat = useAgentChat()
  const [build, setBuild] = useState<Build | null>(null)
  const [busy, setBusy] = useState(false)

  /**
   * ⚠️ 「通过」和「打回」是两个动作：① 推构建状态 ② 把下一句递给助手。
   * 助手忙着的时候 ② 会被丢掉（`ask` 会拒），而 ① 已经生效 ——
   * 结果是「步骤走过去了，但它永远不知道」，卡死。
   * 所以**助手忙就干脆不让点**，说清楚原因，而不是点了再默默丢一句话。
   */
  const blocked = chat.busy ? '助手还在回话 —— 等它说完再点' : ''

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const b = (await window.workbench?.build.get()) as Build | null
      // ⚠️ 判据要带上 steps —— 空对象是 truthy，放进去会让下游读 build.steps[..] 当场崩
      setBuild(b && Array.isArray(b.steps) ? b : null)
    } catch {
      setBuild(null)
    }
  }, [])

  /* 挂载先读一次。
     ⚠️ 别把这一步省掉、只留下面那个「一轮结束就读」—— 挂载时如果它正好在回话，
     `thinking` 是 true，那个 effect 就不跑，界面会一直以为「没在构建」。 */
  useEffect(() => {
    void refresh()
  }, [refresh])

  /* 一轮对话结束 = 它（可能）刚推进了流程。这是不引事件通道也能对上的最省的做法 */
  const thinking = chat.thinking
  useEffect(() => {
    if (!thinking) void refresh()
  }, [thinking, refresh])

  /* 别人改了构建（构建页点了开工、悬浮窗点了通过…）也得知道 */
  useEffect(() => {
    const f = (): void => void refresh()
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  }, [refresh])

  const start = useCallback(
    async (brief: string): Promise<void> => {
      const t = brief.trim()
      if (!t) return
      setBusy(true)
      try {
        const b = (await window.workbench.build.start(t)) as Build
        setBuild(b)
        bumpBuild()
        // 把「刚开始第 1 步」也交给同一段对话 ——
        // 不说的话它会以为是普通提问，一口气干到上线
        askFloatingAgent(
          `${t}\n\n（走固定 6 步：接单 → 摸底 → 动手 → 试跑 → 验收 → 上线。` +
            `现在是第 1 步「接单」，做完用 advance_build 停下等我点头。）`
        )
      } catch (e) {
        notify(`开不起来：${String((e as Error)?.message || e)}`, 'bad')
      } finally {
        setBusy(false)
      }
    },
    [notify]
  )

  const pass = useCallback(async (): Promise<void> => {
    if (!build) return
    if (chat.busy) {
      notify(blocked, 'bad')
      return
    }
    const name = build.steps[build.step - 1]?.name || ''
    setBusy(true)
    try {
      const b = (await window.workbench.build.pass()) as Build
      setBuild(b)
      bumpBuild()
      if (b.finishedAt) {
        askFloatingAgent(
          `第 6 步「上线」我点通过了 —— 这件事成了${b.taskName ? `，任务叫「${b.taskName}」` : ''}。` +
            `把这次踩到的坑写进知识库（write_note），能沉淀成 skill 的就沉淀。`
        )
      } else {
        const next = b.steps[b.step - 1]
        askFloatingAgent(
          `第 ${b.step - 1} 步「${name}」我点通过了。\n` +
            `现在做第 ${b.step} 步「${next.name}」：${next.does}。做完照旧停下等我点头。`
        )
      }
    } catch (e) {
      notify(`放行失败：${String((e as Error)?.message || e)}`, 'bad')
    } finally {
      setBusy(false)
    }
  }, [build, chat.busy, blocked, notify])

  const reject = useCallback(
    async (why: string): Promise<void> => {
      if (!build) return
      if (chat.busy) {
        notify(blocked, 'bad')
        return
      }
      const said = why.trim()
      setBusy(true)
      try {
        const b = (await window.workbench.build.reject(said)) as Build
        setBuild(b)
        bumpBuild()
        askFloatingAgent(
          `第 ${b.step} 步「${b.steps[b.step - 1].name}」我打回了：${said || '（没说为什么，你自己再想一遍）'}\n\n` +
            `别辩解，也别原样重做 —— 先想清楚我为什么这么说，改完再停下等我点头。`
        )
      } catch (e) {
        notify(`打回失败：${String((e as Error)?.message || e)}`, 'bad')
      } finally {
        setBusy(false)
      }
    },
    [build, chat.busy, blocked, notify]
  )

  const reset = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      await window.workbench.build.reset()
      setBuild(null)
      bumpBuild()
      notify('这次构建已撤掉（已建好的任务和脚本没动）', 'info')
    } catch (e) {
      notify(`撤不掉：${String((e as Error)?.message || e)}`, 'bad')
    } finally {
      setBusy(false)
    }
  }, [notify])

  /** 催它接着走 —— 用在「它这一轮说完了、却没停在门槛上」那个死局里 */
  const nudge = useCallback(async (): Promise<void> => {
    if (!build) return
    const st = build.steps[build.step - 1]
    askFloatingAgent(
      `第 ${build.step} 步「${st?.name}」你还没停下告诉我结果。接着干：${st?.does}。\n` +
        `干完用 advance_build（state=wait）停下等我点头。`
    )
  }, [build])

  return {
    build,
    busy,
    waiting: build?.state === 'wait',
    done: !!build?.finishedAt,
    blocked,
    refresh,
    start,
    pass,
    reject,
    reset,
    nudge
  }
}
