import { useState } from 'react'
import { useT } from '../i18n'
import { LiquidToggle } from './LiquidToggle'
import { Watcher, WATCHER_SHAPE, WATCHER_EYES, softAim } from './Watcher'
import { DynamicIsland, RUN_TICKS, type IslandState } from './DynamicIsland'
import { PET_SHAPES, PET_EYES } from './settings-types'
import type { PetConfig } from '../run-types'

/** 预览能切的状态 —— 就是 `DynamicIsland` 本来就有的那几个，不多造一个。 */
const DEMO_STATES: IslandState[] = ['idle', 'run', 'done', 'error']
/** 岛自己的状态名用标题栏那套词条，空闲才用这里的 —— 因为空闲时它根本不是岛，是桌宠 */
const DEMO_LABEL: Record<IslandState, string> = {
  idle: 'pet.state.idle',
  run: 'island.running',
  done: 'island.done',
  error: 'island.failed',
  /* 预览不演示告警（DEMO_STATES 里没它）—— 但 Record 要求这个键在，
     少了它编译器会直接报错（这是好事，加状态时会强制你到这里看一眼）。 */
  alert: 'island.alert'
}

/**
 * ② 桌宠 —— **只放桌宠**。
 *
 * 主题原来也在这张卡里，挪去「通用」了：桌宠是「好玩」，主题是「看着舒服」，
 * 两件事挤一张卡，谁都不突出。
 *
 * 「跟随 / 回弹 / 大小」三个滑块默认收在折叠里 —— 它们是微调，天天调的人几乎没有，
 * 但每次打开设置都要占一行视觉。
 */
export function SettingsPet({ pet, onPet, ai }: {
  pet: PetConfig
  onPet: (patch: Partial<PetConfig>) => void
  /** AI 总开关。关着的话主进程不会建桌宠窗 —— 开关拨了也不出来，要说一声 */
  ai: boolean
}) {
  const t = useT()
  /** 预览演示的状态 —— 它只影响预览，不写进配置 */
  const [demo, setDemo] = useState<IslandState>('idle')
  /** 预览里眼睛的朝向：鼠标在预览框里的位置归一化到 -1..1 */
  const [aim, setAim] = useState<{ x: number; y: number } | null>(null)
  /** 有事的时候它不再是小家伙，而是那颗胶囊 */
  const asIsland = pet.enabled && demo !== 'idle'

  return (
    <section className="card set-pet">
      <div className="card-head">
        <h3>{t('pet.title')}</h3>
      </div>

      <div className="set-fields">
        <div className="set-field">
          <span>{t('pet.shape')}</span>
          <div className="set-seg">
            {PET_SHAPES.map((s) => (
              <button
                key={s.id}
                className={`set-seg-btn${pet.shape === s.id ? ' on' : ''}`}
                onClick={() => onPet({ shape: s.id })}
              >
                {t(s.label)}
              </button>
            ))}
          </div>
        </div>

        <div className="set-field">
          <span>{t('pet.eyes')}</span>
          <div className="set-seg">
            {PET_EYES.map((e) => (
              <button
                key={e.id}
                className={`set-seg-btn${pet.eyes === e.id ? ' on' : ''}`}
                onClick={() => onPet({ eyes: e.id })}
              >
                {t(e.label)}
              </button>
            ))}
          </div>
        </div>

        {/* 外观三项连在一起：形象 → 眼神 → 大小。
            大小原来在下面单开一个「微调」区，和另两个滑块挤在一起；
            只剩它一个时，再占一个区标题就是浪费一行。 */}
        <label className="set-field">
          <span>{t('pet.size')}</span>
          <input
            type="range"
            min={60}
            max={90}
            value={pet.size}
            onChange={(e) => onPet({ size: Number(e.target.value) })}
          />
          <b className="set-val">{pet.size}px</b>
        </label>

        {/* 桌宠总开关：关着就不占桌面。
            它管的是**桌宠本身** —— 灵动岛不是另一个功能，是它有事时的样子。 */}
        <div className="set-field">
          <span>{t('pet.power')}</span>
          <LiquidToggle
            on={pet.enabled}
            onChange={(v) => onPet({ enabled: v })}
            label={t('pet.power')}
          />
        </div>
        {ai ? (
          pet.enabled && <p className="set-note">{t('pet.island.hint')}</p>
        ) : (
          /* 这个开关此刻是无效的（主进程不建窗），所以直说，
             不然用户拨了没反应，只能归因于「坏了」 */
          <p className="set-note">{t('pet.ai.off')}</p>
        )}
      </div>

      {/* 预览 —— 左边改的东西在这里立刻看得到。
          为什么值得占一块：形象 / 眼神 / 大小这三个设置**不预览就等于盲选**，
          改完得跑去桌面上看一眼才知道对不对。
          眼睛跟随用的是预览框自己的鼠标，不碰真实桌宠那套光标轮询。
          没写「预览」两个字：卡片标题就是「桌宠」，旁边一个装着桌宠的方框，
          再标一遍只是多占一行。
          ⚠️ 有事的时候桌宠是**整个变成**那颗胶囊，不是在它旁边再长一条 ——
          所以这里直接复用标题栏那颗现成的 `DynamicIsland`，不另写一套岛。 */}
      <div className="pet-preview">
        {/* 四个状态并排排不下（列宽 9.5rem）—— 2×2 比横排一长条好认 */}
        {pet.enabled && (
          <div className="pet-preview-states">
            {DEMO_STATES.map((s) => (
              <button
                key={s}
                className={`set-seg-btn${demo === s ? ' on' : ''}`}
                onClick={() => setDemo(s)}
              >
                {t(DEMO_LABEL[s])}
              </button>
            ))}
          </div>
        )}

        <div
          className="pet-preview-stage"
          data-mode={asIsland ? 'island' : 'pet'}
          onPointerMove={(e) => {
            if (asIsland) return
            const b = e.currentTarget.getBoundingClientRect()
            /* ⚠️ 参考半径用**舞台**的（min 半短边），不是宠物自己的 size/2。
               用宠物半径的话，鼠标离中心 34px 就顶到极限了 —— 整个舞台里几乎没有渐变，
               鼠标一放远眼睛就僵在那个姿势上（「很不协调」）。
               现在舞台内是平滑的，越远越靠近极限但到不了（softAim 的软饱和）。 */
            const r = Math.min(b.width, b.height) / 2
            setAim(
              softAim(
                (e.clientX - (b.left + b.width / 2)) / r,
                (e.clientY - (b.top + b.height / 2)) / r
              )
            )
          }}
          onPointerLeave={() => setAim(null)}
        >
          {asIsland ? (
            /* 注意：和标题栏那颗**同一个组件、同一套内容** ——
               任务名、刻度、「停掉」都在。少画一样就不是「同一个东西」了。
               「停掉」在这种演示里不该真去停任务（预览没有任务），点它退回小家伙。 */
            <DynamicIsland
              state={demo}
              label={t(DEMO_LABEL[demo])}
              meta={t('pet.demo.task')}
              ticks={demo === 'run' ? RUN_TICKS : undefined}
              action={
                demo === 'run'
                  ? { label: t('island.stop'), onClick: () => setDemo('idle') }
                  : undefined
              }
            />
          ) : (
            <div className="pet-preview-body" style={{ width: pet.size, height: pet.size }}>
              <Watcher
                size={pet.size}
                shape={WATCHER_SHAPE[pet.shape]}
                eyes={WATCHER_EYES[pet.eyes]}
                external
                aim={aim}
                eyeHeight={1}
                eyeScale={1}
              />
            </div>
          )}
        </div>

        <p className="pet-preview-hint">
          {t(asIsland ? 'pet.preview.hint.island' : 'pet.preview.hint')}
        </p>
      </div>
    </section>
  )
}
