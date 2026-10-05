import { app, BrowserWindow, ipcMain, Menu, nativeImage, nativeTheme, screen, shell, Tray } from 'electron'
import { join } from 'path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import * as agent from './agent/agent'
import * as alerts from './agent/alerts'
import * as channels from './agent/channels'
import * as assistant from './agent/assistant'
import * as nanobot from './agent/nanobot'
import * as push from './agent/push'
import * as runner from './agent/runner'
import * as scheduler from './agent/scheduler'
import * as uiBridge from './agent/ui-bridge'
import * as vault from './agent/vault'

let mainWin: BrowserWindow | null = null
let agentWin: BrowserWindow | null = null
let petWin: BrowserWindow | null = null
let splashWin: BrowserWindow | null = null
let tray: Tray | null = null

/* 「真的要走」和「只是把窗口收起来」的区别。
 * 关了窗但应用还在跑的时候，先把它置 true 再 app.quit() 才退得掉 ——
 * 否则 `close` 拦截会把退出请求也一起吃掉，变成点了退出没反应（最难查的那种）。 */
let quitting = false
/* 第一次收进托盘时提示一下。不做的话「点了红点窗口没了但应用还在」
 * 对用户就是「它到底关没关」的困惑 —— 而托盘图标在 Windows 上是默认折叠起来的。 */
let trayHinted = false

/* ---------- 单实例锁：这个应用只能开一份 ----------
 * 不锁的话，图标点两下就是两个 Electron、两个 nanobot 抢同一个 8900 端口、
 * 两个调度器把任务跑两遍、两个收警入口抢 8971 ——「动不动出问题」多半是它。
 * 第二份实例起来时，把已开的那份拽到前台，而不是再开一份。 */
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // 第二份实例被拦下 → 把已开的那份叫到前面（关窗收进托盘时也一样管用）
    showMain()
  })
}

/* 主进程兜底：任何没接住的异常 / Promise 拒绝都记下来，别让整个应用说崩就崩。
 * 渲染进程的崩由每个窗口自己隔离，不影响主进程。 */
process.on('uncaughtException', (e) => {
  console.error('[main] 未捕获异常：', e)
})
process.on('unhandledRejection', (r) => {
  console.error('[main] 未处理的 Promise 拒绝：', r)
})

/* ---------- 闪屏 ----------
 * 主窗口是「先建好再显示」（`show: false` + ready-to-show），所以冷启动那几秒里
 * 屏幕上什么都没有 —— 用户双击图标之后会怀疑自己没点上。闪屏就是那段空白的填充。
 *
 * ⚠️ 进度条走的是**真节点**（窗口起来 → 界面开始下 → DOM 好了 → 首屏画出来），
 *    不是一条自己转圈的光：编出来的进度和转圈图标一样，看多了就不信了。
 *
 * ⚠️ 但**不能一 ready 就关**（2026-10-04 用户：「启动动画太快了我都看不到进度条」）：
 *    本地起得快的时候整段动画只演了三百毫秒，进度条还在半路窗口就没了 ——
 *    那闪屏就等于白发一次。所以有个**最短可见时间** `SPLASH_MIN_MS`：
 * ⚠️ **退场有两个门槛，缺一个都会「太短」**（2026-10-04 用户连提两次）：
 *    ① `SPLASH_MIN_MS` —— 本地起得快时别一闪而过；
 *    ② `SPLASH_TAIL_MS` —— **主窗口就绪之后还要再等一拍**。
 *    ② 才是真正的坑：原来是一到 100% 就立刻 `close()`，而进度条那一格自己要走 0.9s
 *    —— 于是末段动画被砍在半路，看着就是「刚要走完就没了」。
 * ⚠️ 还有第三件事：**进度条不是走完界面就完，是走完引擎**
 *    （用户 2026-10-04：「所有引擎启动好后，这个开机动画再结束」）——
 *    界面能画 ≠ 能用，见 `waitEngineThenFinish`。 */
const SPLASH_MIN_MS = 2200
const SPLASH_TAIL_MS = 900

/* ---------- 界面主题（给闪屏用的副本） ----------
 * 真相在**渲染层的 localStorage** 里（同步、第一帧就准，见 ui-prefs 的说明）；
 * 但闪屏是 main 里一段自带内容的 HTML，**得在渲染层跑起来之前就有颜色** ——
 * main 读不到那个 localStorage，所以另存一份副本在这里。
 * ⚠️ 默认值要和 `ui-prefs.ts` 的 `DEFAULTS.theme` 一致（现在是 light）。 */
type ThemeMode = 'light' | 'dark' | 'system'
let themePref: ThemeMode = 'light'

function uiConfigPath(): string {
  return join(vaultRoot(), 'ui.json')
}

async function loadThemePref(): Promise<ThemeMode> {
  try {
    const raw = await readFile(uiConfigPath(), 'utf8')
    const t = (JSON.parse(raw.replace(/^\uFEFF/, '')) as { theme?: unknown }).theme
    themePref = t === 'dark' || t === 'system' ? t : 'light'
  } catch {
    /* 没这个文件 = 从没用过 = 默认浅色 */
    themePref = 'light'
  }
  return themePref
}

/** 现在是不是深色。'system' 交给系统 —— 和渲染层的 `resolveDark()` 同一套判断。 */
function splashDark(): boolean {
  return themePref === 'system' ? nativeTheme.shouldUseDarkColors : themePref === 'dark'
}
/** 等引擎的最长时长。它起不来的话（没装 / 配置坏）也得把窗口交出去，
 *  不能让闪屏变成一块擦不掉的挡板。`nanobot.start()` 自己最多等 30 秒，
 *  这里再套一个更短的硬上限 —— 用户要的「等引擎完」是「等它真的能用」，
 *  不是「无条件陪到底」。 */
const SPLASH_ENGINE_MAX_MS = 8000

/**
 * 闪屏的**全部内容**：一段自带的 HTML（按主题取一套颜色）。
 *
 * ⚠️ 为什么不走 `?splash=1` 那条 React 路线（原来的写法）：
 *    那样这一屏得等**整个渲染层 bundle** 下载 + 执行完才能画出第一个像素 ——
 *    而它和主窗口一样慢（开发模式三四秒）。于是用户看到的是
 *    「一块什么都没有的深色卡片，占了大半个启动过程」
 *    （用户 2026-10-04 原话：「我看了大部分时间他只是一个没有任何内容的卡片」）。
 *    闪屏必须是**自带内容**的：不走网络、不跑框架，窗口出现的那一帧就有东西。
 *
 * ⚠️ 自带内容就意味着**颜色写死在这里**（两套，跟着用户选的主题走）。
 *    要和 tokens.css 里浅/深两套的 `--background` / `--foreground` /
 *    `--primary` 一致，也要和建窗时的 `backgroundColor` 一致。
 *    ⚠️ 主题在渲染层的 localStorage 里（同步、第一帧就准）—— main 读不到那个，
 *       所以另存了一份副本 `vault/ui.json`，见 loadThemePref。
 * ⚠️ 文案写死中文：它和窗口标题、托盘 tooltip 是同一种「壳上的字」。
 */
function splashHtml(dark: boolean): string {
  const bg = dark ? '#1b1918' : '#f6f3ee'
  const fg = dark ? '#efeae3' : '#292522'
  const dim = dark ? 'rgba(239,234,227,.55)' : 'rgba(41,37,34,.55)'
  const track = dark ? 'rgba(239,234,227,.12)' : 'rgba(41,37,34,.12)'
  const shadow = dark ? '.45' : '.18'
  return `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; height: 100%; }
  body {
    background: ${bg};
    color: ${fg};
    font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    user-select: none; overflow: hidden;
  }
  .mark { width: 78px; height: 78px; margin-bottom: 12px; filter: drop-shadow(0 8px 18px rgba(0,0,0,${shadow})); }
  .name { font-size: 1.02rem; font-weight: 600; letter-spacing: .06em; }
  .tag {
    margin-top: 3px; font-size: .76rem; letter-spacing: .16em; color: ${dim};
    animation: focus .42s cubic-bezier(.22,1,.36,1) .1s both;
  }
  @keyframes focus {
    from { opacity: 0; letter-spacing: .34em; transform: translateY(4px); }
    to   { opacity: 1; letter-spacing: .16em; transform: none; }
  }
  .bar {
    position: relative; width: 144px; height: 3px; margin-top: 16px;
    border-radius: 999px; background: ${track}; overflow: hidden;
  }
  .bar > i {
    display: block; height: 100%; width: 8%; border-radius: inherit; background: #6fa588;
    /* 时长要和 main 那边的 SPLASH_TAIL_MS 对上：退场是「到 100% 后再等一拍」。 */
    transition: width .9s cubic-bezier(.22,1,.36,1);
  }
</style>
<svg class="mark" viewBox="0 0 100 100" aria-hidden="true">
  <path d="M30 6 H70 A24 24 0 0 1 94 30 V70 A24 24 0 0 1 70 94 H30 A24 24 0 0 1 6 70 V30 A24 24 0 0 1 30 6 Z" fill="${fg}"/>
  <rect x="36" y="42.5" width="9" height="15" rx="4.5" fill="${bg}"/>
  <rect x="55" y="42.5" width="9" height="15" rx="4.5" fill="${bg}"/>
</svg>
<b class="name">NURION</b>
<span class="tag">v1.0（测试版）</span>
<span class="bar"><i id="p"></i></span>
<script>
  /* 主进程用 executeJavaScript 调这个钩子推真实进度（名字两边要一致）。
     只往前不往后 —— 慢一步的真值不该把已经爬过去的进度拉回来。 */
  window.__splashProgress = function (v) {
    var el = document.getElementById('p');
    var w = Math.round(v * 100);
    if (parseFloat(el.style.width || '8') < w) el.style.width = w + '%';
  };
</script>`
}

let splashStart = 0
/** 主窗口能不能画了（不是「要不要走了」—— 退场还要等引擎） */
let splashWindowUp = false
let splashTimer: NodeJS.Timeout | null = null

/** 推一格真实进度给闪屏窗口。
 *  ⚠️ 闪屏**没有 preload**（它一个 IPC 都不发），所以走 `executeJavaScript`
 *    去调页面上的一个全局钩子，而不是走 IPC 通道。 */
function splashProgress(v: number): void {
  if (!splashWin || splashWin.isDestroyed()) return
  splashWin.webContents
    .executeJavaScript(`window.__splashProgress && window.__splashProgress(${v})`)
    .catch(() => {
      /* 页面还没加载完就丢掉了 —— 下一格会补上，不是错误 */
    })
}

/** 主窗口能画了。界面这一步到此为止（88%），**剩下那 12% 留给引擎**。 */
function splashWindowReady(): void {
  splashProgress(0.88)
  splashWindowUp = true
  void waitEngineThenFinish()
}

/**
 * 等引擎真的在服务了，再让开机动画结束。
 *
 * 用户 2026-10-04：「所有引擎启动好后，这个开机动画再结束」—— 对：
 * 主窗口能画 ≠ 能用。界面出来了但引擎还在起，助手是不会回话的，
 * 那时候把闪屏收掉，用户点两下才发现「怎么没反应」。
 *
 * ⚠️ `nanobot.start()` 本身就是「等到 8900 真的在服务才 resolve」（每 500ms 探一次），
 *    所以这里只是轮它那个状态，不用自己发明探法。
 * ⚠️ 必须留硬上限：引擎起不来时也得把窗口交出去。
 * ⚠️ AI 关着就不等 —— 那种情况根本没有引擎要起。
 */
async function waitEngineThenFinish(): Promise<void> {
  if (aiEnabled) {
    const deadline = Date.now() + SPLASH_ENGINE_MAX_MS
    for (;;) {
      const s = nanobot.stateName()
      if (s === 'running' || s === 'error') break
      if (Date.now() > deadline) {
        console.log('[闪屏] 引擎还没起来 —— 不等了，先把窗口交出去')
        break
      }
      await new Promise((r) => setTimeout(r, 200))
    }
  }
  splashProgress(1)
  /* 两个门槛取晚的那个：① 起得快时至少有 SPLASH_MIN_MS 在台上；
     ② 到 100% 之后至少留 SPLASH_TAIL_MS 让最后一格走完（不然末段动画被砍半）。 */
  const until = Math.max(splashStart + SPLASH_MIN_MS, Date.now() + SPLASH_TAIL_MS)
  if (splashTimer) clearTimeout(splashTimer)
  splashTimer = setTimeout(() => {
    if (splashWindowUp) closeSplash()
  }, until - Date.now())
}

function createSplash(): void {
  splashStart = Date.now()
  splashWindowUp = false
  const w = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    center: true,
    /* 不抢焦点 —— 闪屏不是给人操作的，抢焦点会把用户正在打的字打断 */
    focusable: false,
    /* ⚠️ **一上来就显示，不挂 `ready-to-show`。**
        踩过：写成 `show: false` + `ready-to-show` 时那个事件**根本没触发** ——
        日志里只有「退场」没有「出现」，也就是闪屏自始至终没露过面（而它「看起来
        成功了」，因为退场那行照样打）。隐藏窗口不参与首次绘制，这是隐藏窗口的通病。
        白闪由 `backgroundColor` 兜住：它和页面底色是同一个值（见 tokens.css 的 --splash）。 */
    show: true,
    /* ⚠️ 必须和 `splashHtml()` 里那一套底色一致 ——
        不一致的话在「窗口已出现、HTML 还没画」的那几十毫秒会露馅。 */
    backgroundColor: splashDark() ? '#1b1918' : '#f6f3ee',
    title: 'NURION',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  splashWin = w
  /* ⚠️ 层级要压得住**桌宠**：桌宠是 `screen-saver`（最高那档），默认层级的闪屏
     会被它整个盖住（用户 2026-10-04：「这个桌宠会挡住」）。
     另一手保险是建桌宠时先不 show（见 createPet），两道都有才稳。 */
  w.setAlwaysOnTop(true, 'screen-saver')
  w.on('closed', () => {
    splashWin = null
  })
  console.log(`[闪屏] 出现（${splashDark() ? '深色' : '浅色'}）`)
  /* 第一格：它自己画出来了 */
  w.webContents.on('dom-ready', () => splashProgress(0.12))
  w.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[闪屏] 页面没加载上（${code} ${desc}）：${url}`)
  })
  /* ⚠️ **不是** `?splash=1` 那条 React 路线，见 splashHtml 上面的说明。 */
  void w.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(splashHtml(splashDark()))}`
  )
  /* 兜底：主窗口因为什么原因始终没 ready（dev server 没起、渲染崩了），
     闪屏也不能一直挂着 —— 那会变成一块擦不掉的挡板。 */
  setTimeout(closeSplash, 15_000)
}

function closeSplash(): void {
  if (splashTimer) {
    clearTimeout(splashTimer)
    splashTimer = null
  }
  if (splashWin && !splashWin.isDestroyed()) {
    /* 把引擎状态一起打出来 —— 「等没等引擎」是这一屏最容易出问题的地方，一眼可查 */
    console.log(
      `[闪屏] 退场（在台上 ${Date.now() - splashStart}ms · 引擎 ${nanobot.stateName()}）`
    )
    splashWin.close()
  }
  splashWin = null
  /* 闪屏让开了，桌宠这才出来（见 createPet 里那个 show: false） */
  if (petWin && !petWin.isDestroyed() && !petWin.isVisible()) {
    petWin.show()
    console.log('[闪屏] 让开 → 桌宠出来')
  }
}

/** 把主窗口叫到前面来（没有就建一个）。托盘点击、第二份实例、菜单都走这一条 ——
 *  「怎么把它弄回屏幕上」只有这一个答案，不散三处。 */
function showMain(): void {
  if (!mainWin || mainWin.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWin.isMinimized()) mainWin.restore()
  mainWin.show()
  mainWin.focus()
}

/* ---------- 托盘 ----------
 * 存在的理由不是「多个图标」，是**关窗和退出得分成两件事**：
 * 这个应用有一半的价值在「你没看着的时候它还在跑」（定时任务、到点出报表）。
 * 点红点就退掉，等于把定时任务一起停了 —— 而且用户完全意识不到。
 * 所以红点 = 收进托盘（进程还在，调度器还在跑），要真的退出走托盘菜单。 */
function trayImage(): Electron.NativeImage {
  /* 图标是**画出来的**，不带图片资源：
     为一张 16px 的图去维护 dev / prod 两条路径 + 打包配置，不值。
     `createFromBitmap` 直接吃 BGRA 原始像素，画完就是图标。 */
  const S = 32
  const SS = 4 // 每边 4× 超采样：不超采样的话圆角在 16px 下全是锯齿
  const buf = Buffer.alloc(S * S * 4)

  /** 圆角矩形（到边距离 ≤ r 就算在里面） */
  const inRound = (
    px: number,
    py: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    r: number
  ): boolean => {
    const dx = Math.max(x0 + r - px, px - (x1 - r), 0)
    const dy = Math.max(y0 + r - py, py - (y1 - r), 0)
    return Math.hypot(dx, dy) <= r
  }

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let body = 0
      let eye = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          // 身子：一块圆角方（和桌宠的「方块」形象同一个轮廓语言）
          if (inRound(px, py, 3, 3, 29, 29, 8)) body++
          // 两只眼（斜眼）：有眼睛才认得出是它，不然就是个绿方块
          if (
            inRound(px, py, 8, 12.5, 14, 18.5, 2.6) ||
            inRound(px, py, 18, 12.5, 24, 18.5, 2.6)
          )
            eye++
        }
      }
      const n = SS * SS
      const cov = body / n
      if (!cov) continue
      // 眼睛盖在身子上：取眼睛的覆盖率，其余部分留身子的苔绿
      const e = eye / n
      const R = 111 * (1 - e) + 27 * e
      const G = 165 * (1 - e) + 25 * e
      const B = 136 * (1 - e) + 24 * e
      const i = (y * S + x) * 4
      /* ⚠️ 必须**预乘**（颜色 × 覆盖率）—— Skia 的 N32 位图就是这个约定，
         直接写原色会在抗锯齿的那一圈上泛出白边。 */
      buf[i] = Math.round(B * cov)
      buf[i + 1] = Math.round(G * cov)
      buf[i + 2] = Math.round(R * cov)
      buf[i + 3] = Math.round(cov * 255)
    }
  }
  return nativeImage.createFromBitmap(buf, { width: S, height: S })
}

/** 托盘菜单。**只有这一份** —— 别处要「刷新勾选状态」就调它，
 *  而不是照着抄一遍模板（抄一遍就有第二个地方会忘记改）。 */
function trayMenu(petOn: boolean): Electron.Menu {
  return Menu.buildFromTemplate([
    { label: '打开工作台', click: () => showMain() },
    { label: '打开助手', click: () => openAgentWindow() },
    {
      label: '桌宠',
      type: 'checkbox',
      checked: petOn && aiEnabled,
      /* 点一下 = 直接翻 pet.json 里的 enabled。桌宠本来只有设置页有开关，
         而设置页要先开主窗口 —— 收进托盘之后那条路就绕远了。 */
      click: () => void togglePet()
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])
}

async function refreshTrayMenu(): Promise<void> {
  if (!tray || tray.isDestroyed()) return
  tray.setContextMenu(trayMenu((await getPetConfig()).enabled))
}

async function createTray(): Promise<void> {
  const img = trayImage()
  /* 空图标在托盘上就是**看不见** —— 而看不见的托盘图标 = 「退出」也一起看不见了。
     这种事不会报错，只会让人觉得「这个软件退不掉」，所以在这儿拦一道。 */
  if (img.isEmpty()) console.error('[托盘] 图标是空的 —— 托盘上会看不见，关窗将按退出处理')
  try {
    tray = new Tray(img)
  } catch (e) {
    /* 托盘建不起来（某些 Linux 桌面上没有状态栏）不该拦住整个应用：
       那就退回「关窗 = 退出」的老规矩（见 window-all-closed）。 */
    console.error('[托盘] 建不起来，关窗仍按退出处理：', e)
    return
  }
  tray.setToolTip('NURION v1.0（测试版） · 定时任务在后台跑着')
  tray.on('click', () => showMain())
  await refreshTrayMenu()
  console.log('[托盘] 已就位')
}

/** 托盘菜单里那个「桌宠」勾选框：翻一下 pet.json 里的 enabled。
 *  （菜单勾选会被 `setPetConfig` 自己刷新 —— 那儿是改动唯一入口，刷新跟着它走。） */
async function togglePet(): Promise<void> {
  const cfg = await getPetConfig()
  await setPetConfig({ enabled: !cfg.enabled })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    maxWidth: 1600,
    maxHeight: 1000,
    frame: false,
    show: false,
    autoHideMenuBar: true,
    title: 'NURION',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWin = win
  /* 真实进度：开始加载 → DOM 好了 → 首屏画出来（88%）→ 引擎起来（100%）。
     闪屏只负责把它画成一根条，**不自己数秒** —— 编出来的进度看着看着就不信了。 */
  win.webContents.on('did-start-loading', () => splashProgress(0.35))
  win.webContents.on('dom-ready', () => splashProgress(0.7))
  win.on('ready-to-show', () => {
    win.show()
    /* ⚠️ 这里只到 88% —— 剩下那 12% 是引擎（见 waitEngineThenFinish），
       进度条走完 = 这个应用真的能用了。 */
    splashWindowReady()
  })
  /* 红点 = 收进托盘，**不是**退出。
     这个应用有一半的价值在「你没看着的时候它还在跑」，退掉就等于把定时任务停了。 */
  win.on('close', (e) => {
    if (quitting) return
    /* ⚠️ 没有托盘可回去就不拦 —— 托盘建不起来时（见 createTray 的 catch）
       hide 会留下一个既没窗口也没图标的进程，而 `window-all-closed` 也不会触发
       （窗口没被关，只是藏了）→ 只能去任务管理器杀。 */
    if (!tray || tray.isDestroyed()) return
    e.preventDefault()
    win.hide()
    if (!trayHinted) {
      trayHinted = true
      try {
        tray?.displayBalloon({
          title: '还在后台跑',
          content: '窗口收进托盘了，定时任务照常执行。要退出请右键托盘图标。',
          icon: trayImage()
        })
      } catch {
        /* 有些系统把气泡通知关了 —— 提示不到就算了，不能因为提示失败影响关窗 */
      }
    }
  })
  win.on('closed', () => {
    mainWin = null
    if (agentWin && !agentWin.isDestroyed()) agentWin.close()
    agentWin = null
    if (petWin && !petWin.isDestroyed()) petWin.close()
    petWin = null
  })

  // 向渲染进程广播最大化状态（供 mac 风格绿点按钮切换提示）
  win.on('maximize', () => win.webContents.send('window:maximized', true))
  win.on('unmaximize', () => win.webContents.send('window:maximized', false))

  // 界面直通管道：让 agent（引擎子进程）能操控界面
  uiBridge.listen(win)

  // 外部链接交给系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    // 和 will-navigate 一样：只放行 http(s)，file:/smb:/自定义协议一律拦掉
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  /*
   * 万一有没带 target 的链接（markdown 里模型写的东西我们管不住），
   * **不能让整个窗口跳走** —— 那会把工作台整个换成一个网页，用户手上的东西全没了。
   * 拦下来，交给系统浏览器。
   */
  win.webContents.on('will-navigate', (e, url) => {
    if (url === win.webContents.getURL()) return // 刷新之类的别拦
    e.preventDefault()
    if (/^https?:/i.test(url)) shell.openExternal(url)
  })

  // 开发模式加载 Vite dev server，生产模式加载打包产物
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/* ---------- 助手窗口：桌面小组件 ----------
 * 主窗口导航栏里点「助手」，弹出来的是这个独立窗口 ——
 * 能拖到桌面任何地方（头部是拖拽区），对话和构建轮播都住在这里。 */
function createAgentWindow(): void {
  const w = new BrowserWindow({
    width: 420,
    height: 640,
    minWidth: 360,
    minHeight: 480,
    frame: false,
    show: false,
    autoHideMenuBar: true,
    title: '助手',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  agentWin = w
  w.on('ready-to-show', () => w.show())
  w.on('closed', () => {
    agentWin = null
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    void w.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?agent=1`)
  } else {
    void w.loadFile(join(__dirname, '../renderer/index.html'), { query: { agent: '1' } })
  }
}

function openAgentWindow(): void {
  /* AI 关着就不弹助手。
     ⚠️ 闸门要放在**这里**（而不是只把导航按钮变灰）：能打开助手窗的路径有三条
     —— 导航栏「助手」、灵动岛的「引擎设置」、点桌宠。只堵一条等于没堵。 */
  if (!aiEnabled) return
  if (agentWin && !agentWin.isDestroyed()) {
    if (agentWin.isMinimized()) agentWin.restore()
    agentWin.show()
    agentWin.focus()
    return
  }
  createAgentWindow()
}

/* ---------- AI 总开关 ----------
 * 关掉 = 这台机器**完全不碰外部模型**：不启引擎、不给助手开门、桌宠不出来。
 * 剩下的是纯自动化 —— 任务本来就只是「一条命令 + 目录 + 定时」，
 * 调度器跑在 main 里，跟引擎一点关系没有。
 *
 * ⚠️ 这个值必须落在**库里**（ai.json），不能放 renderer 的 localStorage ——
 *    main 在 `whenReady` 里就要读它决定启不启引擎，那时 renderer 还没跑。
 *    和 `pet.json` 是同一个道理。 */
function aiConfigPath(): string {
  return join(vaultRoot(), 'ai.json')
}

let aiEnabled = true

async function loadAiEnabled(): Promise<boolean> {
  try {
    const raw = await readFile(aiConfigPath(), 'utf8')
    /* 同样先剥 BOM：库是明说「可以直接打开改」的，记事本存一下就会带上 U+FEFF，
       而 JSON.parse 见到它会直接抛 —— 表现是配置被静默重置，最难查的那种。 */
    aiEnabled = (JSON.parse(raw.replace(/^\uFEFF/, '')) as { enabled?: boolean }).enabled !== false
  } catch {
    /* 没这个文件（老用户第一次升级）= 默认开着，不改他们已有的行为 */
    aiEnabled = true
  }
  return aiEnabled
}

/** 开 / 关 AI。关的一瞬间把引擎停掉，开的一瞬间把它拉起来 —— 不用再手动点重启。 */
async function setAiEnabled(on: boolean): Promise<{ enabled: boolean }> {
  aiEnabled = on
  try {
    await writeFile(aiConfigPath(), JSON.stringify({ enabled: on }), 'utf8')
  } catch {
    /* 写不进去就本次会话内生效 */
  }
  if (on) {
    void nanobot.start().catch((e) => console.error('[nanobot] 启动失败：', e))
  } else {
    applyPetEnabled(await getPetConfig())
    /* 已经开着的助手窗要收掉 —— 光是不让人「打开」不够，
       桌面上还立着一扇开着的门就不叫关。 */
    if (agentWin && !agentWin.isDestroyed()) agentWin.close()
    void nanobot.stop().catch((e) => console.error('[nanobot] 停止失败：', e))
  }
  /* AI 关了桌宠也不出来 —— 托盘菜单那一勾是 `桌宠开关 && AI 开关`，得重建 */
  void refreshTrayMenu()
  return { enabled: on }
}

/* ---------- 桌宠：应用一启动就在桌面上的小家伙 ----------
 * 独立透明小窗口、置顶、能拖到桌面任何地方；点一下打开助手窗口。
 * 形象（方块/圆球）和眼睛样式（斜眼/点/方块）在设置页里换。 */
interface PetConfig {
  shape: 'cube' | 'ball' | 'pill' | 'hexagon'
  eyes: 'slant' | 'dots' | 'squares'
  size: number
  /** 桌宠开不开。
   * ⚠️ 默认**关**，而且这个值落在 pet.json 里（不是 renderer 的 localStorage）——
   * main 在 `whenReady` 里要先读它才知道该不该建窗，那时 renderer 还没跑。
   * 也正因为落盘，“关掉之后下次开机也不再冒出来”才是真的。 */
  enabled: boolean
}

const PET_DEFAULT: PetConfig = { shape: 'cube', eyes: 'slant', size: 80, enabled: false }

const PET_SHAPES = new Set<PetConfig['shape']>(['cube', 'ball', 'pill', 'hexagon'])
const PET_EYES = new Set<PetConfig['eyes']>(['slant', 'dots', 'squares'])

/** 库根：环境变量优先，否则用户数据目录下。只此一处定义，别处都从这里取 */
function vaultRoot(): string {
  return process.env.WORKBENCH_VAULT || join(app.getPath('userData'), 'vault')
}

function petConfigPath(): string {
  return join(vaultRoot(), 'pet.json')
}

/** 渲染层传来的 patch 不能全信：枚举只认白名单，数值夹到合理区间。
 * 否则一个坏值（size 传成字符串 / 未知 shape）会把 pet.json 永久写坏。 */
function sanitizePetPatch(patch: Partial<PetConfig>): Partial<PetConfig> {
  const out: Partial<PetConfig> = {}
  if (patch.shape && PET_SHAPES.has(patch.shape)) out.shape = patch.shape
  if (patch.eyes && PET_EYES.has(patch.eyes)) out.eyes = patch.eyes
  if (typeof patch.enabled === 'boolean') out.enabled = patch.enabled
  if (typeof patch.size === 'number' && Number.isFinite(patch.size))
    out.size = Math.min(120, Math.max(40, Math.round(patch.size)))
  return out
}

async function getPetConfig(): Promise<PetConfig> {
  try {
    const raw = await readFile(petConfigPath(), 'utf8')
    // 磁盘上的 pet.json 也可能被手改坏 —— 同样过一遍白名单，不把坏值透给渲染层
    // ⚠️ 先剥 BOM：vault 是明说「可以直接打开改」的，用户拿记事本存一下就会带上
    //    U+FEFF，而 `JSON.parse` 见到它会直接抛 —— 表现是**配置被静默重置成默认值**，
    //    不报错、不提示，最难查的那种。
    return { ...PET_DEFAULT, ...sanitizePetPatch(JSON.parse(raw.replace(/^\uFEFF/, '')) as Partial<PetConfig>) }
  } catch {
    return PET_DEFAULT
  }
}

async function setPetConfig(patch: Partial<PetConfig>): Promise<PetConfig> {
  const cfg = { ...(await getPetConfig()), ...sanitizePetPatch(patch) }
  try {
    await writeFile(petConfigPath(), JSON.stringify(cfg), 'utf8')
  } catch {
    /* 写不进去就本次会话内生效 */
  }
  applyPetEnabled(cfg)
  /* 托盘菜单里那个「桌宠」勾选也是这份配置的投影 —— 不重建它就不会变。 */
  void refreshTrayMenu()
  return cfg
}

/** 桌宠开 / 关：**窗随配置走**。
 *  开着就建（已存在就只把新配置推进去），关掉就销毁。
 *  开机时也走这一条 —— 所以“上次关掉过，这次也不冒出来”是磁盘上那个值说了算，
 *  不是内存里一个开关。 */
function applyPetEnabled(cfg: PetConfig): void {
  /* 桌宠是**助手的影子**：AI 关着它就不存在。
     所以这里是 `cfg.enabled && aiEnabled`，而不是只看 pet.json ——
     用户关 AI 之后没去动桌宠那个开关，也不该让小家伙继续站在桌面上。 */
  if (cfg.enabled && aiEnabled) {
    if (!petWin || petWin.isDestroyed()) createPet()
    else petWin.webContents.send('pet:config', cfg)
  } else if (petWin && !petWin.isDestroyed()) {
    petWin.close()
    petWin = null
    console.log(cfg.enabled ? '[桌宠] AI 关着，不出来' : '[桌宠] 已关闭')
  }
}

/* 桌宠窗的两种尺寸。
 * 平时只装小家伙（100×140，它在底部）；有事时得放宽到装得下**整颗岛** ——
 * 岛上有任务名和一个「停掉」，就是标题栏那颗的大小，不是砍掉一半的版本。
 * ⚠️ 两种尺寸都以**底边中点**为锚（见 petLayout）：长开／缩回的时候，
 *    小家伙站的那个点不动，它不会“跳”到别处去。 */
const PET_BOX = { width: 100, height: 140 }
const PET_ISLAND_BOX = { width: 320, height: 36 }

/** 把窗口夹进最近那块屏的工作区。
 * ⚠️ 不夹的话桌宠能被拖到屏幕外 —— 那就**再也找不回来**了：
 *   它没有托盘图标、没菜单、设置页里也没有「把它拖回来」。
 *   （内层 `Math.max(area.x, ...)` 是防夹完反而跑到左边：窗口比屏幕还大时会出现。） */
function clampToScreen(x: number, y: number, w: number, h: number): { x: number; y: number } {
  const area = screen.getDisplayNearestPoint({
    x: Math.round(x + w / 2),
    y: Math.round(y + h / 2)
  }).workArea
  return {
    x: Math.min(Math.max(Math.round(x), area.x), Math.max(area.x, area.x + area.width - w)),
    y: Math.min(Math.max(Math.round(y), area.y), Math.max(area.y, area.y + area.height - h))
  }
}

/** 换尺寸 —— 锚点钉在底边中点。
 *  返回新位置：换尺寸会改左上角坐标，渲染层那份位置缓存必须跟着更新，
 *  否下一次拖动会从旧坐标起算，一上手就跳一下。 */
function petLayout(island: boolean): { x: number; y: number } {
  if (!petWin || petWin.isDestroyed()) return { x: 0, y: 0 }
  const box = island ? PET_ISLAND_BOX : PET_BOX
  const [x, y] = petWin.getPosition()
  const [w, h] = petWin.getSize()
  if (w === box.width && h === box.height) return { x, y }
  const nx = x + w / 2 - box.width / 2
  const ny = y + h - box.height
  const at = clampToScreen(nx, ny, box.width, box.height)
  console.log(`[桌宠] ${island ? '长开成岛' : '缩回小家伙'} ${box.width}×${box.height} → (${at.x}, ${at.y})`)
  petWin.setBounds({ ...at, ...box })
  return at
}

function createPet(): void {
  const splashUp = !!splashWin && !splashWin.isDestroyed()
  console.log(`[桌宠] 已启动${splashUp ? '（闪屏还在，先不露头）' : ''}`)
  const w = new BrowserWindow({
    ...PET_BOX,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    /* ⚠️ 先不露头。桌宠设的是 `screen-saver` 层（最高那档），
       而闪屏比它晚建、默认层级比它低 —— 直接 show 的话小家伙会**趴在启动动画上面**
       （用户 2026-10-04：「这个桌宠会挡住」）。等闪屏退场时再把它叫出来（见 closeSplash）。
       启动本来就没有它，晚半秒出现也不突兀。 */
    show: false,
    title: '桌宠',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      /* ⚠️ 桌宠窗永远不会是「前台窗口」—— 它就是个蹲在角落不抢焦点的小窗口。
         不关掉后台节流，Chromium 会把它当背景页降频，拖动和眼睛跟随都会一顿一顿。 */
      backgroundThrottling: false
    }
  })
  petWin = w
  w.setAlwaysOnTop(true, 'screen-saver')
  w.setHasShadow(false)
  w.on('closed', () => {
    petWin = null
  })
  /* 没有闪屏（比如闪屏已经退过场了）才直接出来 */
  if (!splashWin || splashWin.isDestroyed()) w.show()
  if (process.env['ELECTRON_RENDERER_URL']) {
    void w.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?pet=1`)
  } else {
    void w.loadFile(join(__dirname, '../renderer/index.html'), { query: { pet: '1' } })
  }
}

// ---------- 无边框窗口控制（mac 风格红黄绿按钮） ----------
function windowFrom(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) {
  return BrowserWindow.fromWebContents(event.sender)
}

// ---------- IPC 统一收口 ----------
// 每个 handle 的 handler 都可能 reject（业务错误：任务在跑 / 引擎没装 / key 失效…）。
// 不包一层的话，reject 会变成一条不透明的 Electron 内部错误，渲染层也拿不到干净的
// message。这里统一：出错记日志 + 重新抛一个**只有 message 的干净错误**，
// 保持 reject 语义不变 —— 渲染层的 try/catch 照常工作，只是拿到的话更好读了。
//
// 参数用 any[]：IPC 是信任边界，跨进程传来的值没有静态类型可言，Electron 自己的
// listener 签名也是 any[]。这里不强装类型，由各 handler 在自己的签名上收窄。
function handle(
  channel: string,
  fn: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown | Promise<unknown>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(event, ...args)
    } catch (e) {
      console.error(`[ipc] ${channel} 出错：`, e)
      // 主进程侧保留原始错误的类型和 stack；Electron 序列化到渲染层时只带 message
      throw e instanceof Error ? e : new Error(String(e))
    }
  })
}

ipcMain.on('window:minimize', (event) => windowFrom(event)?.minimize())
ipcMain.on('window:toggle-maximize', (event) => {
  const win = windowFrom(event)
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})
ipcMain.on('window:close', (event) => windowFrom(event)?.close())
handle('window:is-maximized', (event) => windowFrom(event)?.isMaximized() ?? false)

// ---------- agent 工具层（与 mcp-server 共用同一套读写） ----------
handle('agent:list', () => agent.list().map((t) => ({ name: t.name, describe: t.describe, ready: t.ready })))
handle('agent:call', (_e, name: string, args: Record<string, unknown>) => agent.call(name, args))

// ---------- 运行器（执行任务只能在这儿做，见 runner.ts） ----------
handle('run:start', (_e, taskId: string) => runner.start(taskId, 'manual'))
handle('run:stop', () => ({ stopped: runner.stop() }))
handle('run:running', () => runner.running())
handle('run:log', (_e, runId: string, tail?: number) => vault.readRunLog(runId, tail ?? 200))

// ---------- 和引擎说话（OpenAI 兼容接口，见 assistant.ts） ----------
handle('assistant:send', (_e, text: string) => assistant.send(String(text)))
handle('assistant:stop', () => ({ stopped: assistant.stop() }))
handle('assistant:busy', () => assistant.busy())
handle('assistant:alive', () => assistant.engineAlive())

// ---------- 警（收警入口在 alerts.ts） ----------
handle('alerts:list', (_e, n?: number) => vault.listAlerts(n ?? 50))
handle('alerts:ack', (_e, id: string) => alerts.ack(id))
handle('alerts:intake', () => alerts.intakeUrl())

// ---------- 对话记录（界面看到的那些） ----------
handle('chat:load', () => vault.readChat())
handle('chat:save', (_e, turns: vault.ChatTurn[]) => vault.writeChat(turns))
  /* 开一段新对话：归档 + 清空 + 删引擎会话文件，然后重启引擎让它真的忘掉。
     ⚠️ 重启引擎不会影响正在跑的任务 —— 任务跑在主进程的 runner 里，不在引擎里。 */
  handle('chat:new', async () => {
    const r = await vault.newChat()
    await nanobot.stop().catch(() => undefined)
    await nanobot.start().catch(() => undefined)
    return r
  })
// 「打开」交给系统程序 —— xlsx 就该用 Excel 打开，我们不做表格阅读器。
// 执行类后缀（exe/bat/ps1…）在 vault.canOpenArtifact 里已经拦掉。
handle('artifact:list', () => vault.listArtifacts())
handle('artifact:read', (_e, name: string) => vault.readArtifact(String(name)))
handle('artifact:open', async (_e, name: string) => {
  try {
    const err = await shell.openPath(vault.artifactAbsPath(String(name)))
    return err ? { ok: false, error: err } : { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
})
handle('artifact:reveal', (_e, name: string) => {
  try {
    shell.showItemInFolder(vault.artifactAbsPath(String(name)))
  } catch {
    /* 找不到就不动，别弹错 */
  }
})

// ---------- 打开目录（设置页「高级」里用） ----------
// 走白名单，不接受任意路径 —— 这是「打开一个受控位置」，不是「打开任何地方」。
// 更细的引擎配置（联网搜索源 / 超时 / 记忆 / 渠道…）不在工作台里，用户自己去这个目录改。
handle('app:openFolder', async (_e, which: string) => {
  const map: Record<string, string> = { vault: vaultRoot(), nanobot: nanobot.configDir() }
  const dir = map[String(which)]
  if (!dir) return { ok: false, error: '不认识的目录' }
  try {
    await mkdir(dir, { recursive: true })
    const err = await shell.openPath(dir)
    return err ? { ok: false, error: err, path: dir } : { ok: true, path: dir }
  } catch (e) {
    return { ok: false, error: (e as Error).message, path: dir }
  }
})

// ---------- 打开外部网页（设置页「高级」里的官网 / 仓库） ----------
// 只放行 https：这是「打开一个我们写死的网址」，不是「打开任意 URL」。
// 应用自己不接受用户输入的地址，所以白名单就是协议本身。
handle('app:openUrl', async (_e, url: string) => {
  const u = String(url || '')
  if (!/^https:\/\//i.test(u)) return { ok: false, error: '只允许 https 链接' }
  try {
    await shell.openExternal(u)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
})

// ---------- 开机自启 ----------
// ⚠️ 开发模式下它指向的是 electron.exe（不是打包后的 exe），
// 所以本地试完记得关掉，不然开机时会弹一个开发窗口。
handle('app:getAutoStart', () => app.getLoginItemSettings().openAtLogin)
handle('app:setAutoStart', (_e, on: boolean) => {
  app.setLoginItemSettings({ openAtLogin: !!on })
  return app.getLoginItemSettings().openAtLogin
})

// ---------- 所有会在磁盘上落脚的位置 ----------
// 用户问「我的东西在哪」，得有一处看全的地方 —— 别让他去翻 %APPDATA%，
// 也别让日志藏在点开头的隐藏目录里（旧版的 `.workbench/` 就是这么藏的，已改名 runtime）。
handle('app:paths', () => ({
  vault: vaultRoot(),
  runtime: join(vaultRoot(), 'runtime'),
  userData: app.getPath('userData'),
  engine: nanobot.configDir(),
  derived: nanobot.runtimeConfigPath()
}))

// ---------- 构建流程（6 步，每步一道门槛） ----------
// ⚠️ 放行 / 打回 / 撤掉 **只在这里**，不挂在 MCP 工具上 ——
// 这是人和 AI 的边界，得靠接口形状守住，不能靠 AGENTS.md 里写一句「不许自己放行」。
handle('build:get', () => vault.getBuild())
handle('build:start', (_e, brief: string, title?: string) => vault.startBuild(String(brief), String(title || '')))
handle('build:pass', (_e, note?: string) => vault.passBuild(note))
handle('build:reject', (_e, note: string) => vault.rejectBuild(String(note || '')))
handle('build:reset', () => vault.resetBuild())

// ---------- 助手窗口：打开 / 关闭 / 打开并递话 ----------
ipcMain.on('agent:open', () => openAgentWindow())
ipcMain.on('agent:close', () => {
  if (agentWin && !agentWin.isDestroyed()) agentWin.close()
})
ipcMain.on('agent:openAndSend', (_e, text: string) => {
  openAgentWindow()
  // 固定引用刚打开（或复用）的那个窗口 —— 别在闭包里再读全局 agentWin，
  // 窗口在检查与发送之间被销毁重建的话，会发丢或发到新窗口。
  const win = agentWin
  if (!win || win.isDestroyed()) return
  const deliver = (): void => {
    if (!win.isDestroyed()) win.webContents.send('agent:incoming', String(text))
  }
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', deliver)
  else deliver()
})

// ---------- 桌宠：状态查询 / 拖动 / 点开助手窗口 / 形象配置 ----------
handle('pet:query', async () => {
  const build = await vault.getBuild()
  const running = runner.running()
  return {
    alive: await assistant.engineAlive(),
    busy: !!assistant.busy(),
    running: !!running,
    runningTask: running?.taskName || null,
    buildWait: !!build && build.state === 'wait',
    buildStep: build?.step ?? null,
    buildTitle: build?.title ?? null
  }
})
handle('pet:getConfig', () => getPetConfig())
handle('pet:setConfig', (_e, patch: Partial<PetConfig>) => setPetConfig(patch))
/* AI 总开关：读一次给界面，写一次顺带启停引擎 + 收放桌宠 */
handle('ai:get', () => ({ enabled: aiEnabled }))
handle('ai:set', (_e, on: unknown) => setAiEnabled(on === true))
handle('pet:cursor', () => {
  const p = screen.getCursorScreenPoint()
  /* ⚠️ getCursorScreenPoint 返回**物理像素**，而 getPosition 返回 DIP。
     高 DPI（缩放 ≠ 100%）下两者单位不一致，眼睛会算出一个巨大的偏移、永远饱和在一个角上
     —— 看起来就是「不跟鼠标」。这里除以 scaleFactor 转成 DIP。 */
  const display = screen.getDisplayNearestPoint(p)
  const scale = display.scaleFactor || 1
  return { x: p.x / scale, y: p.y / scale }
})
ipcMain.on('pet:move', (_e, x: number, y: number) => {
  if (!petWin || petWin.isDestroyed()) return
  // 渲染层传来的坐标不能全信：非有限值会打穿 setPosition
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  const [w, h] = petWin.getSize()
  const at = clampToScreen(x, y, w, h)
  petWin.setPosition(at.x, at.y)
})
handle('pet:position', () => {
  if (!petWin || petWin.isDestroyed()) return { x: 0, y: 0 }
  const [x, y] = petWin.getPosition()
  return { x, y }
})
ipcMain.on('pet:open', () => openAgentWindow())
handle('pet:layout', (_e, island: unknown) => petLayout(island === true))

// ---------- 渠道：微信 / QQ / 飞书 / 钉钉…（协议全在 nanobot 那边，我们只是遥控器）----------
handle('channels:state', () => channels.load())
handle('channels:gateway', (_e, action: unknown) =>
  channels.gatewayAction(action === 'stop' ? 'stop' : action === 'restart' ? 'restart' : 'start')
)
handle('channels:setEnabled', (_e, id: unknown, on: unknown) =>
  channels.setEnabled(String(id), on === true)
)
/* 要走表单的渠道（钉钉 / 企业微信 / QQ / Napcat）：读回来填表、写回去保存。
   微信和飞书不需要 —— 它们扫一下码引擎自己把凭据写进配置。 */
handle('channels:getConfig', (_e, id: unknown) => channels.getConfig(String(id)))
handle('channels:setConfig', (_e, id: unknown, patch: unknown) =>
  channels.setConfig(String(id), (patch || {}) as Record<string, unknown>)
)
/* 扫码登录是**流式**的：进程要一直活到扫完，中途把二维码一坨坨推给界面。
   所以这里用 invoke 启动 + send 回推，而不是等它跑完。
   `force` = 跳过盘上已有的凭据重新扫（已经登过的账号不加这个就不会再出码）。 */
handle('channels:loginStart', (e, id: unknown, force: unknown) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  return channels.loginStart(
    String(id),
    (msg) => {
      if (win && !win.isDestroyed()) win.webContents.send('channels:login', msg)
    },
    force === true
  )
})
ipcMain.on('channels:loginStop', () => channels.loginStop())

/* 配对：谁可以跟助手说话。
   陌生私聊引擎只会回一个配对码、**不回答**（`is_allowed()` 不过就直接 return），
   而那个码只能拿去 WebUI 或另一个已配对的会话里批 —— 第一次接的人两样都没有，
   于是「发消息没人理」。这里把那条路摆到工作台上。 */
handle('pairing:state', async () => {
  const st = await channels.load()
  return channels.pairingState(st.channels.map((c) => c.id))
})
handle('pairing:act', (_e, action: unknown, channel: unknown, arg: unknown) =>
  channels.pairingAct(
    action === 'revoke' ? 'revoke' : action === 'deny' ? 'deny' : 'approve',
    String(channel ?? ''),
    String(arg ?? '')
  )
)

/* ---------- 界面主题：渲染层把它的选择同步过来 ----------
 * 只用于闪屏（见 themePref）。写入是幂等的 —— 主题没变就直接返回，不重复写盘。 */
handle('app:setTheme', async (_e, t: unknown) => {
  const next: ThemeMode = t === 'dark' || t === 'system' ? t : 'light'
  if (next === themePref) return { theme: next }
  themePref = next
  try {
    await writeFile(uiConfigPath(), JSON.stringify({ theme: next }), 'utf8')
  } catch {
    /* 写不进去就本次会话内生效 */
  }
  return { theme: next }
})

// ---------- 出站推送：任务自己跑完了怎么告诉你 ----------
/* ⚠️ 这里**没有任何平台协议** —— 走的是 nanobot 自带的 `/trigger`：
   在微信/飞书里发一句 `/trigger 工作台`，它给那个会话建一条本地触发器并回一个 ID，
   我们只负责记下这个 ID、在该说的时候 `nanobot trigger <ID> "话"`（见 agent/push.ts）。
   所以不需要额外的密钥、不需要每个平台各写一套。 */
handle('push:state', () => push.state())
handle('push:set', (_e, triggerId: unknown) => push.setBound(String(triggerId ?? '')))
handle('push:test', (_e, text?: unknown) =>
  push.send(String(text || '来自自动化工作台的测试消息 —— 收到说明推送通了。'))
)
ipcMain.on('app:quit', () => {
  quitting = true
  app.quit()
})

// ---------- 界面直通管道：渲染进程干完活交回结果 ----------
ipcMain.on('agent:uiResult', (_e, payload: { callId: string; result: unknown }) => {
  uiBridge.settle(payload.callId, payload.result)
})

// ---------- nanobot 引擎管家 ----------
handle('engine:status', () => nanobot.status())
handle('engine:start', () => nanobot.start())
handle('engine:stop', () => nanobot.stop())
handle('engine:restart', () => nanobot.restart())
handle('engine:install', () => nanobot.install())
handle('engine:settings', () => nanobot.engineSettings())
handle('engine:saveSettings', (_e, patch: Record<string, unknown>) => nanobot.saveSettings(patch))
handle('engine:logs', () => nanobot.logs())
handle('engine:bootstrap', () => nanobot.bootstrap())

app.whenReady()
  .then(async () => {
  // 库根：环境变量优先（mcp-server 被引擎拉起时由 ensureMcpServer 传入），
  // 否则落在用户数据目录，保证打包后可写。
  process.env.WORKBENCH_VAULT = vaultRoot()
  await vault.ensureSeed()

  // 派生配置（库根 / 工具白名单 / 搜索源）在**启动时就写一份**。
  // 本来只在引擎启动时写，那样磁盘上那份可能是陈旧的 —— 排查问题时会被它骗。
  // 写失败不该拦住启动：引擎启动时还会再写一次。
  try {
    nanobot.refreshRuntimeConfig()
  } catch (e) {
    console.error(`[nanobot] 派生配置没写成：${(e as Error).message}`)
  }

  // 让 agent（MCP 子进程）能通过管道请主进程代跑
  runner.registerOps()

  // 运行事件 → 界面（实时输出、退出码、耗时）
  runner.onEvent((e) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('run:event', e)
    }
    /* 跑完/跑挂了 → 该推送就推送。**只推定时跑的那一次**（理由见 push.ts）：
       手动跑你本人就在机器前面，推到手机上只是噪音。 */
    if (e.type === 'exit') void push.notifyRun(e)
  })

  // 对话事件 → 界面（流式文字、工具调用、出错）
  assistant.onEvent((e) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('assistant:event', e)
    }
  })

  // 收警入口：本机 HTTP，给外部告警系统打（nanobot 不自带 webhook）
  alerts.listen()
  alerts.onEvent((e) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('alerts:event', e)
    }
  })

  /* ⚠️ 主题要在**建闪屏之前**读出来 —— 它的颜色是建窗那一刻就定下的。
     它只是一个 100 字节的小文件，阻塞这点时间换「开机动画不跑色」值得。 */
  await loadThemePref()
  /* 闪屏先出来垫着，主窗口在它后面慢慢加载。
     顺序不能反：createWindow 里是 `show: false`，先建它不会挡住闪屏。 */
  createSplash()
  createWindow()
  /* 桌宠默认不建。开不开是用户自己的事 —— 一开机就占掉桌面一块，
     对一个「工具」来说太主动了。 */
  await loadAiEnabled()
  applyPetEnabled(await getPetConfig())
  /* 托盘放在 AI 开关之后 —— 菜单里那一勾是 `桌宠开关 && AI 开关`，
     得等两个值都读出来才是对的。 */
  await createTray()

  /* 打开应用就把引擎拉起来 —— 用户不用再手动起 nanobot。
     ⚠️ AI 关着就**不拉**：这个开关的全部意义就是「这台机器不跑 Python 引擎、
        不碰外部模型」。启了再停也算启过，而且白吃几十兆内存。 */
  if (aiEnabled) {
    void nanobot.start().catch((e) => {
      console.error('[nanobot] 启动失败：', e)
    })
  } else {
    console.log('[AI] 已关闭 —— 不启引擎，只跑自动化')
  }

  // 探一次本机 Python 环境写进 MEMORY.md。**不 await** —— pip list 要跑一两秒，
  // 别让它挡住开窗；助手第一次回话时它早就写好了。
  void nanobot.refreshEnvDoc()

  // 调度器：到点自己跑，不用人点
  scheduler.start((msg) => console.log(`[调度] ${msg}`))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  })
  .catch((e) => {
    console.error('[main] 启动失败：', e)
  })

app.on('before-quit', () => {
  /* ⚠️ 必须在最前面置位：`close` 拦截会把退出请求也吃掉。
     少了这一句，托盘菜单点「退出」会没反应 —— 因为主窗口的 close 又被拦成 hide。 */
  quitting = true
})

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return
  /* 有托盘就别退：关窗只是收起来了（见 createWindow 的 close 拦截），
     这时候退出等于把定时任务一起停掉。**没有**托盘（托盘没建起来）才按老规矩退 ——
     否则会留下一个既没有窗口也没有图标的进程，只能去任务管理器杀。 */
  if (tray && !tray.isDestroyed()) return
  app.quit()
})

app.on('will-quit', () => {
  splashWin?.destroy()
  splashWin = null
  tray?.destroy()
  tray = null
  scheduler.stop()
  assistant.stop()
  alerts.close()
  runner.killSync() // 别把跑着的采集器留成孤儿进程
  nanobot.killSync()
  uiBridge.close()
})

