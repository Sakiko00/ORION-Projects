/**
 * 把一句话递给助手 —— 给**够不到 Provider 的地方**用。
 *
 * 助手现在住在**独立的桌面窗口**里（AgentWindow），所以递话有两种走法：
 *   - 助手窗口自己内部（BuildFlow 通过/打回）：`registerAgentAsk` 注册了 chat.ask，直接递。
 *   - 主窗口（警卡「让 AI 处置」、构建页开工）：没有注册，走 IPC 打开助手窗口再把话发过去。
 * 两个走法同一根函数，调用方不用管自己在哪个窗口。
 */

type Ask = (text: string) => void

let ask: Ask | null = null

/** 由助手窗口注册（挂载时注册、卸载时注销） */
export function registerAgentAsk(fn: Ask | null): void {
  ask = fn
}

/**
 * 从任何地方把一句话交给助手：**会先把助手窗口打开**再发出去 ——
 * 不然它自己闷头干活，用户只看到任务列表突然多了一条，不知道是谁干的。
 */
export function askFloatingAgent(text: string): void {
  const t = text.trim()
  if (!t) return
  if (ask) {
    ask(t)
    return
  }
  window.workbench?.agentWindow?.openAndSend(t)
}

/** 只把助手窗口叫出来（构建页的「看流程」用） */
export function openFloatingAgent(): void {
  window.workbench?.agentWindow?.open()
}
