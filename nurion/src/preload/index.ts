import { contextBridge, ipcRenderer } from 'electron'

/*
 * 运行事件：**只订阅一次**，再按 id 分发给渲染侧。
 *
 * 为什么不在 onEvent 里直接 ipcRenderer.on 并返回一个退订函数：
 * contextBridge 的返回值必须能被结构化克隆，**不能是函数** ——
 * 那样订阅完就退不掉，HMR / 重渲染几次就攒出一堆监听器
 * （真报过 MaxListenersExceededWarning: 11 run:event listeners）。
 */
type RunCb = (e: unknown) => void
const runSubs = new Map<number, RunCb>()
let runSeq = 0

ipcRenderer.on('run:event', (_event, payload) => {
  for (const cb of [...runSubs.values()]) {
    try {
      cb(payload)
    } catch {
      /* 一个订阅出错不该连累其他订阅 */
    }
  }
})

type AssistantCb = (e: unknown) => void
const assistantSubs = new Map<number, AssistantCb>()
let assistantSeq = 0

ipcRenderer.on('assistant:event', (_event, payload) => {
  for (const cb of [...assistantSubs.values()]) {
    try {
      cb(payload)
    } catch {
      /* 同上 */
    }
  }
})

type AlertsCb = (e: unknown) => void
const alertSubs = new Map<number, AlertsCb>()
let alertSeq = 0

ipcRenderer.on('alerts:event', (_event, payload) => {
  for (const cb of [...alertSubs.values()]) {
    try {
      cb(payload)
    } catch {
      /* 同上 */
    }
  }
})

/* 桌宠配置变更。
 * ⚠️ 这里以前是直接 `ipcRenderer.on('pet:config', ...)` 且**没有退订** ——
 * 桌宠窗每次重挂（开发时 HMR 一次就算一次）就多一个监听器，
 * 攒到 11 个就报 MaxListenersExceededWarning。和上面三个走同一套。 */
type PetCb = (cfg: unknown) => void
const petSubs = new Map<number, PetCb>()
let petSeq = 0

ipcRenderer.on('pet:config', (_event, payload) => {
  for (const cb of [...petSubs.values()]) {
    try {
      cb(payload)
    } catch {
      /* 同上 */
    }
  }
})

/* 扫码登录是流式的 —— 和上面几个同一套按 id 分发。 */
type ChannelLoginCb = (msg: unknown) => void
const channelLoginSubs = new Map<number, ChannelLoginCb>()
let channelLoginSeq = 0

ipcRenderer.on('channels:login', (_event, payload) => {
  for (const cb of [...channelLoginSubs.values()]) {
    try {
      cb(payload)
    } catch {
      /* 同上 */
    }
  }
})

// 暴露给渲染进程的安全桥接 API
const api = {
  appVersion: '1.0.0',
  platform: process.platform,
  windowControls: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    toggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
    close: (): void => ipcRenderer.send('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    onMaximizeChange: (callback: (maximized: boolean) => void): void => {
      ipcRenderer.on('window:maximized', (_event, maximized: boolean) => callback(maximized))
    }
  },
  app: {
    /** 打开一个受控目录（白名单在 main）：vault = 数据目录，nanobot = 引擎配置目录 */
    openFolder: (which: 'vault' | 'nanobot'): Promise<{ ok: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('app:openFolder', which),
    getAutoStart: (): Promise<boolean> => ipcRenderer.invoke('app:getAutoStart'),
    setAutoStart: (on: boolean): Promise<boolean> => ipcRenderer.invoke('app:setAutoStart', on),
    /** 用系统浏览器打开外部网页（设置页「高级」的官网 / 仓库）。main 只放行 https */
    openUrl: (url: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('app:openUrl', url),
    /** 所有会在磁盘上落脚的位置 —— 设置页把它一条条列出来，不藏 */
    paths: (): Promise<{
      vault: string
      runtime: string
      userData: string
      engine: string
      derived: string
    }> => ipcRenderer.invoke('app:paths'),
    /** 真的退出。红点只是收进托盘（见 main 的 close 拦截），
     *  设置页里得留一个明说的出口 —— 不然用户不知道去哪退。 */
    quit: (): void => ipcRenderer.send('app:quit'),
    /** 把界面主题告诉主进程：开机动画（闪屏）是 main 里自带内容的 HTML，
     *  必须赶在渲染层跑起来之前就有颜色，读不到渲染层的 localStorage。 */
    setTheme: (theme: 'light' | 'dark' | 'system'): Promise<unknown> =>
      ipcRenderer.invoke('app:setTheme', theme)
  },
  agent: {
    list: (): Promise<unknown[]> => ipcRenderer.invoke('agent:list'),
    call: (name: string, args: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke('agent:call', name, args)
  },
  engine: {
    status: (): Promise<unknown> => ipcRenderer.invoke('engine:status'),
    start: (): Promise<unknown> => ipcRenderer.invoke('engine:start'),
    stop: (): Promise<unknown> => ipcRenderer.invoke('engine:stop'),
    restart: (): Promise<unknown> => ipcRenderer.invoke('engine:restart'),
    install: (): Promise<unknown> => ipcRenderer.invoke('engine:install'),
    settings: (): Promise<unknown> => ipcRenderer.invoke('engine:settings'),
    saveSettings: (patch: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke('engine:saveSettings', patch),
    logs: (): Promise<string> => ipcRenderer.invoke('engine:logs'),
    bootstrap: (): Promise<unknown> => ipcRenderer.invoke('engine:bootstrap')
  },
  ui: {
    // 主进程递进来「agent 要操作界面」，渲染进程执行后回结果
    onUiCall: (callback: (payload: { callId: string; tool: string; args: unknown }) => void): void => {
      ipcRenderer.on('agent:uiCall', (_event, payload) => callback(payload))
    },
    uiResult: (callId: string, result: unknown): void => {
      ipcRenderer.send('agent:uiResult', { callId, result })
    }
  },
  // 运行器：执行只能主进程做（只有一份「谁在跑」的真相）
  run: {
    start: (taskId: string): Promise<{ runId: string }> => ipcRenderer.invoke('run:start', taskId),
    stop: (): Promise<{ stopped: boolean }> => ipcRenderer.invoke('run:stop'),
    running: (): Promise<unknown> => ipcRenderer.invoke('run:running'),
    log: (runId: string, tail?: number): Promise<string[]> => ipcRenderer.invoke('run:log', runId, tail),
    /** 返回订阅 id（数字才能过桥），退订用 offEvent */
    onEvent: (callback: RunCb): number => {
      const id = ++runSeq
      runSubs.set(id, callback)
      return id
    },
    offEvent: (id: number): void => {
      runSubs.delete(id)
    }
  },
  // 和引擎说话（OpenAI 兼容接口）
  assistant: {
    send: (text: string): Promise<{ turnId: string }> => ipcRenderer.invoke('assistant:send', text),
    stop: (): Promise<{ stopped: boolean }> => ipcRenderer.invoke('assistant:stop'),
    busy: (): Promise<unknown> => ipcRenderer.invoke('assistant:busy'),
    alive: (): Promise<boolean> => ipcRenderer.invoke('assistant:alive'),
    onEvent: (callback: AssistantCb): number => {
      const id = ++assistantSeq
      assistantSubs.set(id, callback)
      return id
    },
    offEvent: (id: number): void => {
      assistantSubs.delete(id)
    }
  },
  // 警：收警入口是本机 HTTP（见 alerts.ts），这里只负责看和处置
  alerts: {
    list: (n?: number): Promise<unknown[]> => ipcRenderer.invoke('alerts:list', n),
    ack: (id: string): Promise<unknown> => ipcRenderer.invoke('alerts:ack', id),
    intake: (): Promise<string> => ipcRenderer.invoke('alerts:intake'),
    onEvent: (callback: AlertsCb): number => {
      const id = ++alertSeq
      alertSubs.set(id, callback)
      return id
    },
    offEvent: (id: number): void => {
      alertSubs.delete(id)
    }
  },
  // 对话记录：落库，切页/重启不丢
  chat: {
    load: (): Promise<unknown[]> => ipcRenderer.invoke('chat:load'),
    save: (turns: unknown[]): Promise<void> => ipcRenderer.invoke('chat:save', turns),
    /** 开新对话：旧对话归档、引擎会话清掉、引擎重启（否则只是界面空了） */
    fresh: (): Promise<{ archived: string | null; wiped: number }> =>
      ipcRenderer.invoke('chat:new')
  },
  // 产物：就是 output/ 下的文件。读回来渲染，或者交给系统程序打开
  artifacts: {
    list: (): Promise<unknown[]> => ipcRenderer.invoke('artifact:list'),
    read: (name: string): Promise<unknown> => ipcRenderer.invoke('artifact:read', name),
    open: (name: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('artifact:open', name),
    reveal: (name: string): Promise<void> => ipcRenderer.invoke('artifact:reveal', name)
  },
  /*
   * 构建流程：把一件事分成固定 6 步，每步之间有一道门槛。
   *
   * ⚠️ 这一组**只给人用** —— agent 那边的工具只有 get_build / start_build / advance_build，
   * 没有 pass / reject。放行是人的权力，靠接口形状守住，不靠叮嘱。
   */
  build: {
    get: (): Promise<unknown> => ipcRenderer.invoke('build:get'),
    start: (brief: string, title?: string): Promise<unknown> =>
      ipcRenderer.invoke('build:start', brief, title),
    pass: (note?: string): Promise<unknown> => ipcRenderer.invoke('build:pass', note),
    reject: (note: string): Promise<unknown> => ipcRenderer.invoke('build:reject', note),
    reset: (): Promise<unknown> => ipcRenderer.invoke('build:reset')
  },
  /* 助手窗口：导航栏「助手」按钮打开这个独立桌面窗口，这套 API 跨两个窗口用 */
  agentWindow: {
    open: (): void => ipcRenderer.send('agent:open'),
    close: (): void => ipcRenderer.send('agent:close'),
    openAndSend: (text: string): void => ipcRenderer.send('agent:openAndSend', text),
    /** 助手窗口用：主窗口（或别处）递话进来 */
    onIncoming: (callback: (text: string) => void): void => {
      ipcRenderer.on('agent:incoming', (_event, text: string) => callback(text))
    }
  },
  /* 桌宠：应用启动就在桌面上的小家伙，点开助手窗口 */
  pet: {
    query: (): Promise<unknown> => ipcRenderer.invoke('pet:query'),
    getConfig: (): Promise<unknown> => ipcRenderer.invoke('pet:getConfig'),
    setConfig: (patch: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke('pet:setConfig', patch),
    cursor: (): Promise<{ x: number; y: number }> => ipcRenderer.invoke('pet:cursor'),
    move: (x: number, y: number): void => ipcRenderer.send('pet:move', x, y),
    /* 换上岛的尺寸（true）/ 换回小家伙的尺寸 —— 主进程按底边中点对齐，
       顺带把新的左上角坐标还回来（换尺寸会改坐标） */
    layout: (island: boolean): Promise<{ x: number; y: number }> =>
      ipcRenderer.invoke('pet:layout', island),
    position: (): Promise<{ x: number; y: number }> => ipcRenderer.invoke('pet:position'),
    open: (): void => ipcRenderer.send('pet:open'),
    /** 返回订阅 id（数字才能过桥），退订用 offConfig */
    onConfig: (callback: PetCb): number => {
      const id = ++petSeq
      petSubs.set(id, callback)
      return id
    },
    offConfig: (id: number): void => {
      petSubs.delete(id)
    }
  },
  /* AI 总开关：关掉 = 不碰外部模型，只做纯自动化 */
  ai: {
    get: (): Promise<unknown> => ipcRenderer.invoke('ai:get'),
    set: (on: boolean): Promise<unknown> => ipcRenderer.invoke('ai:set', on)
  },
  /* 渠道：协议全在 nanobot 那边，这边只是遥控器 */
  channels: {
    state: (): Promise<unknown> => ipcRenderer.invoke('channels:state'),
    gateway: (action: 'start' | 'stop' | 'restart'): Promise<unknown> =>
      ipcRenderer.invoke('channels:gateway', action),
    setEnabled: (id: string, on: boolean): Promise<unknown> =>
      ipcRenderer.invoke('channels:setEnabled', id, on),
    getConfig: (id: string): Promise<unknown> => ipcRenderer.invoke('channels:getConfig', id),
    setConfig: (id: string, patch: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke('channels:setConfig', id, patch),
    /** force = 已经登过的账号跳过盘上凭据重新扫（不加它不会出码） */
    loginStart: (id: string, force?: boolean): Promise<unknown> =>
      ipcRenderer.invoke('channels:loginStart', id, force === true),
    loginStop: (): void => ipcRenderer.send('channels:loginStop'),
    /** 返回订阅 id（数字才能过桥），退订用 offLogin */
    onLogin: (callback: ChannelLoginCb): number => {
      const id = ++channelLoginSeq
      channelLoginSubs.set(id, callback)
      return id
    },
    offLogin: (id: number): void => {
      channelLoginSubs.delete(id)
    },
    /* 配对：谁可以跟助手说话。
       ⚠️ 引擎对陌生私聊默认**不回答**，只回一个配对码；那个码要在工作台上批。 */
    pairingState: (): Promise<unknown> => ipcRenderer.invoke('pairing:state'),
    pairingAct: (action: 'approve' | 'deny' | 'revoke', channel: string, arg: string): Promise<unknown> =>
      ipcRenderer.invoke('pairing:act', action, channel, arg)
  },
  /* 出站推送：任务自己跑完/跑挂了怎么通知你。
     ⚠️ 这一个**不分渠道各写一套** —— 走 nanobot 自带的 `/trigger`，
     绑哪个会话就往哪发（见 main/agent/push.ts）。 */
  push: {
    /** 已绑的会话（引擎那边读回来的）+ 当前绑的是哪一个 */
    state: (): Promise<unknown> => ipcRenderer.invoke('push:state'),
    set: (triggerId: string): Promise<unknown> => ipcRenderer.invoke('push:set', triggerId),
    test: (text?: string): Promise<unknown> => ipcRenderer.invoke('push:test', text)
  }
}

contextBridge.exposeInMainWorld('workbench', api)

export type WorkbenchApi = typeof api
