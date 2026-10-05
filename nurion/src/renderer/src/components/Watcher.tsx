import { useEffect, useId, useLayoutEffect, useRef } from 'react'

/**
 * Watcher —— 直接移植 bencho「Eye tracker」的做法。
 *
 * 核心（和平面平移的"贴纸眼"完全不同）：
 * 每只眼睛是球面上的一个点。指针转的是**球**（yaw/pitch），不是眼睛；
 * 转向边缘的眼睛位移更小、同时变窄 —— 这个"透视缩短"才是让一个平面圆
 * 看起来像立体的关键。两只眼睛读自同一次转动，所以永远不打架。
 *
 * 一个 spring 追踪指针位置，每帧直写 DOM（pointer move 不是一次 render），
 * 指针离开窗口时回到正对你，并且会自己偶尔眨眼。
 */

const stillness = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const R = 50 // 球的半径（100 单位 viewBox）

type Eye = { w: number; h: number; r: number }

const STYLES: Record<string, Eye> = {
  Slant: { w: 9, h: 15, r: 4.5 },
  Dots: { w: 11, h: 11, r: 5.5 },
  Squares: { w: 12, h: 12, r: 3.5 }
}

const GAP = 0.19 // 两眼间距的一半（半径的分数）
const TILT = 64 // 对角看时眼睛对倾的角度
/** 眼睛离中心最远能走多少（viewBox 单位）。
 *  ⚠️ 不是随便挑的：`R = 50` 是球半径、也正好是身体轮廓，
 *  不夹的话眼睛会走到 x=5 / x=95（立方体身子 6~94）—— 一半在身子外面。
 *  四种形象里最窄的是胶囊（上下只剩 33），减掉眼睛自己的半个高（7.5）→ 25.5，
 *  向上取整 26。改这个值前先看 `SHAPES` 里最窄的那个。 */
const EYE_REACH = 26

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))

/** 软饱和的“斜度”。越小越快靠近极限。 */
const SOFT_K = 0.55

/** 软饱和之后的**最大朝向**。
 *
 *  ⚠️ 不能给到 1。3D 投影下**外侧那只**眼睛的位移 ≈ `R * (GAP + 朝向)`，
 *  给 1 就是 `50 * 1.19 ≈ 59` 单位 —— 远超 `EYE_REACH`，于是**先被硬夹紧切平**，
 *  渐变全没了：实测舞台上从中心挪到边缘（200 多 px），眼睛一动不动顶在极限上。
 *  **两层饱和串联时，前一层必须整个落在后一层里面**，渐变才活得下来。
 *
 *  取 0.28：外侧眼最多 `50 * (0.19 + 0.28) = 23.5`，**够不到** 26 ✓
 *  （`EYE_REACH` 于是退化成纯兜底：万一哪个调用方喂了 ±1 进来也不会跑出去。） */
const AIM_MAX = 0.28

/**
 * 把「离中心的偏移」变成喂给 Watcher 的朝向。两个调用方（桌宠窗、设置页预览）共用。
 *
 * ⚠️ **不要用硬夹紧**（`clamp(d, -1, 1)`）。两个调用方原来都是「除以宠物半径的一半再夹到 ±1」——
 * 而鼠标**几乎永远在 34px 以外**，于是眼睛**永远顶在极限上**，没有任何渐变：
 * 桌面上看着「定死了」，预览里鼠标一放远就「不协调」。
 *
 * 这里用 `d/(d+k)`：近处几乎不动，越远越靠近上限但**永远到不了**。
 * 所以远处只是「看向那边」，不会变成一个僵住的姿势。`dx/dy` 传**未夹紧的**比值。
 */
export function softAim(dx: number, dy: number): { x: number; y: number } {
  const d = Math.hypot(dx, dy)
  if (!d) return { x: 0, y: 0 }
  const m = (d / (d + SOFT_K)) * AIM_MAX
  return { x: (dx / d) * m, y: (dy / d) * m }
}

/* 身体形状：眼睛始终在球面上算，形状只是它们被裁剪到的轮廓 */
const SHAPES: Record<string, string> = {
  Ball: 'M50 0 A50 50 0 1 1 49.99 0 Z',
  Circle: 'M50 7 A43 43 0 1 1 49.99 7 Z',
  Cube:
    'M30 6 H70 A24 24 0 0 1 94 30 V70 A24 24 0 0 1 70 94 H30 A24 24 0 0 1 6 70 V30 A24 24 0 0 1 30 6 Z',
  Pill: 'M34 17 H66 A33 33 0 0 1 66 83 H34 A33 33 0 0 1 34 17 Z',
  Hexagon:
    'M59.53 8.50 L81.18 21.00 Q90.70 26.50 90.70 37.50 L90.70 62.50 Q90.70 73.50 81.18 79.00 L59.53 91.50 Q50.00 97.00 40.47 91.50 L18.82 79.00 Q9.30 73.50 9.30 62.50 L9.30 37.50 Q9.30 26.50 18.82 21.00 L40.47 8.50 Q50.00 3.00 59.53 8.50 Z',
  'Hex flat':
    'M91.50 59.53 L79.00 81.18 Q73.50 90.70 62.50 90.70 L37.50 90.70 Q26.50 90.70 21.00 81.18 L8.50 59.53 Q3.00 50.00 8.50 40.47 L21.00 18.82 Q26.50 9.30 37.50 9.30 L62.50 9.30 Q73.50 9.30 79.00 18.82 L91.50 40.47 Q97.00 50.00 91.50 59.53 Z'
}

/* 形状之间的 morph：把每个形状读成"中心到边缘的一组等角距离"，
   过渡时把这些距离缓动，再画回成路径（所有形状都关于中心星形，一条射线只交一次边） */
const RAYS = 120
const radii = new Map<string, number[]>()

function measure(shape: string): number[] {
  const hit = radii.get(shape)
  if (hit) return hit
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', SHAPES[shape] ?? SHAPES.Ball)
  svg.appendChild(path)
  document.body.appendChild(svg)
  const pt = svg.createSVGPoint()
  const out: number[] = []
  for (let i = 0; i < RAYS; i++) {
    const a = (i / RAYS) * Math.PI * 2 - Math.PI / 2
    let lo = 0
    let hi = 60
    for (let k = 0; k < 16; k++) {
      const mid = (lo + hi) / 2
      pt.x = 50 + Math.cos(a) * mid
      pt.y = 50 + Math.sin(a) * mid
      if (path.isPointInFill(pt)) lo = mid
      else hi = mid
    }
    out.push(lo)
  }
  svg.remove()
  radii.set(shape, out)
  return out
}

function outline(r: number[]): string {
  let d = ''
  r.forEach((v, i) => {
    const a = (i / r.length) * Math.PI * 2 - Math.PI / 2
    d += `${i ? 'L' : 'M'}${(50 + Math.cos(a) * v).toFixed(2)} ${(50 + Math.sin(a) * v).toFixed(2)}`
  })
  return d + 'Z'
}

/* 形象 / 眼神 的 id → Watcher 内部用的名字。
 * 放在这里是因为**只有 Watcher 认这套名字** —— 之前 PetWidget 和设置页各抄了一份，
 * 加第五种形象时很容易只改一处。 */
export const WATCHER_SHAPE = {
  cube: 'Cube',
  ball: 'Ball',
  pill: 'Pill',
  hexagon: 'Hexagon'
} as const

export const WATCHER_EYES = { slant: 'Slant', dots: 'Dots', squares: 'Squares' } as const

export function Watcher({
  /* external 分支（桌宠窗 + 设置页预览都走这条）只用 follow：
     它是眼睛偏移的线性系数。取满幅 —— 眼睛能跑到形象边缘，看得见。 */
  follow = 100,
  bounce = 30,
  size = 100,
  shape = 'Cube',
  eyes: look = 'Slant',
  eyeScale = 1,
  eyeWidth = 1,
  eyeRound = 1,
  eyeHeight = 1,
  idle = false,
  /* 独立窗口收不到 window pointermove —— 由外面把归一化(-1..1)的指针位置喂进来 */
  external = false,
  aim = null
}: {
  follow?: number
  bounce?: number
  size?: number
  shape?: string
  eyes?: string
  eyeScale?: number
  eyeWidth?: number
  eyeRound?: number
  eyeHeight?: number
  idle?: boolean
  external?: boolean
  aim?: { x: number; y: number } | null
} = {}): JSX.Element {
  const still = stillness()
  const box = useRef<HTMLDivElement>(null)
  const eyesRef = useRef<(SVGGElement | null)[]>([])
  const knobs = useRef({ follow, bounce, eyeScale })
  knobs.current = { follow, bounce, eyeScale }
  const aimRef = useRef(aim)
  aimRef.current = aim
  /** aim 一变就立刻画一帧。rAF 在后台/隐藏页里**根本不跑**（实测过），
   *  只靠那个循环的话表现就是「鼠标移进去了眼睛不动」。 */
  const kick = useRef<(() => void) | null>(null)
  const base = STYLES[look] ?? STYLES.Slant
  const eye = {
    w: base.w * eyeScale * eyeWidth,
    h: base.h * eyeScale * eyeHeight,
    r: base.r * eyeScale * eyeWidth * eyeRound
  }
  const eyeNow = useRef(eye)
  eyeNow.current = eye
  const clipId = useId()

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    /* 脸在球上的位置（半径的分数）、速度、目标 —— 一个 spring 追一个点，
       画眼睛时读成一次转动 */
    const t = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 }
    let raf = 0
    let prev = 0
    let blink = 0
    let nextBlink = performance.now() + 2200

    const draw = (now: number): void => {
      /* 一次眨眼 160ms 下去再上来，压扁每只眼睛 */
      let lid = 1
      if (now > nextBlink) {
        blink = now
        nextBlink = now + (idle ? 2000 : 2600 + Math.random() * 3200)
      }
      const since = now - blink
      if (since < 160) lid = 1 - 0.9 * Math.sin((since / 160) * Math.PI)

      const as = (v: number): number => Math.asin(clamp(v, -0.92, 0.92))
      const yaw = as(t.x)
      const pitch = -as(t.y)
      const cy = Math.cos(yaw)
      const sy = Math.sin(yaw)
      const cp = Math.cos(pitch)
      const sp = Math.sin(pitch)
      const tilt = TILT * t.x * t.y
      const g0 = GAP * Math.max(1, knobs.current.eyeScale * 0.8)

      ;[-g0, g0].forEach((x0, i) => {
        const g = eyesRef.current[i]
        if (!g) return
        const z0 = Math.sqrt(1 - x0 * x0)
        const x1 = x0 * cy + z0 * sy
        const z1 = -x0 * sy + z0 * cy
        const y2 = -z1 * sp
        const z2 = z1 * cp
        const near = clamp(z2, 0, 1)
        const k = 0.45 + 0.55 * near
        const sx = k * (0.7 + 0.3 * near)
        const e0 = eyeNow.current
        const w = e0.w * sx
        const h = Math.max(0.6, e0.h * k * lid)
        const rect = g.firstElementChild as SVGRectElement | null
        if (rect) {
          rect.setAttribute('x', (-w / 2).toFixed(2))
          rect.setAttribute('y', (-h / 2).toFixed(2))
          rect.setAttribute('width', w.toFixed(2))
          rect.setAttribute('height', h.toFixed(2))
          rect.setAttribute('rx', Math.min(e0.r, w / 2, h / 2).toFixed(2))
        }
        /* ⚠️ 眼睛的**活动半径上限**（viewBox 单位，圆心 50,50）。
           `R = 50` 是球半径，也**正好是身体的轮廓** —— 不夹的话 yaw 到极限时
           眼睛会落到 x=5 / x=95（立方体身子是 6~94），半个眼珠跑到身子外面，
           看上去就是「眼睛飞出去了」。
           取 26 的来由：四种形象里最窄的是胶囊（上下只剩 33），再减掉眼睛
           自己的半个高（Slant 15/2 ≈ 7.5）→ 25.5，向上取 26。
           ⚠️ 只夹**位置**，不夹「透视缩短」（那个由 z2 / near 决定）——
             所以走到边上眼睛照样变窄，立体感还在，只是不再越界。 */
        const reach = EYE_REACH
        const dist = Math.hypot(x1 * R, y2 * R)
        const shrink = dist > reach ? reach / dist : 1
        g.setAttribute(
          'transform',
          `translate(${(50 + x1 * R * shrink).toFixed(2)} ${(50 + y2 * R * shrink).toFixed(2)}) rotate(${tilt.toFixed(2)})`
        )
        g.style.opacity = z2 < 0.05 ? '0' : '1'
      })
    }

    /* aim 变了就自己推一步 + 画一帧，不等下一帧。
       正常（rAF 在跑）时它只是多推一帧，无害；
       页面被节流时它是**唯一**在推的东西。dt 给 1（一帧的量）——
       走的是和 tick 同一个弹簧，所以两条路的观感一致。 */
    kick.current = (): void => {
      step(1)
      draw(performance.now())
    }

    /* 一步运动（**不画**）。`tick` 和 `kick` 共用它 ——
       这样「rAF 在跑」和「rAF 被节流、靠事件推」两条路的观感是同一套。
       kick 直接跳到目标的话会一拖一拖的（踩过）。 */
    const step = (dt: number): void => {
      if (external) {
        /* 外部喂指针：**只喂目标**。
           ⚠️ 这里原来是个 `else if` 链 —— external 为真时把后面整段跳过了，
           于是 `t.x / t.y` 永远停在 0，画出来永远居中。
           **「把目标写进去」和「画面动了」是两回事**。 */
        const a = aimRef.current
        const f = clamp(knobs.current.follow, 0, 100) / 100
        t.tx = (a ? clamp(a.x, -1, 1) : 0) * f
        t.ty = (a ? clamp(a.y, -1, 1) : 0) * f
        if (still) {
          t.x = t.tx
          t.y = t.ty
          return
        }
        /* ⚠️ 外部喂指针时**不走弹簧**，用指数逼近。
           弹簧有自己的振动（阻尼越小越荡），而指针是**连续输入** ——
           接上弹簧之后眼睛会在目标附近来回过冲，看着就是「不协调」。
           （踩过：把 external 接回公共弹簧后，`bounce` 在这个分支「复活」了，
             而它的默认值是偏弹的。）
           指数逼近：快、不超调、每一帧走多远都有数，和帧率无关。 */
        const k = 1 - Math.exp(-dt / 3.5)
        t.x += (t.tx - t.x) * k
        t.y += (t.ty - t.y) * k
        return
      }
      if (still) {
        t.x = t.tx
        t.y = t.ty
        return
      }
      /* 自己找乐子（非 external）才用弹簧：要有「顿一下再回弹」的活物感 */
      const k = 0.06
      const d = 0.34 - (clamp(knobs.current.bounce, 0, 100) / 100) * 0.22
      t.vx += ((t.tx - t.x) * k - t.vx * d) * dt
      t.vy += ((t.ty - t.y) * k - t.vy * d) * dt
      t.x += t.vx * dt
      t.y += t.vy * dt
    }

    const tick = (now: number): void => {
      const dt = prev ? Math.min(2.5, (now - prev) / 16.67) : 1
      prev = now
      step(dt)
      draw(now)
      if (external) {
        raf = requestAnimationFrame(tick)
        return
      }
      /* 弹簧停稳就停车，不留一个常驻 rAF */
      const settled =
        Math.abs(t.tx - t.x) < 0.02 &&
        Math.abs(t.ty - t.y) < 0.02 &&
        Math.abs(t.vx) < 0.02 &&
        Math.abs(t.vy) < 0.02
      if (settled) {
        raf = 0
        return
      }
      raf = requestAnimationFrame(tick)
    }

    const aim = (e: PointerEvent): void => {
      const r = el.getBoundingClientRect()
      const f = clamp(knobs.current.follow, 0, 100) / 100
      t.tx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1) * f
      t.ty = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2), -1, 1) * f
      if (!raf) {
        prev = 0
        raf = requestAnimationFrame(tick)
      }
    }
    const rest = (): void => {
      t.tx = 0
      t.ty = 0
      if (!raf) {
        prev = 0
        raf = requestAnimationFrame(tick)
      }
    }

    if (external) {
      raf = requestAnimationFrame(tick)
      return () => {
        if (raf) cancelAnimationFrame(raf)
        kick.current = null
      }
    }

    if (idle) {
      let glance = 0
      const loop = (): void => {
        t.tx = Math.random() * 0.6 - 0.3
        t.ty = Math.random() * 0.6 - 0.3
        if (!raf) {
          prev = 0
          raf = requestAnimationFrame(tick)
        }
        glance = window.setTimeout(rest, 900)
      }
      const iv = window.setInterval(loop, 5000)
      window.addEventListener('pointerleave', rest)
      return () => {
        window.clearInterval(iv)
        window.clearTimeout(glance)
        window.removeEventListener('pointerleave', rest)
        if (raf) cancelAnimationFrame(raf)
      }
    }

    window.addEventListener('pointermove', aim)
    window.addEventListener('pointerleave', rest)
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('pointermove', aim)
      window.removeEventListener('pointerleave', rest)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [still, idle, external])

  /* aim（指针位置）一变，不等 rAF —— 立刻画。
     用 useLayoutEffect 而不是 useEffect：在浏览器上屏前就画完，不会看到滞后一帧。 */
  useLayoutEffect(() => {
    if (external) kick.current?.()
  }, [aim, external])

  const shapePath = outline(measure(shape))

  return (
    <div ref={box} className="watcher" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', display: 'block' }}>
        <defs>
          <clipPath id={clipId}>
            <path d={shapePath} />
          </clipPath>
        </defs>
        <path d={shapePath} fill="currentColor" />
        <g clipPath={`url(#${clipId})`}>
          {[0, 1].map((i) => (
            <g key={i} ref={(el) => void (eyesRef.current[i] = el)}>
              <rect fill="#fff" />
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
