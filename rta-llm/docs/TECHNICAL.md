# RTA-LLM 技术文档

> 版本: 1.0.0 | 最后更新: 2026-05-13

---

## 1. 项目概述

RTA-LLM 是一个基于反思性主题分析法（Reflective Thematic Analysis, RTA）的质性研究自动化工具。它借助大语言模型（LLM）自动执行 RTA 六阶段分析流程，帮助研究人员高效完成质性数据分析。

### 1.1 技术栈

| 层级 | 技术 |
|------|------|
| 桌面外壳 | Electron 33 |
| 打包工具 | electron-builder 25 (NSIS) |
| 后端框架 | NestJS 10 (TypeScript) |
| 前端框架 | Next.js 14 (App Router, Static Export) |
| UI 库 | React 18, Tailwind CSS 3, anime.js, Lucide Icons, Recharts |
| 数据库 | SQLite (better-sqlite3) via TypeORM |
| 状态管理 | Zustand 5 (persist middleware) |
| LLM 调用 | openai SDK 6 (兼容多平台) |
| 实时通信 | Socket.IO (WebSocket) |
| 样式方案 | Tailwind CSS + 自定义深色主题 |
| 开发工具 | concurrently, ESLint, Prettier, Jest |

### 1.2 支持的 LLM 平台

| 平台 | 调用方式 |
|------|----------|
| OpenAI | 原生 OpenAI SDK |
| Claude (Anthropic) | 自定义 HTTP 请求 |
| Gemini (Google) | 自定义 HTTP 请求 |
| DeepSeek | OpenAI 兼容接口 |
| Kimi (Moonshot) | OpenAI 兼容接口 |
| 豆包 (Doubao/ByteDance) | OpenAI 兼容接口 |
| MiniMax | 自定义 HTTP 请求 |
| 自定义接口 | OpenAI 兼容接口 (自定义 endpoint) |
| Mock | 本地模拟 (无需 API Key) |

---

## 2. 项目结构

```
first-project/
├── package.json              # 根项目配置 (electron-builder)
├── electron/                  # Electron 主进程
│   ├── main.js                # 主进程入口：窗口管理、后端启动
│   ├── preload.js             # 预加载脚本 (IPC 桥接)
│   ├── loading.html           # 内联加载页面 (data: URL)
│   └── splash.html            # 启动画面 (已废弃)
├── backend/                   # NestJS 后端
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── main.ts            # 后端入口：端口监听、全局中间件
│   │   ├── app.module.ts      # 根模块：数据库、静态文件、路由
│   │   ├── entities/          # TypeORM 实体
│   │   │   ├── task.entity.ts
│   │   │   ├── llm-config.entity.ts
│   │   │   └── data-file.entity.ts
│   │   └── modules/
│   │       ├── task/          # 任务管理
│   │       │   ├── task.module.ts
│   │       │   ├── task.service.ts
│   │       │   └── task.controller.ts
│   │       ├── llm/           # LLM 调用
│   │       │   ├── llm.module.ts
│   │       │   ├── llm.service.ts
│   │       │   └── llm.controller.ts
│   │       ├── analysis/      # RTA 分析引擎
│   │       │   ├── analysis.module.ts
│   │       │   ├── analysis.service.ts
│   │       │   └── analysis.controller.ts
│   │       ├── config/        # 配置管理
│   │       │   ├── config.module.ts
│   │       │   ├── config.service.ts
│   │       │   └── config.controller.ts
│   │       └── data/          # 数据文件管理
│   │           ├── data.module.ts
│   │           ├── data.service.ts
│   │           └── data.controller.ts
│   ├── frontend-out/          # 前端构建产物 (自动生成)
│   └── data/                  # SQLite 数据库文件 (运行时)
│       └── rta.db
├── frontend/                  # Next.js 前端
│   ├── package.json
│   ├── next.config.mjs        # static export 配置
│   ├── tailwind.config.ts
│   └── src/
│       ├── app/               # App Router 页面
│       │   ├── layout.tsx     # 根布局 (Sidebar + Content)
│       │   ├── page.tsx       # 仪表盘首页
│       │   ├── analysis/      # 分析页面
│       │   ├── history/       # 历史记录
│       │   └── settings/      # 配置页面
│       ├── components/        # UI 组件
│       │   └── layout/
│       │       └── Sidebar.tsx
│       ├── stores/            # Zustand 状态
│       │   ├── configStore.ts
│       │   └── taskStore.ts
│       ├── lib/               # API 客户端
│       │   └── api.ts
│       └── types/             # TypeScript 类型
│           └── rta.ts
├── scripts/
│   └── build-package.js       # 一键构建打包脚本
├── node-portable/             # 便携式 Node.js (运行时)
│   └── node.exe
├── release/                   # 打包产物 (自动生成)
│   └── RTA-LLM Setup 1.0.0.exe
└── docs/                      # 文档
    ├── TECHNICAL.md           # 技术文档 (本文件)
    ├── ARCHITECTURE.md        # 架构文档
    └── USER_MANUAL.md         # 用户手册
```

---

## 3. 环境要求

### 3.1 开发环境

| 工具 | 最低版本 |
|------|----------|
| Node.js | 18.0.0+ |
| npm | 9.0.0+ |
| Windows | 10 / 11 (x64) |

### 3.2 运行环境（打包后）

- Windows 10 / 11 (x64)
- 无需安装 Node.js（已内置便携版）

---

## 4. 快速开始

### 4.1 开发模式

```bash
# 1. 安装依赖
cd backend && npm install
cd ../frontend && npm install
cd ..

# 2. 启动开发服务器 (前后端同时)
npm run dev
# 前端: http://localhost:3000
# 后端: http://localhost:4000
```

### 4.2 生产构建

```bash
# 完整构建 + NSIS 打包
npm run build:package
```

### 4.3 仅构建

```bash
npm run build   # 构建前后端，不打包
```

---

## 5. API 接口

### 5.1 LLM 配置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/llm/config` | 获取当前 LLM 配置 |
| POST | `/api/llm/config` | 保存 LLM 配置 |

### 5.2 任务管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/task` | 获取所有任务 |
| GET | `/api/task/:id` | 获取单个任务 |
| POST | `/api/task` | 创建任务 |
| PUT | `/api/task/:id` | 更新任务 |
| DELETE | `/api/task/:id` | 删除任务 |

### 5.3 数据分析

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/analysis/full` | 执行全流程 RTA 分析 (6阶段) |
| POST | `/api/analysis/familiarize` | 数据熟悉阶段 |
| POST | `/api/analysis/code` | 初始编码阶段 |
| POST | `/api/analysis/themes` | 主题构建阶段 |
| POST | `/api/analysis/review` | 主题审视阶段 |
| POST | `/api/analysis/define` | 主题定义阶段 |
| POST | `/api/analysis/report` | 报告撰写阶段 |
| GET | `/api/analysis/results/:taskId` | 获取分析结果 |

### 5.4 数据文件

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/data/upload` | 上传数据文件 |
| GET | `/api/data/files` | 获取所有文件 |
| GET | `/api/data/files/:id` | 获取单个文件 |
| DELETE | `/api/data/files/:id` | 删除文件 |

---

## 6. 数据库

### 6.1 技术选择

- **数据库**: SQLite (better-sqlite3)
- **ORM**: TypeORM 0.3
- **同步策略**: `synchronize: true` (开发/单机模式)

### 6.2 数据模型

#### Task (任务)
```typescript
{
  id: string (UUID)
  name: string
  description?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  phase: 'familiarize' | 'code' | 'themes' | 'review' | 'define' | 'report' | 'full'
  progress: number (0-100)
  config: JSON { provider, model, apiKey, ... }
  dataFileId?: string
  result?: JSON { phase, content, summary, metadata }
  error?: string
  createdAt: Date
  updatedAt: Date
  completedAt?: Date
}
```

#### LlmConfig (配置)
```typescript
{
  id: number (auto-increment)
  provider: string
  model: string
  apiKey: string
  apiEndpoint?: string
  temperature: number
  maxTokens: number
  topP?: number
  systemPrompt?: string
  skipGenerationParams?: boolean
  updatedAt: Date
}
```

#### DataFile (数据文件)
```typescript
{
  id: string (UUID)
  name: string
  type: string
  size: number
  content?: string
  uploadedAt: Date
}
```

---

## 7. RTA 六阶段分析流程

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ 1. 数据熟悉   │ -> │ 2. 初始编码   │ -> │ 3. 主题构建   │
│ Familiarize  │    │ Code         │    │ Themes       │
└──────────────┘    └──────────────┘    └──────────────┘
       ↓                                      ↓
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ 6. 报告撰写   │ <- │ 5. 主题定义   │ <- │ 4. 主题审视   │
│ Report       │    │ Define       │    │ Review       │
└──────────────┘    └──────────────┘    └──────────────┘
```

每个阶段的输出作为下一阶段的输入，形成完整分析链。

---

## 8. Electron 打包配置

### 8.1 electron-builder 配置 (package.json)

```json
{
  "build": {
    "appId": "com.rta-llm.app",
    "productName": "RTA-LLM",
    "directories": { "output": "release" },
    "files": ["electron/**/*"],
    "extraResources": [
      { "from": "backend/dist",        "to": "backend/dist" },
      { "from": "backend/frontend-out", "to": "backend/frontend-out" },
      { "from": "backend/node_modules", "to": "backend/node_modules" },
      { "from": "backend/package.json", "to": "backend/package.json" },
      { "from": "node-portable",       "to": "node-portable" }
    ],
    "asarUnpack": ["**/*.node", "**/better-sqlite3/**", "**/sqlite3/**"],
    "win": { "target": { "target": "nsis", "arch": "x64" } },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true
    }
  }
}
```

### 8.2 启动流程 (main.js)

```
app.whenReady()
  → createMainWindow()           ← 窗口先显示 (loading 页)
  → boot()
    → initLogger()               ← 日志记录
    → startBackend()             ← 启动 NestJS (spawn node.exe)
    → waitForServer()            ← 轮询 /api/llm/config
    → showLoading(4)             ← 加载应用 UI
    → mainWindow.loadURL(APP_URL) ← 切换到 localhost:4000
```

关键设计原则：
- **窗口先行**: 立即创建窗口显示 loading 页，不做任何阻塞
- **内联 HTML**: loading 页使用 `data:text/html` URL，零文件依赖
- **内置 Node.js**: `node-portable/node.exe` 随打包文件分发
- **日志全量**: 所有启动过程写入 `%APPDATA%\RTA-LLM\logs\`

---

## 9. 常见问题

### 9.1 打包时 GitHub 下载失败

设置国内镜像：
```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
```

### 9.2 后端启动后前端 500

检查 `%APPDATA%\RTA-LLM\logs\` 日志，最常见原因是 `frontend-out` 目录找不到 — 确认 `backend/frontend-out/` 存在且包含 `index.html`。

### 9.3 数据库文件丢失

`backend/src/main.ts` 在启动时会自动创建 `data/` 目录，首次运行时 SQLite 会自动创建数据库文件。
