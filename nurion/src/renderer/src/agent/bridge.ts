import * as agentUi from './agent-ui'

/**
 * 把界面管道挂上：引擎的 agent 要操作界面时，主进程发 agent:uiCall，
 * 这里扫 DOM 执行动作，再把结果送回主进程 → 原路返回给 mcp-server。
 * 在应用启动时调一次即可。
 */
export function installUiBridge(): void {
  const bridge = window.workbench?.ui
  if (!bridge) return
  bridge.onUiCall(({ callId, tool, args }) => {
    agentUi
      .run({ tool, args: args as Record<string, unknown> })
      .then((result) => bridge.uiResult(callId, result))
      .catch((e: Error) => bridge.uiResult(callId, { ok: false, error: e.message }))
  })
}
