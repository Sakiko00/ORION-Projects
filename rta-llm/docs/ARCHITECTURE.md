# RTA-LLM 架构文档

> 版本: 1.0.0 | 最后更新: 2026-05-13

---

## 1. 总体架构

```
┌──────────────────────────────────────────────────────────┐
│                    RTA-LLM 桌面应用                        │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │              Electron Shell (main.js)               │  │
│  │  - 窗口生命周期管理                                   │  │
│  │  - 后端进程 spawn/kill                               │  │
│  │  - IPC 通信桥接                                       │  │
│  │  - 日志系统 (文件+控制台)                              │  │
│  └──────────────┬───────────────────────┬──────────────┘  │
│                 │                       │                  │
│    ┌────────────▼──────────┐  ┌────────▼─────────────┐   │
│    │   Backend (NestJS)    │  │  Frontend (Next.js)   │   │
│    │   localhost:4000      │  │  localhost:4000       │   │
│    │                       │  │  (静态文件，由后端托管)  │   │
│    │  ┌─────────────────┐  │  │                       │   │
│    │  │ Analysis Module │  │  │  ┌─────────────────┐  │   │
│    │  │ (RTA 分析引擎)   │  │  │  │ Dashboard Page  │  │   │
│    │  └────────┬────────┘  │  │  │ Analysis Page   │  │   │
│    │  ┌────────▼────────┐  │  │  │ History Page    │  │   │
│    │  │   LLM Module    │  │  │  │ Settings Page   │  │   │
│    │  │ (多平台 LLM 调用) │  │  │  └─────────────────┘  │   │
│    │  └─────────────────┘  │  │                       │   │
│    │  ┌─────────────────┐  │  │   Zustand Stores      │   │
│    │  │  Task Module    │  │  │   (config / task)     │   │
│    │  └─────────────────┘  │  │                       │   │
│    │  ┌─────────────────┐  │  │   Axios HTTP Client   │   │
│    │  │ Config Module   │  │  │                       │   │
│    │  └─────────────────┘  │  │   Socket.IO Client    │   │
│    │  ┌─────────────────┐  │  └───────────────────────┘   │
│    │  │  Data Module    │  │                               │
│    │  └─────────────────┘  │                               │
│    │  ┌─────────────────┐  │                               │
│    │  │  TypeORM/SQLite  │  │                               │
│    │  │  (data/rta.db)   │  │                               │
│    │  └─────────────────┘  │                               │
│    └───────────────────────┘                               │
└──────────────────────────────────────────────────────────┘
```

---

## 2. 进程架构

```
┌──────────────────────────────────────────────────┐
│                  主进程 (Main Process)              │
│  electron/main.js                                 │
│  - BrowserWindow 管理                              │
│  - child_process.spawn(node, backend/dist/main)   │
│  - IPC 处理                                        │
│  - 日志写入 (%APPDATA%/RTA-LLM/logs/)              │
└─────────┬──────────────────────┬─────────────────┘
          │                      │
          │ spawn                │ BrowserWindow
          ▼                      ▼
┌──────────────────┐   ┌──────────────────────┐
│ 后端子进程 (Node)  │   │ 渲染进程 (Chromium)   │
│ NestJS HTTP       │   │ Next.js SPA          │
│ :4000             │──▶│ loadURL(:4000)       │
│ Socket.IO         │   │ Zustand / Axios      │
└──────────────────┘   └──────────────────────┘
```

### 2.1 启动时序

```
t=0ms    主窗口创建，加载 data: URL (loading 页)，ready-to-show 后显示
t=300ms  boot() 启动
          → initLogger() — 初始化日志文件
          → showLoading(1) — "正在检查运行环境…"
          → findNodeExecutable() — 查找 node.exe
          → resolveBackendPath() — 查找 backend/dist/main.js
          → spawn(node, [main.js]) — 启动 NestJS
t=2-10s  后端启动中，stdout 监听 "running on" 信号
          → showLoading(2) — "后端服务已启动"
t=11-25s waitForServer() — 轮询 /api/llm/config (最多15次)
          → showLoading(3) — "等待服务就绪…"
t=26s    HTTP 200 → showLoading(4) — "正在加载应用…"
t=27s    mainWindow.loadURL(http://localhost:4000) → 前端界面
```

**设计原则**: 窗口0ms出现，后端异步启动，永不阻塞主流程。任何错误都不会导致窗口不显示 — 错误信息显示在 loading 页中。

---

## 3. 前端架构

```
frontend/src/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # 根布局
│   │   ├── <Sidebar />         #   左侧导航
│   │   └── <main>{children}    #   右侧内容区
│   ├── page.tsx                # / → 仪表盘
│   ├── analysis/page.tsx       # /analysis → 分析页面
│   ├── history/page.tsx        # /history → 历史记录
│   └── settings/page.tsx       # /settings → 配置页面
├── components/
│   └── layout/
│       └── Sidebar.tsx         # 侧边栏导航组件
├── stores/                     # Zustand 状态管理
│   ├── configStore.ts          # LLM 配置状态 (persist)
│   └── taskStore.ts            # 任务列表状态
├── lib/
│   └── api.ts                  # Axios HTTP 客户端
└── types/
    └── rta.ts                  # TypeScript 类型定义
```

### 3.1 数据流

```
┌──────────────┐   HTTP (Axios)    ┌──────────────┐
│  Zustand     │ ◄───────────────► │  NestJS API   │
│  Store       │                   │  :4000        │
│  ┌────────┐  │                   │               │
│  │config  │  │   socket.io       │  WebSocket    │
│  │task    │  │ ◄──────────────── │  (进度推送)    │
│  └────────┘  │                   │               │
└──────┬───────┘                   └───────────────┘
       │
       │ React Context
       ▼
┌──────────────┐
│  Pages/      │
│  Components  │
└──────────────┘
```

### 3.2 构建模式

```javascript
// next.config.mjs
{
  output: 'export',      // 静态导出 (SSG)
  trailingSlash: true,   // 目录尾斜杠
  images: { unoptimized: true }
}
```

前端以静态导出模式构建，产物放在 `frontend/out/`，然后复制到 `backend/frontend-out/`，由 NestJS 的 `ServeStaticModule` 托管。

---

## 4. 后端架构

### 4.1 模块依赖图

```
AppModule
├── ConfigModule (NestJS)
├── TypeOrmModule.forRoot()  → SQLite (data/rta.db)
├── ServeStaticModule        → frontend-out/ (静态文件)
├── TaskModule
│   ├── TaskController (/api/task)
│   └── TaskService
│       └── TypeOrmRepository<Task>
├── LlmModule
│   ├── LlmController
│   └── LlmService
│       ├── callOpenAICompatible() → OpenAI / Kimi / 豆包 / Custom
│       ├── callDeepSeek()         → DeepSeek
│       ├── callClaude()           → Anthropic
│       ├── callGemini()           → Google
│       ├── callMiniMax()          → MiniMax
│       └── mockChat()             → 本地模拟
├── AnalysisModule
│   ├── AnalysisController (/api/analysis)
│   └── AnalysisService
│       ├── executeFullFlow()      → 串行执行6阶段
│       └── executePhase()         → 单阶段执行
│           └── LlmService.chat()
├── ConfigModule
│   ├── ConfigController (/api/llm)
│   └── ConfigService
│       └── TypeOrmRepository<LlmConfig>
└── DataModule
    ├── DataController (/api/data)
    └── DataService
        └── TypeOrmRepository<DataFile>
```

### 4.2 RTA 分析流程

```
executeFullFlow(request)
│
├── Phase 1: familiarize  ──→ LlmService.chat()
│   System: "熟悉研究数据，识别主要主题..."
│   User: 原始数据
│
├── Phase 2: code  ──→ LlmService.chat()
│   System: "对文本进行系统编码..."
│   User: Phase 1 输出
│
├── Phase 3: themes  ──→ LlmService.chat()
│   System: "将编码聚类为潜在主题..."
│   User: Phase 2 输出
│
├── Phase 4: review  ──→ LlmService.chat()
│   System: "审视和优化已构建的主题..."
│   User: Phase 3 输出
│
├── Phase 5: define  ──→ LlmService.chat()
│   System: "为主题定义清晰的边界..."
│   User: Phase 4 输出
│
├── Phase 6: report  ──→ LlmService.chat()
│   System: "撰写完整的研究分析报告..."
│   User: Phase 5 输出
│
└── 合并所有阶段结果 → 保存到 task.result → 返回
```

### 4.3 全局配置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 端口 | 4000 | 可通过 PORT 环境变量覆盖 |
| CORS | localhost:3000 | 开发模式跨域 |
| 数据库 | data/rta.db | SQLite 文件路径 |
| 静态文件 | frontend-out/ | 前端构建产物 |
| API 前缀 | /api/* | 排除静态托管 |

---

## 5. 通信架构

```
┌─────────────────────────────────────────────────┐
│              Electron Main Process               │
│                                                  │
│  spawn(backend/dist/main.js)                     │
│       │                                          │
│       │ stdout/stderr pipe → log file            │
│       ▼                                          │
│  ┌──────────┐                                    │
│  │ Backend  │←── HTTP:4000 ──→ Renderer Process  │
│  │ Process  │←── WebSocket ──→ Renderer Process  │
│  └──────────┘                                    │
│       │                                          │
│       │ exit code → reject/restart               │
│       ▼                                          │
│  before-quit → SIGTERM → SIGKILL                 │
└─────────────────────────────────────────────────┘
```

### 5.1 通信协议

| 协议 | 用途 | 方向 |
|------|------|------|
| HTTP (Axios) | RESTful CRUD 操作 | 前端 → 后端 |
| HTTP (Axios) | LLM 配置、文件上传 | 前端 → 后端 |
| WebSocket (Socket.IO) | 分析进度实时推送 | 后端 → 前端 |
| IPC (Electron) | 窗口事件、系统调用 | 渲染进程 ↔ 主进程 |
| stdout/stderr pipe | 后端日志 | 后端 → 主进程 → 文件 |

---

## 6. 打包架构

```
npm run build:package
│
├── [1/7] 清理旧构建
├── [2/7] 准备 Node.js 便携版
│         └── 复制系统 node.exe → node-portable/
├── [3/7] 检查后端依赖 (npm install)
├── [4/7] 构建前端 (npx next build) → frontend/out/
├── [4.5/7] 复制 frontend/out → backend/frontend-out/
├── [5/7] 构建后端 (npx nest build) → backend/dist/
├── [6/8] 验证构建产物
└── [8/8] electron-builder → NSIS 安装包

release/
└── RTA-LLM Setup 1.0.0.exe    (~160 MB)
    ├── win-unpacked/          # 未打包的应用程序
    │   ├── RTA-LLM.exe        # Electron 可执行文件
    │   ├── resources/
    │   │   ├── app.asar       # Electron 代码
    │   │   ├── backend/       # 后端完整包
    │   │   │   ├── dist/          # 编译后的 JS
    │   │   │   ├── frontend-out/  # 前端静态文件
    │   │   │   ├── node_modules/  # 后端依赖
    │   │   │   └── package.json
    │   │   └── node-portable/ # 便携 Node.js
    │   │       └── node.exe
    │   └── ...
    └── NSIS 安装脚本           # 用户选择安装路径
```

---

## 7. 安全设计

| 措施 | 实现 |
|------|------|
| API Key 存储 | SQLite 本地数据库，不上传服务器 |
| 窗口隔离 | `contextIsolation: true, nodeIntegration: false` |
| 沙盒模式 | `sandbox: false`（需访问 Node.js 子进程） |
| 日志脱敏 | API Key 不会出现在日志输出中 |
| 自签跳过 | `signAndEditExecutable: false`（内部分发） |
