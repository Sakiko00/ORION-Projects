# ORION AI Studio

> 广州工程技术职业学院信息工程学院 · AI 研究工作室官方网站

ORION AI Studio 是面向高校 AI 研究的展示门户，集中呈现团队介绍、成员构成、项目案例与 AI 生成作品。站点围绕「构成主义」的视觉语言设计，兼顾品牌调性与前沿技术实践。

## 特性

- **全屏交互 Hero**：音频驱动的神经网络可视化背景，跟随系统指针的坐标定位辅助线
- **团队展示**：负责人、指导老师、核心成员的角色与专长汇总
- **项目案例**：从 AI Agent 到桌面应用、MC 服务器与知识库的完整项目矩阵，含运营状态与外链
- **AIGC 作品集**：构思主义风格画廊，自动滚动 + 悬停暂停 + 点击查看大图，内置 AI 短片播放
- **像素桌面宠物**：悬浮在页面上的 Lumi，支持悬停唤出、拖拽移动、单击切换状态、靠近屏幕边栏自动吸附
- **Web 音乐播放器**：内置多首曲目，播放时驱动背景可视化同步响应
- **亮 / 暗双主题**：全局主题切换，视觉配色自适应
- **独立子页**：质性研究主题分析工具（RTA）、ORION MC 服务器信息页

## 技术栈

- **框架**：Next.js 16（App Router）
- **核心**：React 19
- **语言**：TypeScript 5
- **样式**：Tailwind CSS 4
- **UI 组件**：shadcn/ui（基于 Radix UI）
- **图标**：lucide-react
- **包管理器**：pnpm 9+

## 快速开始

环境要求：Node.js 18+ 与 pnpm。

```bash
# 1. 安装依赖
pnpm install

# 2. 启动开发服务器（端口 5000）
pnpm dev
```

Windows PowerShell 下若 `pnpm dev` 无法执行 bash 脚本，可直接运行：

```bash
pnpm tsx watch src/server.ts
```

浏览器打开 [http://localhost:5000](http://localhost:5000) 查看站点。开发服务器支持热更新。

### 构建生产版本

```bash
pnpm build
```

### 启动生产服务器

```bash
pnpm start
```

## 目录结构

```
├── public/            # 静态资源
│   ├── aigc/          # AI 生成短片与画廊图片
│   ├── decor/         # 几何装饰纹理
│   ├── music/         # 音乐播放器曲目
│   └── pet-*.png      # 桌面宠物帧图
├── scripts/           # 构建与启动脚本
│   ├── dev.sh         # 开发环境启动
│   ├── build.sh       # 生产构建
│   └── start.sh       # 生产启动
├── src/
│   ├── app/           # 页面路由与布局
│   │   ├── page.tsx   # 首页
│   │   ├── mc/        # MC 服务器页
│   │   └── rta/       # 质性研究分析工具页
│   ├── components/    # React 组件
│   │   ├── ui/        # shadcn/ui 基础组件
│   │   ├── AudioVisualizer.tsx   # 音频可视化(神经网络背景)
│   │   ├── MusicPlayer.tsx       # Web 音乐播放器
│   │   └── ScreenPet.tsx         # 桌面像素宠物
│   ├── hooks/         # 自定义 Hooks
│   └── lib/           # 工具函数
├── next.config.ts     # Next.js 配置
├── package.json       # 项目依赖
└── tsconfig.json      # TypeScript 配置
```

## 参与贡献

欢迎通过 Issue 报告问题或通过 Pull Request 提交改进。请遵循以下规范：

- 使用 pnpm 管理依赖（项目已配置 `preinstall` 拦截其他包管理器）
- 优先复用 `src/components/ui/` 下的 shadcn/ui 组件
- 遵循 Next.js App Router 规范，正确区分服务端 / 客户端组件
- 使用 TypeScript 保证类型安全，路径别名 `@/*` 指向 `src/*`

## License

本项目仅供学习与交流，具体协议以仓库 LICENSE 文件为准。