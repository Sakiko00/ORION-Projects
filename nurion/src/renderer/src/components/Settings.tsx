import { useEffect, useState } from 'react'
import { SettingsModel } from './SettingsModel'
import { SettingsPet } from './SettingsPet'
import { SettingsChannels } from './SettingsChannels'
import { SettingsGeneral } from './SettingsGeneral'
import { SettingsAdvanced } from './SettingsAdvanced'
import { toast } from './Toasts'
import { useT } from '../i18n'
import { EMPTY_SETTINGS, type EngineSettings, type EngineState } from './settings-types'
import type { FontSize, Lang, ThemeMode } from '../ui-prefs'
import type { PetConfig } from '../run-types'

/**
 * 设置页 —— 只放**用户需要配好的东西**。
 *
 * 判据一句话：**不配它，就用不起来吗？**
 *   模型（接口 / Key / 模型名）→ 必须。左上主卡
 *   桌宠（形象 / 眼神）        → 好玩，会想改。右上
 *   通用（主题 / 字号 / 语言 / 自启 / 数据）→ 跟「这台机器上怎么用」有关。横跨
 *   高级（引擎 / 日志 / 目录）  → 自动跑的、排障才看的。最底，折叠
 */
export function Settings({
  ai,
  onAi,
  theme,
  onTheme,
  font,
  onFont,
  lang,
  onLang
}: {
  /** AI 总开关（真值在主进程的 ai.json 里） */
  ai: boolean
  onAi: (on: boolean) => void
  theme: ThemeMode
  onTheme: (v: ThemeMode) => void
  font: FontSize
  onFont: (v: FontSize) => void
  lang: Lang
  onLang: (v: Lang) => void
}) {
  const t = useT()
  const [status, setStatus] = useState<EngineState | null>(null)
  const [settings, setSettings] = useState<EngineSettings>(EMPTY_SETTINGS)
  const [logs, setLogs] = useState('')
  const [busy, setBusy] = useState('')
  const [pet, setPetState] = useState<PetConfig>({
    shape: 'cube',
    eyes: 'slant',
    size: 80,
    enabled: false
  })

  /** 刷新按钮干的事：重读**会自己变的东西** —— 引擎状态 + 日志。
   *
   *  ⚠️ 里面**没有** `engine.settings()`：那是填表单的值。
   *  以前刷新里带着它，于是「刷新日志」等于把你还在输入的接口地址 / Key
   *  按磁盘上的旧值打回去 —— 刷新不该碰用户的编辑。
   *  表单只在进页面时读一次（见下面的 effect）；保存之后再进来看的就是新的。 */
  const refresh = async (): Promise<void> => {
    try {
      setStatus((await window.workbench.engine.status()) as EngineState)
      setLogs(await window.workbench.engine.logs())
    } catch {
      /* 主进程没起来时忽略 */
    }
  }

  useEffect(() => {
    void refresh()
    void (async () => {
      try {
        /* ⚠️ 回填要兜底成空串，别直接塞回来：没配过的字段是 `undefined`，
           受控 input 的 value 从字符串变 undefined 会**中途变成非受控**，
           React 会警告，而且之后输入框就再也刷不动了 */
        const s = (await window.workbench.engine.settings()) as Partial<EngineSettings>
        setSettings({
          baseURL: s.baseURL ?? '',
          apiKey: s.apiKey ?? '',
          model: s.model ?? '',
          workspace: s.workspace ?? ''
        })
      } catch {
        /* 读不到就让表单保持空着 */
      }
    })()
  }, [])

  /* 桌宠形象：读当前配置，改的时候写回主进程（主进程会推给桌宠窗口） */
  useEffect(() => {
    /* ⚠️ 是**合并**不是替换：老配置 / 预览环境可能只给了部分字段，
       直接 set 会让 range 的 value 变 undefined → 受控输入中途变非受控，
       React 报警，而且之后滑块再也刷不动 */
    void window.workbench?.pet
      ?.getConfig()
      .then((c) => setPetState((p) => ({ ...p, ...(c as Partial<PetConfig>) })))
      .catch(() => undefined)
  }, [])

  const setPet = (patch: Partial<PetConfig>): void => {
    setPetState((p) => ({ ...p, ...patch }))
    void window.workbench?.pet?.setConfig(patch as Record<string, unknown>)
  }

  const act = async (fn: () => Promise<unknown>, label: string): Promise<void> => {
    setBusy(label)
    try {
      await fn()
    } catch (e) {
      /* 失败了得**看得见**。以前这里是把消息掉在页面顶部那条状态带里 ——
         那条带子已经删了（和高级卡的引擎块重复），错误改走 toast：
         它本来就是这个用途，说清「刚才那一下成没成」。 */
      toast(String((e as Error)?.message || e), 'bad')
    } finally {
      await refresh()
      setBusy('')
    }
  }

  const set = (k: 'baseURL' | 'apiKey' | 'model', v: string): void =>
    setSettings((s) => ({ ...s, [k]: v }))

  return (
    <div className="pane-page settings">
      {/* ⓪ 这里以前还有一条「引擎运行中 · nanobot x.y」的状态带。
          删了 —— 顶部工具条上的岛已经在说同一句话，高级卡里还有一份带波形、
          带运行时长、带端口的完整版。同一个事实说三遍不是清楚，是吵。 */}

      <SettingsModel
        value={settings}
        onChange={set}
        busy={busy}
        onSave={() =>
          void act(
            () => window.workbench.engine.saveSettings(settings as unknown as Record<string, unknown>),
            'model.saving'
          )
        }
      />

      {/* DOM 顺序 = 窄屏（单列）的顺序，宽屏由 CSS 摆位。
          「要配才能用的」排前面：模型 → 渠道；桌宠是「好玩」，跟在后头。
          ⚠️ 两处顺序要一致，别只改一边 —— 不然宽窄两个断点看着像两个应用。 */}
      <SettingsChannels />

      <SettingsPet pet={pet} onPet={setPet} ai={ai} />

      <SettingsGeneral
        theme={theme}
        onTheme={onTheme}
        font={font}
        onFont={onFont}
        lang={lang}
        onLang={onLang}
      />

      <SettingsAdvanced
        ai={ai}
        onAi={onAi}
        status={status}
        logs={logs}
        busy={busy}
        act={act}
        onRefresh={() => void refresh()}
      />
    </div>
  )
}
