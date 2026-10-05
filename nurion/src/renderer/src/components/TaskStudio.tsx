import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../i18n'
import { useAgentChat } from '../agent-chat'
import { useBuildFlow } from '../build-state'
import { openFloatingAgent } from '../agent-bus'
import type { ScriptLite } from '../agent-chat'
import type { LiveRun } from '../run-types'
import { BuildEntry } from './TaskStudioBuildEntry'
import { TaskList } from './TaskStudioList'
import { TaskDetail } from './TaskStudioDetail'
import { RunPanel } from './TaskStudioRunPanel'
import { BLANK, type Draft, type StudioTab, type StudioTask, type TaskRun } from './studio-types'

/**
 * 构建页 —— 把「一件事」变成「一条能按时跑的任务」。
 *
 * 这个文件只当**容器**：管状态和数据流（保存/试跑/删除…），三块 UI 各是一个组件：
 *   BuildEntry  ① 开工入口（一句话 + 6 步流程入口）
 *   TaskList    ② 任务清单（勾选启用 + 健康色点 + 未接线脚本）
 *   TaskDetail  ③ 详情卡（节点头 + 字段 + 动作 + 运行面板）
 *
 * 最要紧的还是**试跑**：不试跑就挂任务的，等于闭着眼睛接线。
 * 试跑走的是和正式运行完全同一条路（主进程的 runner），所以这里看到的输出
 * 就是以后定时跑时看到的输出 —— 不存在「测试环境能跑、线上跑不了」。
 */

interface TaskStudioProps {
  tasks: StudioTask[]
  live: LiveRun | null
  logLines: string[]
  reload: () => Promise<void>
  onRun: (taskId: string) => void
  onStop: () => void
  /** 全部运行历史 —— App 手里有，传进来回看 */
  runs: TaskRun[]
  /** 某个任务上一次跑出了哪些产物 —— App 手里有 runs，这里不重复存一份 */
  artifactsFor: (taskId: string) => string[]
  notify: (text: string, tone?: 'ok' | 'bad' | 'info') => void
}

export function TaskStudio({
  tasks,
  live,
  logLines,
  reload,
  onRun,
  onStop,
  runs,
  artifactsFor,
  notify
}: TaskStudioProps) {
  const t = useT()
  const chat = useAgentChat()
  const flow = useBuildFlow(notify)
  const [draft, setDraft] = useState<Draft>(BLANK)
  const [saved, setSaved] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  /** 顶部那句话（只在还没开工时用）。发出去就清空 —— 不留记录 */
  const [brief, setBrief] = useState('')
  const [tab, setTab] = useState<StudioTab>('log')
  const [showScripts, setShowScripts] = useState(false)
  /** 只自动选一次 —— 否则点「新建」会被立刻重新选中第一个任务 */
  const autoPicked = useRef(false)

  const { loadScripts, scripts, makeTask } = chat

  useEffect(() => {
    void loadScripts()
  }, [loadScripts])

  const pick = useCallback((t: StudioTask): void => {
    const d: Draft = {
      id: t.id,
      name: t.name,
      cmd: t.cmd || '',
      cwd: t.cwd || '',
      schedule: t.schedule || '手动触发',
      agent: t.agent || '',
      enabled: t.enabled
    }
    setDraft(d)
    setSaved(d)
    setShowScripts(false)
  }, [])

  const dirty = useMemo(() => {
    if (!saved) return draft.name.trim().length > 0 || draft.cmd.trim().length > 0
    return JSON.stringify(saved) !== JSON.stringify(draft)
  }, [draft, saved])

  useEffect(() => {
    if (!tasks.length) return
    if (!draft.id) {
      if (!autoPicked.current) {
        autoPicked.current = true
        pick(tasks[0])
      }
      return
    }
    // 选中的任务被外面删了，草稿别留在幽灵状态
    if (!tasks.some((t) => t.id === draft.id)) {
      setDraft(BLANK)
      setSaved(null)
    }
  }, [tasks, draft.id, pick])

  const save = useCallback(async (): Promise<string | null> => {
    const name = draft.name.trim()
    if (!name) {
      notify(t('st.needname'), 'bad')
      return null
    }
    setBusy(true)
    try {
      const patch = {
        name,
        cmd: draft.cmd.trim(),
        cwd: draft.cwd.trim(),
        schedule: draft.schedule.trim() || '手动触发',
        agent: draft.agent.trim(),
        enabled: draft.enabled
      }
      // 新建时 id 要现拿（setState 是异步的，不能指望 draft.id 已经更新）
      let id = draft.id
      if (id) {
        await window.workbench.agent.call('update_task', { id, ...patch })
      } else {
        const created = (await window.workbench.agent.call('create_task', patch)) as { id?: string }
        id = created?.id || ''
      }
      if (!id) throw new Error(t('st.noid'))
      const next = { ...draft, id }
      setDraft(next)
      setSaved(next)
      await reload()
      await loadScripts()
      notify(t('st.saved', { name }), 'ok')
      return id
    } catch (e) {
      notify(t('st.save.bad', { err: String((e as Error)?.message || e) }), 'bad')
      return null
    } finally {
      setBusy(false)
    }
  }, [draft, notify, reload, loadScripts, t])

  /** 试跑：先存再跑 —— 不然跑的是旧版本，看到的输出会骗人 */
  const tryRun = async (): Promise<void> => {
    setTab('log')
    const id = await save()
    if (id) onRun(id)
  }

  const remove = async (): Promise<void> => {
    if (!draft.id) {
      setDraft(BLANK)
      setSaved(null)
      return
    }
    setBusy(true)
    try {
      await window.workbench.agent.call('delete_task', { id: draft.id, allowDelete: true })
      notify(t('st.deleted', { name: draft.name }), 'ok')
      setDraft(BLANK)
      setSaved(null)
      await reload()
      await loadScripts()
    } catch (e) {
      notify(t('st.del.bad', { err: String((e as Error)?.message || e) }), 'bad')
    } finally {
      setBusy(false)
    }
  }

  /** 复制一份。**建成停用状态** —— 副本要是直接生效，定时里就会多跑一次 */
  const duplicate = async (): Promise<void> => {
    if (!draft.id) return
    setBusy(true)
    try {
      const copyName = t('st.copy.name', { name: draft.name })
      await window.workbench.agent.call('create_task', {
        name: copyName,
        cmd: draft.cmd,
        cwd: draft.cwd,
        schedule: draft.schedule,
        agent: draft.agent,
        enabled: false
      })
      notify(t('st.copy.ok', { name: draft.name }), 'ok')
      await reload()
    } catch (e) {
      notify(t('st.copy.bad', { err: String((e as Error)?.message || e) }), 'bad')
    } finally {
      setBusy(false)
    }
  }

  /** 清单里那个勾：直接开关任务，不用点进去再翻开关 */
  const toggleEnabled = async (task: StudioTask): Promise<void> => {
    try {
      await window.workbench.agent.call('update_task', { id: task.id, enabled: !task.enabled })
      await reload()
    } catch (e) {
      notify(t('st.update.bad', { err: String((e as Error)?.message || e) }), 'bad')
    }
  }

  /** 顶部那句话 —— 开一件新事（6 步流程会出现在悬浮窗里） */
  const startBuild = (): void => {
    const text = brief.trim()
    if (!text) return
    setBrief('')
    void flow.start(text)
    openFloatingAgent() // 让它能看见第 1 步马上开始走
  }

  const running = !!live && !live.done
  const runningThis = running && live?.taskId === draft.id
  const onCount = tasks.filter((t) => t.enabled).length

  /** 挂在这个任务上的脚本 */
  const attached: ScriptLite[] = scripts.filter((s) => s.taskId === draft.id)
  /** 写完了但还没接线 —— 这一堆最容易被忘在硬盘上 */
  const orphans: ScriptLite[] = scripts.filter((s) => !s.taskId)

  const shownArtifacts =
    live && live.taskId === draft.id && live.done
      ? live.done.artifacts || []
      : draft.id
        ? artifactsFor(draft.id)
        : []

  /** 这个任务的历史运行 —— 最新的排最前（历史 tab 的流水） */
  const myRuns = useMemo(
    () => [...runs].reverse().filter((r) => r.taskId === draft.id),
    [runs, draft.id]
  )

  /** 上次健康状态 —— 和清单里的色点同一个来源（task.status），保证不打架 */
  const pickedTask = useMemo(
    () => tasks.find((t) => t.id === draft.id),
    [tasks, draft.id]
  )
  const lastRunSummary =
    pickedTask?.status && pickedTask.status !== 'idle'
      ? { ok: pickedTask.status === 'ok', at: pickedTask.lastRun }
      : null

  return (
    <div className="pane-page build">
      <BuildEntry
        brief={brief}
        onBrief={setBrief}
        build={flow.build}
        busy={flow.busy}
        onStart={startBuild}
      />
      <TaskList
        tasks={tasks}
        draftId={draft.id}
        runningTaskId={running ? live?.taskId ?? null : null}
        onCount={onCount}
        orphans={orphans}
        onPick={pick}
        onToggle={toggleEnabled}
        onMakeTask={makeTask}
        onNew={() => {
          setDraft(BLANK)
          setSaved(null)
        }}
      />
      <TaskDetail
        draft={draft}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        dirty={dirty}
        attached={attached}
        showScripts={showScripts}
        onToggleScripts={() => setShowScripts((v) => !v)}
        busy={busy}
        running={running}
        runningThis={runningThis}
        onSave={() => void save()}
        onTryRun={() => void tryRun()}
        onStop={onStop}
        onDuplicate={() => void duplicate()}
        onRemove={() => void remove()}
      />
      <RunPanel
        tab={tab}
        onTab={setTab}
        shownArtifacts={shownArtifacts}
        myRuns={myRuns}
        live={live}
        taskId={draft.id}
        logLines={logLines}
        runningThis={runningThis}
        lastRunSummary={lastRunSummary}
        notify={notify}
      />
    </div>
  )
}
