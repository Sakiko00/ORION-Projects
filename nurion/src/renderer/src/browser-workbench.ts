/**
 * 纯浏览器预览用的 workbench 替身。
 *
 * 浏览器标签页没有 preload 桥，`window.workbench` 是 undefined → 界面数据全空。
 * 这里注入一个用 fetch 实现的替身，数据走 `/api/vault`（dev server 中间件读的是
 * **同一份 vault**，所以是真数据）。只在没有 preload 时生效，Electron 里不碰。
 *
 * 只实现「看得见」的部分：读数据、查状态。写操作（建任务/跑任务/保存）一律
 * 返回空结果 —— 浏览器里只是预览，不真的改库。
 */

const getJSON = <T>(u: string): Promise<T> =>
  fetch(u).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(String(r.status)))))

/* 预览桩也认 AI 开关：关掉之后**不再去戳**引擎。
   ⚠️ 不认的话，Vite 代理会一直打 ECONNREFUSED —— 那条日志看起来像应用在报错，
   其实只是预览页在探一个压根没起的引擎。真机上没有这个探活（渲染层不碰 /v1/models，
   查过）。 */
let harnessAi = true

const engineAlive = (): Promise<boolean> =>
  harnessAi
    ? fetch('/api/engine/v1/models', { signal: AbortSignal.timeout(1500) })
        .then((r) => r.ok)
        .catch(() => false)
    : Promise.resolve(false)

/** agent 工具的浏览器实现：能读的读真数据，不能读的返回空 */
async function agentCall(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  switch (name) {
    case 'list_tasks':
      return getJSON('/api/vault/tasks.json')
    case 'list_runs':
      return getJSON('/api/vault/runs.json')
    case 'list_agents':
      return getJSON('/api/vault/agents.json')
    case 'list_notes':
      return getJSON('/api/vault/kb')
    case 'read_note': {
      const cat = String(args.category ?? '')
        .trim()
        .replace(/^\/+|\/+$/g, '')
      const p = cat
        ? `kb/${encodeURIComponent(cat)}/${encodeURIComponent(String(args.name ?? ''))}.md`
        : `kb/${encodeURIComponent(String(args.name ?? ''))}.md`
      return fetch(`/api/vault/${p}`)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error('404'))))
        .then((text) => ({ name: String(args.name), text }))
    }
    case 'list_categories':
      return getJSON<string[]>('/api/vault/categories')
    case 'search_notes': {
      const words = String(args.query ?? '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
      if (!words.length) return []
      const list = await getJSON<{ name: string; category?: string }[]>('/api/vault/kb')
      const out: { name: string; category?: string; hits: number; snippet: string }[] = []
      for (const meta of list) {
        const cat = meta.category || ''
        const p = cat
          ? `kb/${encodeURIComponent(cat)}/${encodeURIComponent(meta.name)}.md`
          : `kb/${encodeURIComponent(meta.name)}.md`
        const text = await fetch(`/api/vault/${p}`)
          .then((r) => (r.ok ? r.text() : ''))
          .catch(() => '')
        const lower = text.toLowerCase()
        let count = 0
        let first = -1
        for (const w of words) {
          let idx = lower.indexOf(w)
          while (idx !== -1) {
            count++
            if (first === -1) first = idx
            idx = lower.indexOf(w, idx + w.length)
          }
        }
        if (!count) continue
        const start = Math.max(0, first - 30)
        out.push({
          name: meta.name,
          category: meta.category,
          hits: count,
          snippet: text.slice(start, first + 70).replace(/\s+/g, ' ').trim()
        })
      }
      return out.sort((a, b) => b.hits - a.hits).slice(0, typeof args.n === 'number' ? args.n : 5)
    }
    case 'write_note':
    case 'delete_note':
    case 'create_category':
    case 'rename_category':
    case 'delete_category':
      // 浏览器预览也能改真实 vault —— 走中间件的写接口（和读同一份库）
      return fetch('/api/vault/op', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: name, ...args })
      }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    case 'list_scripts':
      return getJSON('/api/vault/scripts')
    case 'list_artifacts':
      return getJSON('/api/vault/output')
    default:
      return []
  }
}

export function installBrowserWorkbench(): void {
  if (window.workbench) return // Electron 里有真桥，别覆盖

  /* 扫码的假流：订阅者 + 广播。真桥是主进程 `send` 过来的，这里自己转一圈。
     ⚠️ 「已经登过」那条路**必须能走到**：真机上它的表现是
        「一帧码都不发、3 秒后 exit 0」—— 我们就是在这儿栽的（浮层在用户看到东西之前自己关了）。
        桩里用 `scanned` 记住谁扫过：第二次进来就复现那条路，两个分支都看得见。 */
  const loginSubs = new Map<number, (m: { kind: string; text: string; code?: number }) => void>()
  let loginSeq = 0
  const loginPush = (kind: string, text: string, code?: number): void => {
    loginSubs.forEach((cb) => cb({ kind, text, code }))
  }
  const scanned = new Set<string>()

  /* 配对名单：一条在等批准、一条已经允许。
     批准 / 拒绝 / 移除都**真的作用在这两份上** —— 桩里不动的话，面板点完像坏的。 */
  const pendingPairs: { code: string; channel: string; sender: string; left: number }[] = [
    {
      code: 'X241-DJY8',
      channel: 'weixin',
      sender: 'o9cq809Hec3Jr9XXJJbfdMPyUBks@im.wechat',
      left: 480
    }
  ]
  const allowedSenders: string[] = ['group-owner@im.feishu']

  /* 渠道开关：桩里也必须**记住** —— 真机上 `setEnabled` 会写进配置、影响下一次
     `channels status`。不记的话「扫成功 → 自动把渠道打开」在预览里看着像没生效
     （开关明明应该翻过去，却还是关的）。 */
  const chEnabled = new Map<string, boolean>()
  const CH_ROWS: { id: string; name: string; enabled: boolean }[] = [
    { id: 'dingtalk', name: 'DingTalk', enabled: false },
    { id: 'discord', name: 'Discord', enabled: false },
    { id: 'email', name: 'Email', enabled: false },
    { id: 'feishu', name: 'Feishu', enabled: false },
    { id: 'mattermost', name: 'Mattermost', enabled: false },
    { id: 'mochat', name: 'Mochat', enabled: false },
    { id: 'msteams', name: 'Microsoft Teams', enabled: false },
    { id: 'napcat', name: 'Napcat (QQ)', enabled: false },
    { id: 'qq', name: 'QQ', enabled: false },
    { id: 'signal', name: 'Signal', enabled: false },
    { id: 'websocket', name: 'WebSocket', enabled: true },
    { id: 'wecom', name: 'WeCom', enabled: false },
    { id: 'weixin', name: 'WeChat', enabled: false },
    { id: 'whatsapp', name: 'WhatsApp', enabled: false }
  ]

  const workbench = {
    appVersion: 'browser-preview',
    platform: 'browser',
    windowControls: {
      minimize: (): void => undefined,
      toggleMaximize: (): void => undefined,
      close: (): void => undefined,
      isMaximized: (): Promise<boolean> => Promise.resolve(false),
      onMaximizeChange: (): void => undefined
    },
    app: {
      openFolder: (): Promise<{ ok: boolean; path?: string; error?: string }> =>
        Promise.resolve({ ok: false, error: '浏览器预览里打不开本地目录' }),
      getAutoStart: (): Promise<boolean> => Promise.resolve(false),
      setAutoStart: (): Promise<boolean> => Promise.resolve(false),
      openUrl: (u: string): Promise<{ ok: boolean }> => {
        window.open(u, '_blank', 'noopener')
        return Promise.resolve({ ok: true })
      },
      paths: async (): Promise<{
        vault: string
        runtime: string
        userData: string
        engine: string
        derived: string
      }> => {
        const r = await getJSON<{ path: string }>('/api/vault/root').catch(() => null)
        const v = r?.path || ''
        const up = v.replace(/[\\/]vault$/, '')
        return {
          vault: v,
          runtime: v ? `${v}\\runtime` : '',
          userData: up,
          engine: '%USERPROFILE%\\.nanobot',
          derived: up ? `${up}\\nanobot.json` : ''
        }
      },
      /* 浏览器里退不了 —— 什么都不做，别装成退了 */
      quit: (): void => undefined,
      /* 主题同步：预览里记下来就好，能和渲染层的样式对账 */
      setTheme: (theme: string): Promise<unknown> => {
        ;(window as unknown as { __themeSent?: string }).__themeSent = theme
        return Promise.resolve({ theme })
      }
    },
    agent: {
      list: (): Promise<unknown[]> => Promise.resolve([]),
      call: agentCall
    },
    engine: {
      status: (): Promise<unknown> =>
        engineAlive().then((alive) => ({
          state: alive ? 'running' : 'stopped',
          installed: true,
          version: '0.3.5',
          python: 'python.exe',
          pyVersion: '3.13.13',
          since: Date.now() - 47 * 60_000,
          apiPort: 8900
        })),
      start: (): Promise<unknown> => Promise.resolve({}),
      stop: (): Promise<unknown> => Promise.resolve({}),
      restart: (): Promise<unknown> => Promise.resolve({}),
      install: (): Promise<unknown> => Promise.resolve({}),
      settings: async (): Promise<unknown> => {
        const r = await getJSON<{ path: string }>('/api/vault/root').catch(() => null)
        return { baseURL: '', apiKey: '', model: '', workspace: r?.path || '' }
      },
      saveSettings: (): Promise<unknown> => Promise.resolve({}),
      logs: (): Promise<string> => Promise.resolve(''),
      bootstrap: (): Promise<unknown> => Promise.resolve({})
    },
    ui: {
      onUiCall: (): void => undefined,
      uiResult: (): void => undefined
    },
    run: {
      start: (): Promise<{ runId: string }> => Promise.resolve({ runId: '' }),
      stop: (): Promise<{ stopped: boolean }> => Promise.resolve({ stopped: false }),
      running: (): Promise<unknown> => Promise.resolve(null),
      log: (): Promise<string[]> => Promise.resolve([]),
      onEvent: (): number => 0,
      offEvent: (): void => undefined
    },
    assistant: {
      send: (): Promise<{ turnId: string }> => Promise.resolve({ turnId: '' }),
      stop: (): Promise<{ stopped: boolean }> => Promise.resolve({ stopped: false }),
      busy: (): Promise<unknown> => Promise.resolve(null),
      alive: engineAlive,
      onEvent: (): number => 0,
      offEvent: (): void => undefined
    },
    alerts: {
      list: (n?: number): Promise<unknown[]> =>
        getJSON<unknown[]>('/api/vault/alerts.json').then((all) =>
          n ? all.slice(-n).reverse() : all
        ),
      ack: (): Promise<unknown> => Promise.resolve({}),
      intake: (): Promise<string> => Promise.resolve('http://127.0.0.1:8971/alert'),
      onEvent: (): number => 0,
      offEvent: (): void => undefined
    },
    chat: {
      load: (): Promise<unknown[]> => getJSON<unknown[]>('/api/vault/chat.json').catch(() => []),
      save: (): Promise<void> => Promise.resolve(),
      /* 浏览器预览层没有主进程，也没有引擎会话 —— 只能假装成功（别报错就行） */
      fresh: (): Promise<{ archived: string | null; wiped: number }> =>
        Promise.resolve({ archived: null, wiped: 0 })
    },
    artifacts: {
      list: (): Promise<unknown[]> => getJSON<unknown[]>('/api/vault/output'),
      read: (): Promise<unknown> => Promise.resolve({}),
      open: (): Promise<{ ok: boolean; error?: string }> => Promise.resolve({ ok: false }),
      reveal: (): Promise<void> => Promise.resolve()
    },
    build: {
      get: (): Promise<unknown> => getJSON('/api/vault/build.json').catch(() => null),
      start: (): Promise<unknown> => Promise.resolve({}),
      pass: (): Promise<unknown> => Promise.resolve({}),
      reject: (): Promise<unknown> => Promise.resolve({}),
      reset: (): Promise<unknown> => Promise.resolve({ ok: true })
    },
    agentWindow: {
      open: (): void => undefined,
      close: (): void => undefined,
      openAndSend: (): void => undefined,
      onIncoming: (): void => undefined
    },
    pet: {
      query: (): Promise<unknown> =>
        Promise.resolve({
          alive: false,
          busy: false,
          running: false,
          runningTask: null,
          buildWait: false,
          buildStep: null,
          buildTitle: null
        }),
      getConfig: (): Promise<unknown> => getJSON('/api/vault/pet.json').catch(() => ({} as unknown)),
      setConfig: (): Promise<unknown> => Promise.resolve({}),
      cursor: (): Promise<{ x: number; y: number }> => Promise.resolve({ x: 0, y: 0 }),
      move: (): void => undefined,
      layout: (): Promise<{ x: number; y: number }> => Promise.resolve({ x: 0, y: 0 }),
      position: (): Promise<{ x: number; y: number }> => Promise.resolve({ x: 0, y: 0 }),
      open: (): void => undefined,
      onConfig: (): number => 0,
      offConfig: (): void => undefined
    },
    /* 浏览器里没有主进程，更没有 nanobot。渠道列表照真实的 `nanobot channels status`
       抄一份 —— 空列表的话设置页那张卡只剩「网关」一行，排版对不对根本看不出来。 */
    ai: (() => {
      /* 得**真的记事**：写死返回 {enabled:true} 的话，预览里拨开关不会变，
         「关掉之后那一屏长什么样」就永远看不到 —— 而那正是这个开关的重点。 */
      let on = true
      return {
        get: (): Promise<unknown> => Promise.resolve({ enabled: on }),
        set: (v: boolean): Promise<unknown> => {
          on = v
          harnessAi = v
          return Promise.resolve({ enabled: on })
        }
      }
    })(),
    channels: {
      state: (): Promise<unknown> =>
        Promise.resolve({
          gateway: false,
          pid: null,
          port: 8901,
          channels: CH_ROWS.map((r) => ({ ...r, enabled: chEnabled.get(r.id) ?? r.enabled }))
        }),
      gateway: (): Promise<unknown> => Promise.resolve({}),
      setEnabled: (id: string, on: boolean): Promise<unknown> => {
        chEnabled.set(id, on)
        return Promise.resolve({ ok: true })
      },
      /* 表单回填：给一份空壳就行，界面会把它摊到输入框里。
         真写盘不可能的（浏览器里没有 ~/.nanobot/config.json），返回 ok 让流程跑完。 */
      getConfig: (): Promise<unknown> => Promise.resolve({ ok: true, config: {} }),
      setConfig: (): Promise<unknown> => Promise.resolve({ ok: true }),
      /* 真打一条二维码出来（**假的、扫不了**），只为让预览能看到浮层的真实尺寸。
         43×43 模块、上下半块拼 —— 实测 `nanobot channels login weixin` 就是
         43 字符宽 × 22 行，照抄这个尺寸，预览才不会比真机窄一截。
         不发 'done'，所以它会一直开着，要关就点取消 / Esc。 */
      loginStart: (id: string, force?: boolean): Promise<unknown> => {
        /* 已经登过（且没要求强扫）= 真机那条「不用扫」：不发码，exit 0。
           桩里用 `scanned` 记住谁扫过，第二次进来就复现那条路。
           （「出错了」那条分支没有对应的桩：真机上它是静默 exit 1，
             渲染层靠注入一条 `done(code:1)` 就能验，不必伪造一个渠道。） */
        if (!force && scanned.has(id)) {
          setTimeout(() => loginPush('done', '', 0), 700)
          return Promise.resolve({ ok: true })
        }
        const N = 43
        let seed = 20261004
        const rnd = (): number => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
        for (let y = 0; y < N; y += 2) {
          let line = ''
          for (let x = 0; x < N; x++) {
            const top = rnd() > 0.5
            const bottom = rnd() > 0.5
            line += top ? (bottom ? '█' : '▀') : bottom ? '▄' : ' '
          }
          loginPush('qr', line)
        }
        loginPush('log', '等待扫码…')
        scanned.add(id)
        return Promise.resolve({ ok: true })
      },
      loginStop: (): void => undefined,
      onLogin: (cb: (m: { kind: string; text: string }) => void): number => {
        const id = ++loginSeq
        loginSubs.set(id, cb)
        return id
      },
      offLogin: (id: number): void => {
        loginSubs.delete(id)
      },
      pairingState: (): Promise<unknown> =>
        Promise.resolve({ pending: pendingPairs.slice(), approved: { weixin: allowedSenders.slice() } }),
      pairingAct: (action: string, _channel: string, arg: string): Promise<unknown> => {
        if (action === 'revoke') {
          const i = allowedSenders.indexOf(arg)
          if (i >= 0) allowedSenders.splice(i, 1)
          return Promise.resolve({ ok: true })
        }
        const i = pendingPairs.findIndex((p) => p.code === arg)
        if (i < 0) return Promise.resolve({ ok: false })
        const [row] = pendingPairs.splice(i, 1)
        if (action === 'approve' && row) allowedSenders.push(row.sender)
        return Promise.resolve({ ok: true })
      }
    },
    /* 推送：真机上是「读引擎绑过的会话 + 调 nanobot trigger」。
       预览里给一条假的已绑会话（否则那一块永远是空态，看不出布局对不对），
       绑定的选择记在闭包里，切页面不丢。 */
    push: (() => {
      let bound = ''
      const triggers = [
        { id: 'K7M2QP4X', name: '工作台', channel: 'weixin', enabled: true },
        { id: 'BR9NT3HV', name: '研发群', channel: 'feishu', enabled: true }
      ]
      return {
        state: (): Promise<unknown> => Promise.resolve({ triggerId: bound, triggers }),
        set: (id: string): Promise<unknown> => {
          bound = String(id || '')
          return Promise.resolve({ triggerId: bound, triggers })
        },
        test: (): Promise<{ ok: boolean; error?: string }> =>
          Promise.resolve(
            bound ? { ok: true } : { ok: false, error: '还没绑定会话' }
          )
      }
    })()
  }

  window.workbench = workbench as unknown as typeof window.workbench
}
