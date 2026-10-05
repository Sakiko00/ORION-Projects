export {}

declare global {
  interface Window {
    workbench: {
      appVersion: string
      platform: string
      windowControls: {
        minimize: () => void
        toggleMaximize: () => void
        close: () => void
        isMaximized: () => Promise<boolean>
        onMaximizeChange: (callback: (maximized: boolean) => void) => void
      }
      app: {
        /** 打开一个受控目录（白名单在 main）：vault = 数据目录，nanobot = 引擎配置目录 */
        openFolder: (
          which: 'vault' | 'nanobot'
        ) => Promise<{ ok: boolean; path?: string; error?: string }>
        getAutoStart: () => Promise<boolean>
        setAutoStart: (on: boolean) => Promise<boolean>
        openUrl: (url: string) => Promise<{ ok: boolean; error?: string }>
        paths: () => Promise<{
          vault: string
          runtime: string
          userData: string
          engine: string
          derived: string
        }>
        /** 真的退出（红点只是收进托盘） */
        quit: () => void
        /** 把界面主题同步给主进程（供开机动画用） */
        setTheme: (theme: 'light' | 'dark' | 'system') => Promise<unknown>
      }
      agent: {
        list: () => Promise<unknown[]>
        call: (name: string, args: Record<string, unknown>) => Promise<unknown>
      }
      engine: {
        status: () => Promise<unknown>
        start: () => Promise<unknown>
        stop: () => Promise<unknown>
        restart: () => Promise<unknown>
        install: () => Promise<unknown>
        settings: () => Promise<unknown>
        saveSettings: (patch: Record<string, unknown>) => Promise<unknown>
        logs: () => Promise<string>
        bootstrap: () => Promise<unknown>
      }
      ui: {
        onUiCall: (callback: (payload: { callId: string; tool: string; args: unknown }) => void) => void
        uiResult: (callId: string, result: unknown) => void
      }
      run: {
        start: (taskId: string) => Promise<{ runId: string }>
        stop: () => Promise<{ stopped: boolean }>
        running: () => Promise<import('./run-types').RunningInfo | null>
        log: (runId: string, tail?: number) => Promise<string[]>
        /** 返回订阅 id，退订用 offEvent —— 不能返回函数（contextBridge 限制） */
        onEvent: (callback: (e: import('./run-types').RunEvent) => void) => number
        offEvent: (id: number) => void
      }
      assistant: {
        send: (text: string) => Promise<{ turnId: string }>
        stop: () => Promise<{ stopped: boolean }>
        busy: () => Promise<{ turnId: string } | null>
        alive: () => Promise<boolean>
        onEvent: (callback: (e: import('./run-types').AssistantEvent) => void) => number
        offEvent: (id: number) => void
      }
      alerts: {
        list: (n?: number) => Promise<import('./run-types').VaultAlert[]>
        ack: (id: string) => Promise<import('./run-types').VaultAlert>
        intake: () => Promise<string>
        onEvent: (callback: (e: import('./run-types').AlertEvent) => void) => number
        offEvent: (id: number) => void
      }
      chat: {
        load: () => Promise<import('./run-types').ChatMessage[]>
        save: (turns: import('./run-types').ChatMessage[]) => Promise<void>
        /** 开新对话：归档 + 清空 + 清掉引擎会话（引擎那边也会重启） */
        fresh: () => Promise<{ archived: string | null; wiped: number }>
      }
      artifacts: {
        list: () => Promise<import('./run-types').ArtifactMeta[]>
        read: (name: string) => Promise<import('./run-types').ArtifactContent>
        open: (name: string) => Promise<{ ok: boolean; error?: string }>
        reveal: (name: string) => Promise<void>
      }
      /**
       * 构建流程（固定 6 步，每步一道门槛）。
       * ⚠️ 这一组**只给人用** —— agent 的工具里没有 pass/reject。
       * 放行是人的权力，靠接口形状守住，不靠 AGENTS.md 里叮嘱。
       */
      build: {
        get: () => Promise<import('./run-types').Build | null>
        start: (brief: string, title?: string) => Promise<import('./run-types').Build>
        pass: (note?: string) => Promise<import('./run-types').Build>
        reject: (note: string) => Promise<import('./run-types').Build>
        reset: () => Promise<{ ok: true }>
      }
      /** 助手窗口（独立桌面窗口，导航栏「助手」按钮打开，可拖到桌面） */
      agentWindow: {
        open: () => void
        close: () => void
        openAndSend: (text: string) => void
        onIncoming: (callback: (text: string) => void) => void
      }
      /** 桌宠（启动即有的桌面小家伙）：状态查询 / 拖动 / 点开助手窗口 / 形象配置 */
      pet: {
        query: () => Promise<{
          alive: boolean
          busy: boolean
          running: boolean
          runningTask: string | null
          buildWait: boolean
          buildStep: number | null
          buildTitle: string | null
        }>
        getConfig: () => Promise<import('./run-types').PetConfig>
        setConfig: (patch: Partial<import('./run-types').PetConfig>) => Promise<import('./run-types').PetConfig>
        cursor: () => Promise<{ x: number; y: number }>
        move: (x: number, y: number) => void
        /** 换上岛的尺寸（true）/ 换回小家伙的尺寸，返回新的左上角坐标 */
        layout: (island: boolean) => Promise<{ x: number; y: number }>
        position: () => Promise<{ x: number; y: number }>
        open: () => void
        /** 返回订阅 id，退订用 offConfig */
        onConfig: (callback: (cfg: import('./run-types').PetConfig) => void) => number
        offConfig: (id: number) => void
      }
      /* AI 总开关：关掉 = 不启引擎、不给助手开门、不碰外部模型 */
      ai: {
        get: () => Promise<{ enabled: boolean }>
        set: (on: boolean) => Promise<{ enabled: boolean }>
      }
      /* 渠道。协议全在 nanobot 那边，这边只是遥控器。 */
      channels: {
        state: () => Promise<{
          gateway: boolean
          pid: number | null
          port: number
          channels: { id: string; name: string; enabled: boolean }[]
          error?: string
        }>
        gateway: (action: 'start' | 'stop' | 'restart') => Promise<unknown>
        setEnabled: (id: string, on: boolean) => Promise<{ ok: boolean; error?: string }>
        /** 读某个渠道在源配置里的那一节（表单回填） */
        getConfig: (id: string) => Promise<{
          ok: boolean
          config: Record<string, unknown>
          error?: string
        }>
        /** 写某个渠道的几个字段（表单保存）。只合并传进来的键，其余原样保留 */
        setConfig: (
          id: string,
          patch: Record<string, unknown>
        ) => Promise<{ ok: boolean; error?: string }>
        loginStart: (id: string, force?: boolean) => Promise<{ ok: boolean; error?: string }>
        loginStop: () => void
        onLogin: (callback: (msg: { kind: 'qr' | 'log' | 'done'; text: string; code?: number }) => void) => number
        offLogin: (id: number) => void
        /* 配对：谁可以跟助手说话 */
        pairingState: () => Promise<{
          pending: { code: string; channel: string; sender: string; left: number }[]
          approved: Record<string, string[]>
          error?: string
        }>
        pairingAct: (
          action: 'approve' | 'deny' | 'revoke',
          channel: string,
          arg: string
        ) => Promise<{ ok: boolean; error?: string }>
      }
      /* 出站推送。不分渠道各写一套 —— 走 nanobot 自带的 /trigger，
         绑哪个会话就往哪发。 */
      push: {
        state: () => Promise<{
          triggerId: string
          triggers: { id: string; name: string; channel: string; enabled: boolean }[]
        }>
        set: (triggerId: string) => Promise<unknown>
        test: (text?: string) => Promise<{ ok: boolean; error?: string }>
      }
    }
  }
}
