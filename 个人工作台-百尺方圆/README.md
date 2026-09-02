# 个人工作台 · 百尺方圆

> ORION 团队 `ORION-Projects` monorepo 中的独立项目之一，顶层目录即**项目边界**，与本仓库其他项目相互隔离。

一个本地优先的个人效率工作台桌面应用：把**每日计划 / 待办、习惯打卡、记账、长期目标、灵感记录**整合到一个界面，并内置一个基于 **nanobot (MCP Host)** 的 AI 助理（`百尺方圆`），负责读写本地 JSON 数据帮你管理日常事务。

## 技术栈

- 前端：单文件 `workbench-desktop.html`（HTML5 + CSS3 + 原生 ES6，localStorage）
- 后端：Python 标准库 `http.server`（`serve.py`，本地服务 + AI 服务启停管理）
- 桌面入口：`app.py`（启动本地页面服务并拉起浏览器窗口）
- Agent 引擎：nanobot（MCP Host，OpenAI 兼容 API），独立安装，不随本仓库分发
- 打包：PyInstaller（`BaiChiWorkbench.spec`）

## 如何运行（开发模式）

需要一个可用的 [nanobot](https://nanobot.ai)（MCP Host）可执行文件，并按需把它所在目录加入 `PATH`（或 uv tool 安装后由脚本自动探测）。

```powershell
python serve.py                  # 启动本地页面服务，浏览器访问 http://localhost:8899
python app.py                    # 桌面模式：起服务并打开应用窗口
```

> 注意：本仓库**不随附任何 API 密钥 / 本地运行配置**。使用 AI 助理前，请自行在设置页或 nanobot 配置中填入你的模型 API Key（如 DeepSeek / OpenAI 兼容端点等），不要提交真实密钥到仓库。

## 打包为桌面应用

安装 PyInstaller 后执行 `pyinstaller BaiChiWorkbench.spec --noconfirm`，产物位于 `dist/BaiChiWorkbench.exe`（自包含前端，无需另行安装依赖）。

## 参与贡献

- 遵循仓库根 `README.md` 的 monorepo 约定：改动限定在本目录内，不跨项目修改文件。
- 新增功能 / 修复请在 `workbench-desktop.html`（前端）与 `serve.py` / `app.py`（后端）对应位置发起 PR。
