import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AgentWindow } from './components/AgentWindow'
import { PetWidget } from './components/PetWidget'
import { installUiBridge } from './agent/bridge'
import { installBrowserWorkbench } from './browser-workbench'
import './styles/tokens.css'
import './styles/app.css'
import './styles/blocks.css'
import './styles/md.css'

// 界面直通管道：让 agent 能像人一样点界面
installUiBridge()

// 浏览器标签页没有 preload 桥 → 注入 fetch 版替身（读同一份 vault，能预览整体功能）
installBrowserWorkbench()

// 同一个 renderer 三种身份：
//   主窗口 = App；`?agent=1` = 独立助手窗口；`?pet=1` = 桌面桌宠
// ⚠️ 闪屏**不再是这里的第四种身份**（它要等整个 bundle 跑完才能画，那样窗口会先空一块）——
//    现在是 main 里一段自带的 HTML，见 `SPLASH_HTML`。
const search = new URLSearchParams(window.location.search)
const kind = search.has('agent') ? 'agent' : search.has('pet') ? 'pet' : 'app'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {kind === 'agent' ? <AgentWindow /> : kind === 'pet' ? <PetWidget /> : <App />}
  </React.StrictMode>
)
