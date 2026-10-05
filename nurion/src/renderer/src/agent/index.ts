// nanobot 接入层占位
// TODO: 拿到 nanobot 的接入方式后，在此封装客户端 / 桥接逻辑

export interface AgentStatus {
  running: boolean
  name: string
}

export async function connectAgent(): Promise<AgentStatus> {
  throw new Error('nanobot 尚未接入')
}
