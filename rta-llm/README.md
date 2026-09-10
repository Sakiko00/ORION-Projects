# RTA-LLM

> 基于反思性主题分析法（Reflective Thematic Analysis, RTA）的 AI 质性研究桌面工具

RTA-LLM 借助大语言模型（LLM）自动执行 RTA 六阶段分析流程，帮助研究人员快速完成质性数据的主题分析。支持一键全流程分析与单阶段分析，结果实时渲染为 Markdown。

## 功能特性

- 🎯 **RTA 六阶段全流程**: 数据熟悉 → 初始编码 → 主题构建 → 主题审视 → 主题定义 → 报告撰写
- 🤖 **多模型支持**: OpenAI、Claude、Gemini、DeepSeek、Kimi、豆包、MiniMax、自定义 OpenAI 兼容接口、本地 Mock
- ⚙️ **灵活配置**: 自定义模型、温度、Max Tokens、系统提示词，配置界面一键测试连接
- 📊 **Markdown 可视化**: 实时渲染分析结果，支持代码高亮
- 🔄 **异步任务**: 任务队列后台执行，进度实时推送（Socket.IO）
- 📁 **数据管理**: 上传 / 查看 / 删除研究数据文件
- 📋 **历史记录**: 分析记录自动保存，支持全文预览与删除
- 📤 **Word 导出**: 将分析结果导出为 Word 文档
- 🖥️ **桌面应用**: Electron 封装，Windows 安装包一键安装，本地数据不上传服务器

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面外壳 | Electron 33 + electron-builder (NSIS) |
| 后端 | NestJS 10 (TypeScript) + TypeORM + SQLite (better-sqlite3) |
| 前端 | Next.js 14 (App Router, 静态导出) + React 18 + Tailwind CSS 3 |
| 状态管理 | Zustand 5 |
| LLM 调用 | openai SDK 6（兼容多平台） |
| 实时通信 | Socket.IO |
| 文档导出 | docx |

## 快速开始

### 环境要求

- Node.js >= 18
- npm

### 开发模式

```bash
# 安装依赖（根目录 + 前后端）
npm install
cd frontend && npm install
cd ../backend && npm install

# 启动前后端（开发模式）
cd frontend && npm run dev   # 前端: http://localhost:3000
cd backend && npm run start:dev  # 后端: http://localhost:4000
```

前端开发模式下通过 `next.config.mjs` 中的 rewrite 将 `/api` 代理到后端。

### 生产构建与打包

```bash
# 构建前端静态产物 + 后端编译产物
npm run build:frontend   # frontend/out
npm run build:backend    # backend/dist

# 一键打包桌面安装包（自动构建前后端并生成 NSIS 安装程序）
node scripts/build-package.js
# 产物: release/RTA-LLM Setup <version>.exe
```

## 项目结构

```
rta-llm/
├── electron/            # Electron 主进程（窗口管理、后端进程调度）
│   ├── main.js
│   ├── preload.js
│   └── loading.html
├── backend/             # NestJS 后端
│   ├── src/
│   │   ├── modules/     # task / llm / analysis / data / config 模块
│   │   ├── entities/    # Task / DataFile / LlmConfig
│   │   └── main.ts      # 入口：10MB body 限制、CORS、全局过滤器
│   └── package.json
├── frontend/            # Next.js 前端
│   ├── src/
│   │   ├── app/         # 页面（仪表盘/分析/历史/设置）
│   │   ├── components/  # 组件（Sidebar、MarkdownRenderer 等）
│   │   ├── stores/      # Zustand 状态
│   │   ├── lib/         # api、导出、主题
│   │   └── types/       # 类型定义
│   └── package.json
├── scripts/             # 构建 / 打包脚本
└── docs/                # 技术文档、架构文档、用户手册
```

## 主要 API

### 任务管理
- `POST /api/tasks` - 创建任务
- `GET /api/tasks` - 任务列表
- `GET /api/tasks/:id` - 任务详情
- `PATCH /api/tasks/:id` - 更新任务
- `DELETE /api/tasks/:id` - 删除任务

### LLM 配置
- `GET /api/llm/config` - 获取配置
- `POST /api/llm/config` - 保存配置
- `POST /api/llm/test` - 测试连接

### 分析流程
- `POST /api/analysis/familiarize` - 数据熟悉
- `POST /api/analysis/code` - 初始编码
- `POST /api/analysis/themes` - 主题构建
- `POST /api/analysis/review` - 主题审视
- `POST /api/analysis/define` - 主题定义
- `POST /api/analysis/report` - 报告撰写

### 数据管理
- `POST /api/data/upload` - 上传文件
- `GET /api/data/files` - 文件列表
- `GET /api/data/files/:id` - 文件内容
- `DELETE /api/data/files/:id` - 删除文件

## 文档

- [用户手册](docs/USER_MANUAL.md)
- [技术文档](docs/TECHNICAL.md)
- [架构文档](docs/ARCHITECTURE.md)

## 安全与隐私

- API Key 仅保存在本地 SQLite 数据库（`backend/data/rta.db`），不上传任何服务器
- Electron 开启 `contextIsolation`、关闭 `nodeIntegration`
- 日志输出不会包含 API Key

## License

[MIT](LICENSE)
