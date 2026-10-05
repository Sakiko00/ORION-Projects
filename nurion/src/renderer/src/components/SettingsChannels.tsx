import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { LiquidToggle } from './LiquidToggle'
import { Icon } from './Icon'

/**
 * 渠道 —— 微信 / 企业微信 / QQ / Napcat / 钉钉 / 飞书（设置页的「渠道」卡）。
 *
 * ⚠️ **不实现任何协议。** nanobot 自带这些渠道、扫码登录、消息投递和通知路由，
 *    这张卡只是个遥控器：起停它的 gateway、读状态、发起扫码、填几张凭据。
 *
 * **只露国内平台。** 引擎那边还有 Discord / Signal / Mattermost / MS Teams /
 * WhatsApp / Email 这些，我们的用户用不上 —— 列出来只是噪声。
 * 但**已经开着的**照样列出来：能用的东西不能因为它不在白名单里就看不见。
 *
 * ## 六家怎么配（2026-10-04 查过引擎源码，不是猜的）
 *
 * | 渠道 | 怎么弄 |
 * | --- | --- |
 * | 微信 weixin | **扫码**。扫完引擎把 token 写进配置 |
 * | 飞书 feishu | **扫码**（`qr_register` 会自动创建一个机器人应用，把 appId / appSecret / domain 写进配置并置 enabled）。已经建过应用的也能手填 |
 * | 企业微信 wecom | 填 `botId` + `secret` |
 * | QQ qq | 填 `appId` + `secret` |
 * | Napcat | 填 `wsUrl` |
 * | 钉钉 dingtalk | 填 `clientId` + `clientSecret` |
 *
 * ⚠️ **「能不能扫码」不能靠猜**，`扫码登录` 按下去要是没反应就是骗人。
 *    权威判断在引擎里：`getattr(cls, 'login', None) is not BaseChannel.login`
 *    （onboard 流程用的就是它）。实测只有 weixin / feishu / whatsapp 重写了 login。
 *    我第一版把 wecom / qq / napcat 也当成能扫码 —— 三个都是错的。
 */

/** 国内平台 + 显示顺序（微信在前 —— 不跟着引擎的字母序走）。不在表里的默认不露出来。 */
const ORDER = ['weixin', 'feishu', 'wecom', 'qq', 'napcat', 'dingtalk'] as const
const DOMESTIC = new Set<string>(ORDER)
/** 引擎自己的内部通道（摆渡用），默认就是开的，也没什么可配的 —— 不列。 */
const INTERNAL = new Set(['websocket'])

/** 行上直接给「扫码登录」的：扫码就是它唯一的配置方式。 */
const SCAN_ROW = new Set(['weixin'])

/**
 * 要走表单的渠道：**只列引擎声明为 required 的那几项**。
 * 其余十几个键（streaming / allowFrom / groupPolicy…）全用引擎默认值 ——
 * 摆到界面上就是把选择题丢给用户。用户原话：「要简单化，不要复杂化」。
 */
const FIELDS: Record<string, { key: string; label: string }[]> = {
  feishu: [
    { key: 'appId', label: 'App ID' },
    { key: 'appSecret', label: 'App Secret' }
  ],
  wecom: [
    { key: 'botId', label: 'Bot ID' },
    { key: 'secret', label: 'Secret' }
  ],
  qq: [
    { key: 'appId', label: 'App ID' },
    { key: 'secret', label: 'Secret' }
  ],
  napcat: [{ key: 'wsUrl', label: 'WS URL' }],
  dingtalk: [
    { key: 'clientId', label: 'Client ID' },
    { key: 'clientSecret', label: 'Client Secret' }
  ]
}

/** 「去哪拿这些值」—— 从引擎各渠道 manifest 的 `official_url` 抄的，不是编的。 */
const CONSOLE_URL: Record<string, string> = {
  feishu: 'https://open.feishu.cn/app',
  wecom: 'https://developer.work.weixin.qq.com/',
  qq: 'https://q.qq.com/',
  napcat: 'https://napneko.github.io/',
  dingtalk: 'https://open.dingtalk.com/'
}

/** 排序权重：白名单里的按 ORDER 排，其余（罕见但已经开着的）沉到最后。 */
function rank(id: string): number {
  const i = (ORDER as readonly string[]).indexOf(id)
  return i < 0 ? ORDER.length : i
}

type Row = { id: string; name: string; enabled: boolean }

interface State {
  gateway: boolean
  pid: number | null
  port: number
  channels: Row[]
  error?: string
}

export function SettingsChannels(): JSX.Element {
  const t = useT()
  /* 名字走**显示层映射**：引擎那边一律是英文显示名（WeChat / Napcat (QQ)），
     中文界面下看着别扭。映射不到就拿引擎的原名 —— 新渠道加进来也不会变成一个空字。 */
  const label = (c: Row): string => {
    const k = `ch.c.${c.id}`
    const s = t(k)
    return s === k ? c.name : s
  }

  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  /** 正在扫码的那个渠道：二维码是块字符，一行一行攒起来给浮层里的 `<pre>` 画。
   *  `status` 是必需的 —— **进程结束不等于扫码成功**（见下面 onLogin 那段注释）。 */
  const [login, setLogin] = useState<{
    id: string
    name: string
    qr: string[]
    log: string[]
    status: 'waiting' | 'scanning' | 'noop' | 'failed'
  } | null>(null)
  /** 正在填凭据的那个渠道（钉钉 / 企业微信 / QQ / Napcat，飞书也能走这条路） */
  const [form, setForm] = useState<{
    id: string
    name: string
    values: Record<string, string>
    err: string
    busy: boolean
  } | null>(null)
  /** 配对面板开着没（内容在 `pair` 里） */
  const [pairOpen, setPairOpen] = useState(false)

  const [pairBusy, setPairBusy] = useState('')

  /* 配对面板：谁在等、谁已经能说话。
     ⚠️ **只在打开时读** —— 引擎没给配对用的 CLI，读一次就要起一个 Python（一两秒）。
        挂在 `refresh()` 里的话，每个动作（扫一下开关、存个表单）都要多等两秒。 */
  const [pair, setPair] = useState<{
    pending: { code: string; channel: string; sender: string; left: number }[]
    approved: Record<string, string[]>
    error?: string
  } | null>(null)

  const loadPair = async (): Promise<void> => {
    setPairBusy('load')
    try {
      setPair(await window.workbench.channels.pairingState())
    } catch (e) {
      setPair({ pending: [], approved: {}, error: String((e as Error)?.message || e) })
    } finally {
      setPairBusy('')
    }
  }

  const openPair = (): void => {
    setPairOpen(true)
    void loadPair()
  }

  const pairDo = async (
    action: 'approve' | 'deny' | 'revoke',
    channel: string,
    arg: string
  ): Promise<void> => {
    setPairBusy(arg)
    try {
      const r = await window.workbench.channels.pairingAct(action, channel, arg)
      if (!r.ok) setErr(r.error || '')
      await loadPair()
    } catch (e) {
      setErr(String((e as Error)?.message || e))
    } finally {
      setPairBusy('')
    }
  }

  /** 渠道 id → 给人看的名字（同 `label`，但按 id 查） */
  const chanName = (cid: string): string => {
    const row = (state?.channels ?? []).find((c) => c.id === cid)
    return row ? label(row) : cid
  }

  const refresh = async (): Promise<void> => {
    try {
      setState((await window.workbench.channels.state()) as State)
      setErr('')
    } catch (e) {
      setErr(String((e as Error)?.message || e))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  /** 当前这一次扫码的会话（哪个渠道 + 收到过几行码）。
   *  ⚠️ 用 ref 不用 state：`done` 的副作用（「扫成功就顺手把渠道打开」）必须在
   *  setState 的更新函数**外面**做 —— React 会重复调用更新函数（StrictMode 下尤其），
   *  写在里面就会发两次请求。也顺便当取消标记：清空后上一轮的迟到消息会被忽略。 */
  const session = useRef({ id: '', qr: 0 })

  /* 扫码输出是流式推回来的。

     ⚠️ **`done` 不等于「扫完了」。** 实测：
        - 账号**已经登过**时，`channels login weixin` 一看盘上有凭据就**直接返回成功，
          一帧二维码都不生成**，3 秒后 exit 0；
        - 出错了它会静默 exit 1。
     两者的旧写法都是 `setLogin(null)` —— 表现就是用户说的
     「还没扫、二维码都没渲染出来，它自己就关了」。
     所以这里按**「exit 0 + 到底有没有收到过码」**分三路：
        收到过码 + exit 0 → 真扫完了 → 收起 + **把渠道打开**
        exit 0 但一帧都没收到 → 它说不用扫（已登录）→ **留着浮层说明白**
        别的退出码 → 失败 → **留着浮层，把原话摆出来** + 重试 */
  useEffect(() => {
    const id = window.workbench.channels.onLogin((m) => {
      if (m.kind === 'done') {
        const { id: channel, qr } = session.current
        const code = m.code ?? -1
        session.current = { id: '', qr: 0 }
        setLogin((p) => {
          if (!p) return p
          if (code !== 0) return { ...p, status: 'failed' }
          return qr > 0 ? null : { ...p, status: 'noop' }
        })
        if (!channel) return // 已经被取消过（或上一轮的迟到消息）
        if (code === 0 && qr > 0) {
          /* 扫成功 = 要接上。**引擎只会写凭据，不会把 enabled 打开**
             （`_commit_account` 只写 token/base_url）；官方的 webui 扫完是直接开开关的。
             不补这一步，用户扫完回到列表上看到的还是一个「关着的」微信 —— 很容易以为是没登上。 */
          void act(channel, () => window.workbench.channels.setEnabled(channel, true))
        } else {
          void refresh()
        }
        return
      }
      if (m.kind === 'qr') session.current.qr += 1
      setLogin((p) => {
        if (!p) return p
        return m.kind === 'qr'
          ? { ...p, status: 'scanning', qr: [...p.qr, m.text] }
          : { ...p, log: [...p.log, m.text] }
      })
    })
    return () => window.workbench.channels.offLogin(id)
  }, [])

  /* ⚠️ 参数故意叫 key 不叫 label —— 上面刚有个 label() 函数，
     同名的话在这里就把外面那个遮住了（这个项目已经栽过一次：tasks.map((t) => …)）。
     忙的时候所有按钮一起禁用：同一份配置不能并发打两条命令。 */
  const act = async (key: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusy(key)
    try {
      await fn()
      await refresh()
    } catch (e) {
      setErr(String((e as Error)?.message || e))
    } finally {
      setBusy('')
    }
  }

  /* 关掉扫码：停掉子进程 + 收起浮层。用 useCallback 是为了让它能进下面 Esc 那个
     effect 的依赖数组 —— 不然每次渲染都是一个新函数，监听器要拆了重挂。 */
  const cancelLogin = useCallback((): void => {
    window.workbench.channels.loginStop()
    /* 清掉会话标记 —— 被杀掉的子进程还会回调一次 `done`，
       不清的话那条迟到的消息会被当成「扫完了」而把渠道打开。 */
    session.current = { id: '', qr: 0 }
    setLogin(null)
  }, [])

  /* Esc 关掉浮层。它是浮层，键盘得能退出去 —— 扫码 / 填表 / 配对三个都要管。 */
  useEffect(() => {
    if (!login && !form && !pairOpen) return undefined
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (login) cancelLogin()
      else if (form) setForm(null)
      else setPairOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [login, form, pairOpen, cancelLogin])

  /* 已经开着的（哪怕不在国内白名单里）照样列出来 —— 不能有「看不见但跑着」的渠道 */
  const shown = (state?.channels ?? [])
    .filter((c) => !INTERNAL.has(c.id) && (DOMESTIC.has(c.id) || c.enabled))
    .sort((a, b) => rank(a.id) - rank(b.id))

  const startLogin = async (id: string, force = false): Promise<void> => {
    const row = shown.find((c) => c.id === id)
    session.current = { id, qr: 0 }
    setLogin({ id, name: row ? label(row) : id, qr: [], log: [], status: 'waiting' })
    try {
      const r = (await window.workbench.channels.loginStart(id, force)) as {
        ok: boolean
        error?: string
      }
      if (!r.ok) {
        session.current = { id: '', qr: 0 }
        setLogin(null)
        setErr(r.error || '')
      }
    } catch (e) {
      /* 抛错也得把浮层收掉，不然它就一直挂在那儿等一个永远不来的二维码 */
      session.current = { id: '', qr: 0 }
      setLogin(null)
      setErr(String((e as Error)?.message || e))
    }
  }

  /* 开表单：**先把空壳开出来**再回填 —— 读配置是趟 IPC，先开壳点下去就有反应。 */
  const openForm = async (id: string): Promise<void> => {
    const fs = FIELDS[id] ?? []
    const empty: Record<string, string> = {}
    for (const f of fs) empty[f.key] = ''
    const row = shown.find((c) => c.id === id)
    setForm({ id, name: row ? label(row) : id, values: empty, err: '', busy: true })
    try {
      const r = (await window.workbench.channels.getConfig(id)) as {
        ok: boolean
        config: Record<string, unknown>
        error?: string
      }
      const values = { ...empty }
      for (const f of fs) values[f.key] = String(r.config?.[f.key] ?? '')
      setForm((p) =>
        p?.id === id ? { ...p, values, err: r.ok ? '' : r.error || '', busy: false } : p
      )
    } catch (e) {
      setForm((p) =>
        p?.id === id ? { ...p, err: String((e as Error)?.message || e), busy: false } : p
      )
    }
  }

  const setValue = (key: string, v: string): void =>
    setForm((p) => (p ? { ...p, values: { ...p.values, [key]: v } } : p))

  const saveForm = async (): Promise<void> => {
    if (!form) return
    const fs = FIELDS[form.id] ?? []
    const patch: Record<string, unknown> = {}
    for (const f of fs) {
      const v = (form.values[f.key] ?? '').trim()
      if (!v) {
        setForm({ ...form, err: t('ch.cfg.need') })
        return
      }
      patch[f.key] = v
    }
    /* 填完凭据顺手开起来。按钮上写的是「保存并开启」，所以这不是惊喜，是明说。 */
    patch.enabled = true
    setForm({ ...form, busy: true, err: '' })
    try {
      const r = (await window.workbench.channels.setConfig(form.id, patch)) as {
        ok: boolean
        error?: string
      }
      if (!r.ok) {
        setForm({ ...form, busy: false, err: r.error || '' })
        return
      }
    } catch (e) {
      setForm({ ...form, busy: false, err: String((e as Error)?.message || e) })
      return
    }
    setForm(null)
    await refresh()
  }

  return (
    <section className="card set-ch">
      <div className="card-head">
        <h3>{t('ch.title')}</h3>
        {/* 右边一组：配对入口 + 网关状态。
            ⚠️ 必须包一层 —— `.card-head` 是 `space-between`，三个孩子会把中间那个
               摆到正中间（一个悬在标题和状态之间的按钮）。 */}
        <div className="set-ch-head-right">
          {/* 谁能说话 —— 引擎对陌生私聊默认只回一个配对码、**不回答**，
              那条路不摆出来的话「发消息没人理」就是个查不出原因的谜。 */}
          <button className="set-mini" onClick={openPair}>
            {t('pair.title')}
          </button>
          {/* 网关：**一行读完** —— 灯 + 它现在什么状态 + 三个动作。
              以前这里是「灯 + 状态」，而「启动 / 重启 / 刷新」在下面的字段行里
              （还带一个孤零零的胶囊）—— 同一个东西拆成两处，看着灯想按按钮还得往下找。 */}
          {state && (
            <span className={`set-ch-gw${state.gateway ? ' on' : ''}`}>
              <i className="set-dot" />
              {busy
                ? t('ch.working')
                : state.gateway
                  ? t('ch.gw.up', { pid: String(state.pid ?? '?'), port: String(state.port) })
                  : t('ch.gw.down')}
            </span>
          )}
          <span className="set-sep" />
          <button
            className="set-mini"
            disabled={!!busy}
            onClick={() =>
              void act('gw', () => window.workbench.channels.gateway(state?.gateway ? 'stop' : 'start'))
            }
          >
            {state?.gateway ? t('ch.gw.stop') : t('ch.gw.start')}
          </button>
          <button
            className="set-mini"
            disabled={!!busy || !state?.gateway}
            title={!state?.gateway ? t('ch.gw.down') : undefined}
            onClick={() => void act('gw', () => window.workbench.channels.gateway('restart'))}
          >
            {t('ch.gw.restart')}
          </button>
          <button className="set-mini" disabled={!!busy} onClick={() => void refresh()}>
            {t('ch.refresh')}
          </button>
        </div>
      </div>

      <p className="set-note">{t('ch.note')}</p>

      <div className="set-fields">

        {err && <p className="set-hint">{err}</p>}
        {state?.error && <p className="set-hint">{state.error}</p>}

        {/* 渠道排成两列。每个都是**名字 + 开关 + 动作** ——
            动作要么「扫码登录」（微信 / 飞书），要么「配置」（填凭据那几个）。 */}
        <div className="set-ch-grid">
          {shown.map((c) => (
            <div className="set-ch-item" key={c.id}>
              <span className="set-ch-name" title={c.name}>
                {label(c)}
              </span>
              <LiquidToggle
                on={c.enabled}
                disabled={!!busy}
                label={label(c)}
                onChange={(v) =>
                  void act(c.id, () => window.workbench.channels.setEnabled(c.id, v))
                }
              />
              {SCAN_ROW.has(c.id) ? (
                <button className="set-mini" onClick={() => void startLogin(c.id)}>
                  {t('ch.login')}
                </button>
              ) : FIELDS[c.id] ? (
                <button className="set-mini" onClick={() => void openForm(c.id)}>
                  {t('ch.cfg')}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* 扫码 —— **浮层小窗口，不进卡片流**。
          二维码有 ~300px 高，塞进卡里会把卡片整个撑长，下面「通用 / 高级」跟着跳；
          而且扫码时你的注意力本来就不在设置页上，占着一张卡没意义。
          `position: fixed` 是**脱离文档流**的 —— 它开着的时候卡片尺寸一动不动。

          ⚠️ 这里**不做图片二维码**：那要么引一个二维码库（项目零依赖），
             要么去说它的 WebSocket 协议拿 qr_url。CLI 用块字符打的字符画，
             等宽字体原样画出来手机照样能扫，换来的是零依赖 + 走官方通道。 */}
      {login && (
        <div className="set-ch-pop" role="dialog" aria-modal="true" aria-label={login.name}>
          <div className="set-ch-pop-scrim" onClick={cancelLogin} />

          <div className="set-ch-pop-box">
            <div className="set-ch-pop-head">
              {/* 标题得跟着状态走：已经登过 / 没出码的时候一个二维码都没有，
                  还写「扫这个二维码」就是让用户去找一个不存在的东西。 */}
              <b>
                {login.status === 'noop'
                  ? t('ch.qr.done.title', { name: login.name })
                  : login.status === 'failed'
                    ? t('ch.qr.failed.title', { name: login.name })
                    : t('ch.scan', { name: login.name })}
              </b>
              {/* 已经登过 / 出错了，都给一个「再来一次」。
                  ⚠️ 只有**用户自己点**才会走 `--force`：飞书那一路 force 会清掉凭据
                     并**重新建一个机器人应用**，不能替用户决定。 */}
              {login.status === 'noop' && (
                <button className="set-mini" onClick={() => void startLogin(login.id, true)}>
                  {t('ch.qr.again')}
                </button>
              )}
              {login.status === 'failed' && (
                <button className="set-mini" onClick={() => void startLogin(login.id, true)}>
                  {t('ch.qr.retry')}
                </button>
              )}
              <button className="set-mini" onClick={cancelLogin}>
                {t('ch.cancel')}
              </button>
            </div>

            {login.status === 'noop' ? (
              <p className="set-note">{t('ch.qr.done')}</p>
            ) : login.qr.length > 0 ? (
              <pre className="set-ch-qr-art">{login.qr.join('\n')}</pre>
            ) : (
              <p className="set-hint">
                {login.status === 'failed' ? t('ch.qr.failed') : t('ch.qr.wait')}
              </p>
            )}

            {/* 出错时把子进程的原话**整段**摆出来 —— 「到底为什么」就在这几行里，
                而不是一句我们替它编的「登录失败」。所以下面那句进展就不重复了。 */}
            {login.status === 'failed' && login.log.length > 0 && (
              <pre className="set-ch-pop-log">{login.log.slice(-8).join('\n')}</pre>
            )}

            {/* 脚下那句进展只在「真的在等扫」的时候给。
                已登过 / 出错的时候没东西在等，再说「扫完它会自己关掉」是自相矛盾。 */}
            {(login.status === 'waiting' || login.status === 'scanning') && (
              <p className="set-hint set-ch-pop-foot">
                {login.log.length > 0 ? (
                  <>
                    <Icon name="activity" size={12} /> {login.log[login.log.length - 1]}
                  </>
                ) : (
                  t('ch.qr.hint')
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 填凭据 —— 同一个浮层壳子，里面是几个输入框。
          为什么也做成浮层：它开着的时候不应该动卡片布局，而且这几行输入框
          在 254px 宽的一格里根本摆不下（标签 + 输入框会挤成两行）。 */}
      {form && FIELDS[form.id] && (
        <div className="set-ch-pop" role="dialog" aria-modal="true" aria-label={form.name}>
          <div className="set-ch-pop-scrim" onClick={() => setForm(null)} />

          <div className="set-ch-pop-box set-ch-pop-wide">
            <div className="set-ch-pop-head">
              <b>{t('ch.cfg.title', { name: form.name })}</b>
              <button className="set-mini" onClick={() => setForm(null)}>
                {t('ch.cancel')}
              </button>
            </div>

            {/* 飞书多一条路：扫一下让引擎自己建应用、自己把凭据写进配置。
                已经建过应用的人用下面的输入框。 */}
            {form.id === 'feishu' && (
              <div className="set-ch-cfg-alt">
                <button className="set-mini" onClick={() => void startLogin('feishu')}>
                  {t('ch.cfg.scan')}
                </button>
                <span className="set-hint">{t('ch.cfg.scan.hint')}</span>
              </div>
            )}

            <div className="set-ch-form">
              {FIELDS[form.id].map((f) => (
                <label key={f.key}>
                  <span>{f.label}</span>
                  <input
                    value={form.values[f.key] ?? ''}
                    onChange={(e) => setValue(f.key, e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                  />
                </label>
              ))}
            </div>

            {form.err && <p className="set-hint">{form.err}</p>}

            <div className="set-ch-cfg-acts">
              {CONSOLE_URL[form.id] && (
                <button
                  className="set-mini"
                  onClick={() => void window.workbench.app.openUrl(CONSOLE_URL[form.id])}
                >
                  {t('ch.cfg.where')}
                </button>
              )}
              <button className="set-mini" disabled={form.busy} onClick={() => void saveForm()}>
                {t('ch.cfg.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 谁能说话 —— 引擎对**陌生私聊**默认不回答，只回一个配对码
          （`BaseChannel.is_allowed()` 不过就直接 return，消息根本到不了助手）。
          那个码本来得拿去 WebUI 或「另一个已经配好的会话」里批，第一次接的人两样都没有。
          这里把它摆出来，就成了点一下的事。 */}
      {pairOpen && (
        <div className="set-ch-pop" role="dialog" aria-modal="true" aria-label={t('pair.title')}>
          <div className="set-ch-pop-scrim" onClick={() => setPairOpen(false)} />

          <div className="set-ch-pop-box set-ch-pop-wide set-pair-pop">
            <div className="set-ch-pop-head">
              <b>{t('pair.title')}</b>
              <button className="set-mini" disabled={!!pairBusy} onClick={() => void loadPair()}>
                {t('adv.refresh')}
              </button>
              <button className="set-mini" onClick={() => setPairOpen(false)}>
                {t('ch.cancel')}
              </button>
            </div>

            {!pair ? (
              <p className="set-hint">{t('pair.loading')}</p>
            ) : (
              <>
                {pair.pending.length > 0 && (
                  <div className="set-pair-group">
                    <span className="set-block-title">{t('pair.pending')}</span>
                    {pair.pending.map((p) => (
                      <div className="set-pair" key={p.code}>
                        <div className="set-pair-info">
                          {/* 码放最显眼 —— 对方在聊天里看到的就是它，好对上号 */}
                          <b>{p.code}</b>
                          <span>
                            {chanName(p.channel)} ·{' '}
                            {t('pair.left', { n: Math.max(1, Math.round(p.left / 60)) })}
                          </span>
                        </div>
                        <span className="set-pair-id" title={p.sender}>
                          {p.sender}
                        </span>
                        <span className="set-pair-acts">
                          <button
                            className="set-mini"
                            disabled={!!pairBusy}
                            onClick={() => void pairDo('approve', p.channel, p.code)}
                          >
                            {t('pair.allow')}
                          </button>
                          <button
                            className="set-mini"
                            disabled={!!pairBusy}
                            onClick={() => void pairDo('deny', p.channel, p.code)}
                          >
                            {t('pair.deny')}
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="set-pair-group">
                  <span className="set-block-title">{t('pair.allowed')}</span>
                  {Object.entries(pair.approved).flatMap(([cid, list]) =>
                    list.map((sender) => (
                      <div className="set-pair" key={`${cid}:${sender}`}>
                        <div className="set-pair-info">
                          <b className="set-pair-who">{sender}</b>
                          <span>{chanName(cid)}</span>
                        </div>
                        <span className="set-pair-acts">
                          <button
                            className="set-mini"
                            disabled={!!pairBusy}
                            onClick={() => void pairDo('revoke', cid, sender)}
                          >
                            {t('pair.remove')}
                          </button>
                        </span>
                      </div>
                    ))
                  )}
                  {Object.values(pair.approved).every((l) => l.length === 0) && (
                    <p className="set-hint">{t('pair.noone')}</p>
                  )}
                </div>

                <p className="set-note">{t('pair.note')}</p>
                {pair.error && <p className="set-hint">{pair.error}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
