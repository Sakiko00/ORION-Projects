'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import {
  ArrowLeft,
  BookOpen,
  Download,
  ChevronRight,
  ExternalLink,
  FileText,
  Wrench,
  Lightbulb,
  Monitor,
  Database,
  Github,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import MermaidRenderer from '@/components/MermaidRenderer';

/* ── Markdown 内容 ── */

const MD_PROMPT = `## 提示词技巧

智能体场景一般可以使用**RTF 框架**编写提示词

## RTF 框架详解

### R：Role（角色）

- **定义**：明确告知 AI 需要扮演的专业身份
- **示例**：你是一名奥斯卡获奖广告导演，擅长以极具情绪张力和视觉冲击的手法讲述真实故事

### T：Task（任务）

- **定义**：清晰、具体地说明 AI 需要完成的核心任务
- **示例**：你的任务是设计短片镜头，主要是激发 18-30 岁年轻观众的斗志，传达 "挑战极限，爆发潜能" 主题，每次创建 5 个镜头

### F：Format（输出格式）

- **定义**：指定 AI 输出的结构化格式，复杂场景可自定义 JSON/XML 格式
- **示例**：

\`\`\`plaintext
【画面】：描述镜头里的场景
【旁白】：配合画面的一段解说词
【配乐】：适合该场景的背景音乐建议
\`\`\`

---

## RTF 框架完整示例（Markdown 格式）

\`\`\`markdown
## Role ##
你是一名奥斯卡获奖广告导演，擅长以极具情绪张力和视觉冲击的手法讲述真实故事

## Task ##
你的任务是设计短片镜头，主要是激发18-30岁年轻观众的斗志，传达"挑战极限，爆发潜能"
每次输出5条场景

## Format ##
【画面】：描述镜头里面的场景
【旁白】：配合画面的一段解说词
【配乐】：适合该场景的背景音乐建议
\`\`\`

---

## XML 标准化提示词格式

### 格式示例

\`\`\`xml
<document_analysis>
<extract_facts>
    识别提供文本中的关键声明和支持证据。
</extract_facts>
<verify_facts>
    将提取的声明与知识库进行交叉引用。
    标记任何可能不准确的陈述。
</verify_facts>
<summarize>
    创建结构化摘要，将已验证事实与未验证声明清晰分离。
</summarize>
</document_analysis>
\`\`\`

### 优缺点对比

- **缺点**：相比紧凑格式会消耗更多 Token
- **优点**：实现生产级别的准确输出

> Transformer 注意力机制原本需要从语义线索推断边界，同时跟踪多种可能的解释，这在计算上既昂贵又容易出错。XML 标签在算法层面消除了这种不确定性。

*引用：[颠覆传统提示词！XML 标签让大模型秒懂人类意图，从入门到精通这一篇够！](https://blog.csdn.net/xx_nm98/article/details/151797951)*
`;

const MD_TOOLS = `# AI基础工具导航

以下整理了**国内可用、门槛低、实用的AI工具**，按类别分类，附直达链接。

---

## 💬 AI对话 / 写作（6款）

| 工具 | 标签 | 说明 |
|------|------|------|
| [DeepSeek](https://chat.deepseek.com) | 免费 · 热门 | 国产顶尖大模型，免费不限次使用，支持深度思考模式，代码/写作/翻译全能 |
| [豆包](https://www.doubao.com) | 免费 | 字节跳动旗下AI助手，支持多模态对话和语音交互，体验流畅自然 |
| [Kimi](https://kimi.moonshot.cn) | 免费 · 热门 | 月之暗面出品，超长上下文200万字，擅长处理长文、论文、合同等 |
| [文心一言](https://yiyan.baidu.com) | 免费 | 百度出品，中文理解力强，与百度搜索/网盘等生态深度整合 |
| [通义千问](https://tongyi.aliyun.com) | 免费 | 阿里出品，多模态能力强，与钉钉/阿里云深度联动，办公场景便捷 |
| [智谱清言](https://chatglm.cn) | 免费 | 智谱AI出品，GLM系列模型，支持代码执行、数据分析和联网搜索 |

---

## 🎨 AI绘画 / 图像（6款）

| 工具 | 标签 | 说明 |
|------|------|------|
| [即梦AI](https://jimeng.jianying.com) | 热门 | 字节旗下AI创作平台，文生图/图生图/图片编辑，画风丰富多样 |
| [通义万相](https://tongyi.aliyun.com/wanxiang) | 免费 | 阿里出品AI绘画，支持文生图、图片风格迁移、涂鸦作画 |
| [堆友](https://www.design-ai.cn) | 免费 | 阿里设计团队出品，3D素材+AI生成，海量设计模板与资源 |
| [LibLib AI](https://www.liblib.art) | 免费 | 国内最大的Stable Diffusion模型社区，海量模型免费下载使用 |
| [文心一格](https://yige.baidu.com) | 免费 | 百度出品AI艺术创作平台，中文语义理解准，上手简单 |
| [美图AI](https://ai.meitu.com) | 免费 | 美图秀秀AI功能集成，修图+AI生成+AI消除一站式，手机就能用 |

---

## 🎬 AI视频（4款）

| 工具 | 标签 | 说明 |
|------|------|------|
| [即梦AI](https://jimeng.jianying.com) | 热门 | 图生视频/文生视频，最高可生成12秒，支持DeepSeek辅助生成脚本 |
| [可灵](https://kling.kuaishou.com) | 免费额度 | 快手出品AI视频生成，文生视频/图生视频，画质细腻动态好 |
| [度加剪辑](https://dubiao.baidu.com) | 免费 | 百度出品AI视频创作，AI写稿+AI剪辑一键成片，适合口播类视频 |
| [PixVerse](https://pixverse.ai) | 免费 | 国产AI视频生成工具，支持角色一致性，画面风格多样可选 |

---

## 🎵 AI音乐 / 音频（4款）

| 工具 | 标签 | 说明 |
|------|------|------|
| [海绵音乐](https://www.haimian.com) | 免费 | 字节旗下AI音乐生成，输入歌词或灵感自动谱曲，风格多样可选 |
| [网易天音](https://tianyin.music.163.com) | 免费 | 网易AI音乐创作平台，一键生成伴奏/编曲，音乐创作门槛降到最低 |
| [天工SkyMusic](https://sky.music.tiangong.cn) | 免费 | 昆仑万维出品AI音乐，支持多种曲风，旋律优美质量稳定 |
| [讯飞智作](https://peiyin.xunfei.cn) | 免费 | 科大讯飞AI配音平台，数百种音色可选，多语种播报，适合旁白配音 |

---

## 💻 AI编程 / 开发（4款）

| 工具 | 标签 | 说明 |
|------|------|------|
| [Trae](https://www.trae.ai) | 免费 · 热门 | 字节旗下AI编程IDE，集成DeepSeek模型，对话式编程自动生成代码 |
| [扣子Coze](https://www.coze.cn) | 免费 | 字节旗下AI Bot搭建平台，零代码开发智能应用和工作流 |
| [通义灵码](https://tongyi.aliyun.com/lingma) | 免费 | 阿里出品AI编程助手，支持VSCode/JetBrains，代码补全和Bug修复 |
| [智谱CodeGeeX](https://codegeex.cn) | 免费 | 智谱出品代码生成工具，支持多种IDE，多语言代码补全与翻译 |

---

## 🔍 AI搜索 / 知识（4款）

| 工具 | 标签 | 说明 |
|------|------|------|
| [秘塔AI搜索](https://metaso.cn) | 免费 · 热门 | 深度AI搜索引擎，支持学术搜索和文库搜索，结果直接有来源链接 |
| [天工AI搜索](https://search.tiangong.cn) | 免费 | 昆仑万维出品，多模态AI搜索，集成了文案/绘图等多种能力 |
| [纳米搜索](https://www.n.cn) | 免费 | 360出品AI搜索，聚合多引擎结果，简洁高效的信息检索体验 |
| [知乎直答](https://zhida.zhihu.com) | 免费 | 知乎AI搜索问答，基于社区优质内容直接回答，质量有保证 |

---

## 📊 AI办公 / 效率（4款）

| 工具 | 标签 | 说明 |
|------|------|------|
| [通义效率](https://tongyi.aliyun.com/efficiency) | 免费 | 阿里出品效率工具，会议录音实时转写+AI总结，支持上传音视频 |
| [WPS AI](https://ai.wps.cn) | 免费额度 | 金山WPS内置AI，文档/表格/PPT智能创作，办公场景全覆盖 |
| [讯飞听见AI](https://www.iflyrec.com) | 免费额度 | 科大讯飞语音转文字工具，会议记录、访谈录音一键转文稿 |
| [百度AI笔记](https://note.baidu.com) | 免费 | 百度AI智能笔记工具，支持语音转笔记、图片转文字、AI整理 |

---

## 📖 AI教程 / 学习资源（12个）

### 🏫 综合学习社区

| 资源 | 标签 | 说明 |
|------|------|------|
| [WaytoAGI 通往AGI之路](https://waytoagi.com) | 热门 · 免费 | 国内最大的免费AI知识库，AI绘画/视频/编程全方位学习路径，从入门到精通 |
| [AI星球](https://www.aixq.cc) | 热门 · 免费 | 国内最大AI学习社区，每日更新AI工具测评、实战教程和行业动态 |
| [刺猬星球 super-i](https://www.super-i.cn) | 推荐 | AI视觉人才学习+接单平台，15万+社群成员，实战原创课程丰富 |
| [AI工具集 ai-bot.cn](https://ai-bot.cn) | 免费 | 收录1000+AI工具的综合导航站，分类详尽更新及时，发现新工具首选 |

### 📝 提示词工程学习

| 资源 | 标签 | 说明 |
|------|------|------|
| [PromptingGuide 中文版](https://www.promptingguide.ai/zh) | 热门 · 免费 | 全球最大提示词工程开源知识库，所有提示技术详解，从新手到高手 |
| [aiprompt.ink](https://aiprompt.ink) | 免费 | 免费AI Prompt共享平台，搜索各场景提示词模板，直接参考使用 |

### 💻 技术社区（教程丰富）

| 资源 | 标签 | 说明 |
|------|------|------|
| [掘金](https://juejin.cn) | 免费 | 顶级开发者社区，大量AI创作实战文章、项目案例和技术深度解析 |
| [CSDN](https://blog.csdn.net) | 免费 | 老牌技术社区，AI教程覆盖面广，从入门到进阶内容齐全 |
| [菜鸟教程](https://www.runoob.com) | 免费 | 最良心中文编程文档库，AI编程参赛者必学基础，每个知识点有可运行代码 |

### 🎯 官方教程 / 垂直平台

| 资源 | 标签 | 说明 |
|------|------|------|
| [LibLib模型社区](https://www.liblib.art) | 免费 | 国内最大Stable Diffusion模型社区，海量模型+AI绘画教程 |
| [剪映创作学院](https://www.jianying.com) | 免费 | 官方剪辑教程从入门到进阶，AI功能详细教学，短视频创作必学 |
| [可灵AI官方教程](https://kling.kuaishou.com) | 免费 | 快手可灵官方创作指南，AI视频从零上手，案例丰富教程详细 |

---

**⚠️ 提醒**：AI只是工具，你才是创作者！
`;

const MD_VIBE = `## 概述

AI Vibe Coding（氛围编程）是一种革命性的软件开发范式，由OpenAI前联合创始人Andrej Karpathy于2025年2月提出。核心理念是**"意图大于语法"**——开发者通过自然语言描述需求，AI负责实现代码，让开发者专注于产品创意而非编码细节。

---

## 完整开发流程图

\`\`\`mermaid
flowchart TB
    subgraph 阶段1["🎯 阶段1：需求与规划"]
        A1[核心创意构思] --> A2[AI头脑风暴]
        A2 --> A3[可行性分析]
        A3 --> A4[编写PRD文档]
        A4 --> A5[创建CLAUDE.md]
        A5 --> A6[用户故事与验收标准]
    end

    subgraph 阶段2["⚙️ 阶段2：技术栈选择"]
        B1[确定技术栈] --> B2[架构设计]
        B2 --> B3[数据库Schema设计]
        B3 --> B4[API端点设计]
    end

    subgraph 阶段3["💻 阶段3：AI代码生成"]
        C1[Trae Builder模式] --> C2[自然语言描述需求]
        C2 --> C3[AI生成项目结构]
        C3 --> C4[自动生成代码文件]
        C4 --> C5[实时预览与调试]
    end

    subgraph 阶段4["🔀 阶段4：版本控制"]
        D1[Git初始化] --> D2[创建GitHub仓库]
        D2 --> D3[代码提交]
        D3 --> D4[AI优化Commit信息]
        D4 --> D5[分支管理]
    end

    subgraph 阶段5["🧪 阶段5：测试与QA"]
        E1[单元测试生成] --> E2[集成测试]
        E2 --> E3[AI辅助Debug]
        E3 --> E4[安全扫描]
        E4 --> E5[代码审查]
    end

    subgraph 阶段6["🚀 阶段6：部署与交付"]
        F1[CI/CD配置] --> F2[构建打包]
        F2 --> F3[部署到Vercel/云服务器]
        F3 --> F4[域名配置]
        F4 --> F5[监控与日志]
    end

    subgraph 阶段7["🔄 阶段7：迭代优化"]
        G1[用户反馈收集] --> G2[性能监控]
        G2 --> G3[功能迭代]
        G3 --> G4[技术栈升级]
        G4 --> G1
    end

    阶段1 --> 阶段2
    阶段2 --> 阶段3
    阶段3 --> 阶段4
    阶段4 --> 阶段5
    阶段5 --> 阶段6
    阶段6 --> 阶段7
\`\`\`

---

## 详细流程说明

### 📋 阶段1：需求与规划
在这一步就应该定下来产品类型，例如：网站/小程序/桌面应用/手机APP...

| 步骤 | 描述 | Trae功能支持 |
|------|------|-------------|
| 核心创意构思 | 确定产品核心价值和目标用户 | SOLO模式头脑风暴 |
| AI头脑风暴 | 让AI扮演产品经理角色发散创意 | 自然语言对话 |
| 可行性分析 | 评估技术实现难度和资源需求 | AI架构建议 |
| 编写PRD文档 | 产品需求文档，明确功能列表 | 文档生成辅助 |
| 创建CLAUDE.md | 项目DNA文档，定义技术规范 | 规则引擎 |
| 用户故事 | 定义用户场景和验收标准 | AI辅助编写 |

**关键提示**：
- 使用 \`.trae/rules\` 配置团队编码规范
- PRD越详细，AI生成的代码质量越高

---

### ⚙️ 阶段2：技术栈选择
需要检验技术栈语言环境基础，例：node.js，以便接入对应的SDK或者功能库

**常见Vibe Coding技术栈组合**：

\`\`\`
前端：React/Vue + TypeScript + Tailwind CSS
后端：Node.js/Next.js API Routes 或 FastAPI
数据库：PostgreSQL (Neon) + Prisma ORM
认证：NextAuth.js / Supabase Auth
部署：Vercel (前端) + Railway/Render (后端)
AI集成：Claude API / OpenAI API / DeepSeek
\`\`\`

**Trae技术栈生成特点**：
- ✅ 支持多种框架一键生成
- ✅ 自动配置开发环境
- ✅ 智能推荐最佳实践

---

### 💻 阶段3：AI代码生成（核心环节）

\`\`\`mermaid
sequenceDiagram
    participant U as 开发者
    participant T as Trae IDE
    participant AI as AI模型
    participant Git as GitHub

    U->>T: 输入自然语言需求
    T->>AI: 发送上下文+需求
    AI->>T: 生成代码建议
    T->>U: 展示代码预览
    U->>T: 确认/修改需求
    T->>AI: 迭代优化
    AI->>T: 更新代码
    T->>Git: 自动提交到仓库
\`\`\`

**Trae Builder模式工作流程**：

1. **输入需求**：\`基于Vue3的电商后台，带登录权限，适配Docker部署\`
2. **AI拆解任务**：
   - 项目结构生成
   - 依赖清单创建
   - 组件代码编写
   - 配置文件生成
3. **可视化进度**：实时显示生成进度
4. **一键启动**：自动安装依赖并启动服务
5. **实时预览**：内置Webview查看效果

---

### 🔀 阶段4：源代码托管与Git管理

**Trae的GitHub集成功能**：

| 功能 | 操作方式 | 说明 |
|------|---------|------|
| 克隆仓库 | Clone Git Repository → Clone from GitHub | 支持授权克隆和URL克隆 |
| 发布项目 | Source Control → Publish to GitHub | 自动创建仓库并推送 |
| 初始化仓库 | Initialize Repository | 一键创建Git仓库 |
| 提交代码 | Commit | AI优化Commit信息 |
| 分支管理 | Branch/Tag管理 | 可视化分支操作 |

**Git工作流建议**：

\`\`\`bash
# 1. 初始化项目
git init

# 2. 创建功能分支
git checkout -b feature/new-feature

# 3. 提交代码（Trae AI会建议Commit信息）
git add .
git commit -m "feat: add user authentication"

# 4. 推送到GitHub
git push origin feature/new-feature

# 5. 创建Pull Request进行代码审查
\`\`\`

---

### 🧪 阶段5：测试与QA

**AI辅助测试流程**：

\`\`\`mermaid
flowchart LR
    A[代码生成] --> B[自动生成单元测试]
    B --> C{测试通过?}
    C -->|否| D[AI分析失败原因]
    D --> E[自动修复代码]
    E --> B
    C -->|是| F[集成测试]
    F --> G[安全扫描]
    G --> H[代码审查]
\`\`\`

**测试类型**：
- **单元测试**：Vitest/Jest自动生成
- **E2E测试**：Playwright/Cypress
- **安全扫描**：AI检测常见漏洞
- **代码审查**：Trae规则引擎检查规范

---

### 🚀 阶段6：打包与部署

**部署流程**：

\`\`\`mermaid
flowchart TB
    A[代码完成] --> B[构建打包]
    B --> C{选择部署平台}
    C -->|前端| D[Vercel]
    C -->|全栈| E[Railway/Render]
    C -->|容器化| F[Docker + 云服务器]
    D --> G[自动部署]
    E --> G
    F --> G
    G --> H[域名配置]
    H --> I[SSL证书]
    I --> J[监控告警]
\`\`\`

**Trae SOLO模式部署特点**：
- 输入\`产品需求+交付要求\`
- 一键完成编码→测试→部署全流程
- 终端日志与Webview实时联动

---

### 🔄 阶段7：持续迭代

**迭代循环**：

\`\`\`
用户反馈 → 性能监控 → 功能迭代 → 技术栈升级 → 新需求输入
     ↑___________________________________________________|
\`\`\`

**Vibe Coding迭代优势**：
- AI可以理解旧逻辑并自动迁移到新框架
- 重构不再可怕，自然语言描述即可
- 持续集成AI最新能力

---

## Trae核心功能对照表

| 功能 | 传统开发 | Trae Vibe Coding |
|------|---------|-----------------|
| 代码编写 | 手动编写 | AI生成+人工审查 |
| 项目搭建 | 手动配置 | Builder模式一键生成 |
| 设计转代码 | 手动切图 | 看图写代码（92%准确率） |
| Commit信息 | 手动编写 | AI优化生成 |
| Bug修复 | 手动Debug | AI辅助分析修复 |
| 代码规范 | 人工审查 | 规则引擎自动合规 |
| 多人协作 | 手动解决冲突 | AI智能调和 |

---

## 最佳实践建议

### ✅ 应该做的

1. **详细的需求描述**：越具体的PRD，AI生成的代码质量越高
2. **模块化开发**：一次只生成一个功能模块
3. **及时测试**：每生成一个模块立即测试验证
4. **版本控制**：频繁提交，小步快跑
5. **规则配置**：使用\`.trae/rules\`固化团队规范

### ❌ 避免的错误

1. **过度依赖AI**：AI是副驾驶，不是自动驾驶
2. **忽视代码审查**：AI生成的代码仍需人工审查
3. **缺乏架构设计**：大项目需要先规划架构
4. **跳过测试环节**：自动化测试不可省略
5. **一次性生成大量代码**：分模块迭代更可控

---

## 典型应用场景

### 场景1：快速原型验证

\`\`\`
需求：健康打卡工具，支持微信推送
时间：1小时
产出：可运行的线上服务
\`\`\`

### 场景2：全栈SaaS开发

\`\`\`
技术栈：Next.js + Supabase + Stripe
功能：用户认证 + AI内容生成 + 付费订阅
部署：Vercel + 自定义域名
\`\`\`

### 场景3：设计稿转代码

\`\`\`
输入：Figma设计稿截图
输出：响应式React/Tailwind代码
准确率：92%
\`\`\`

---

## 总结

AI Vibe Coding代表了软件开发的未来趋势——**从"写代码"到"描述需求"**。以Trae为代表的AI原生IDE，通过以下核心能力实现了开发效率的10倍提升：

1. **自然语言编程**：用中文/英文描述需求即可生成代码
2. **全流程自动化**：从需求到部署一站式完成
3. **智能协作**：AI作为编程助手，人类专注于产品创意
4. **零门槛上手**：无需深厚的编程基础即可构建应用

> **核心理念**："我们是项目的总工程师和产品经理，AI是我们的编程助理。"

---

## 参考资源

- [Trae 官方文档](https://docs.trae.ai)
- [Trae GitHub集成指南](https://traeide.com/news/4)
- [Vibe Coding SDLC Framework白皮书](https://jekardah.com)
- [Vibe Coding Academy教程](https://www.vibecodingacademy.ai)
`;

/* ── 侧边栏数据 ── */

interface Article {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: string;
  category: 'knowledge' | 'resource';
}

const articles: Article[] = [
  {
    id: 'vibe-coding',
    title: 'AI Vibe Coding 开发全流程',
    icon: <Monitor className="h-4 w-4" />,
    content: MD_VIBE,
    category: 'knowledge',
  },
  {
    id: 'prompt-skills',
    title: '提示词技巧',
    icon: <Lightbulb className="h-4 w-4" />,
    content: MD_PROMPT,
    category: 'knowledge',
  },
  {
    id: 'ai-tools',
    title: 'AI基础工具导航',
    icon: <Wrench className="h-4 w-4" />,
    content: MD_TOOLS,
    category: 'knowledge',
  },
];

/* ── 资源数据 ── */

interface Resource {
  name: string;
  description: string;
  url: string;
  password?: string;
  size: string;
  icon: React.ReactNode;
  platform: string;
}

const resources: Resource[] = [
  {
    name: 'Obsidian',
    description: '本地优先的知识管理工具，基于Markdown文件存储，支持双向链接与关系图谱，数据完全掌控在自己手中，丰富的社区插件生态可自由扩展功能',
    url: 'https://pan.baidu.com/s/1dCmsjXJAyO9Ll0pqW__yTA?pwd=eq5p',
    size: '282 MB',
    icon: <Database className="h-5 w-5" />,
    platform: 'Windows / macOS / Linux',
  },
  {
    name: 'Hyperdown',
    description: '百度网盘不限速下载工具，支持多种资源链接解析，突破网盘限速瓶颈，大幅提升下载速度，轻量免安装即开即用',
    url: 'https://wwbeh.lanzouu.com/iDhV13pl70ob',
    password: '9p80',
    size: '16 MB',
    icon: <Download className="h-5 w-5" />,
    platform: 'Windows',
  },
  {
    name: 'Project Graph',
    description: '开源项目结构可视化工具，自动扫描项目目录生成交互式依赖关系图谱，支持节点展开、缩放拖拽和导出分享，项目架构一目了然',
    url: 'https://wwbeh.lanzouu.com/iDYjR3pl712f',
    password: '2dg9',
    size: '9.7 MB',
    icon: <Github className="h-5 w-5" />,
    platform: 'Windows',
  },
];

/* ── 组件 ── */

export default function KnowledgePage() {
  const [activeId, setActiveId] = useState('vibe-coding');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const activeArticle = useMemo(
    () => articles.find((a) => a.id === activeId) ?? articles[0],
    [activeId]
  );



  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* 顶部导航 */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">返回主页</span>
            </Link>
            <div className="w-px h-5 bg-border/50" />
            <div className="flex items-center gap-2">
              <Image src="/logo-icon.png" alt="ORION" width={24} height={24} className="rounded-sm" />
              <span className="font-semibold text-sm">知识 & 资源库</span>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </nav>

      <div className="pt-14 flex min-h-screen">
        {/* 侧边栏 */}
        <aside
          className={`${
            sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
          } fixed top-14 left-0 bottom-0 border-r border-border/50 bg-card/50 backdrop-blur-sm transition-all duration-300 z-40`}
        >
          <div className="w-64 h-full flex flex-col">
            {/* 知识库分区 */}
            <div className="px-3 pt-4 pb-2">
              <div className="flex items-center gap-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <BookOpen className="h-3.5 w-3.5" />
                知识库
              </div>
            </div>
            {articles
              .filter((a) => a.category === 'knowledge')
              .map((article) => (
                <button
                  key={article.id}
                  onClick={() => setActiveId(article.id)}
                  className={`w-full flex items-center gap-2.5 px-5 py-2.5 text-sm transition-all text-left ${
                    activeId === article.id
                      ? 'bg-primary/10 text-primary font-medium border-r-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {article.icon}
                  {article.title}
                </button>
              ))}

            {/* 外部链接 */}
            <div className="px-3 pt-6 pb-2">
              <div className="flex items-center gap-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <ExternalLink className="h-3.5 w-3.5" />
                推荐资源
              </div>
            </div>
            <a
              href="https://waytoagi.feishu.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
            >
              <FileText className="h-4 w-4" />
              WaytoAGI 知识库
              <ExternalLink className="h-3 w-3 ml-auto" />
            </a>

            {/* 资源库分区 */}
            <div className="px-3 pt-6 pb-2">
              <div className="flex items-center gap-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Download className="h-3.5 w-3.5" />
                资源库
              </div>
            </div>
            {resources.map((res) => (
              <a
                key={res.name}
                href={res.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-2.5 px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all text-left"
              >
                {res.icon}
                {res.name}
                <ChevronRight className="h-3 w-3 ml-auto opacity-50" />
              </a>
            ))}

            {/* 折叠按钮 */}
            <div className="mt-auto p-3 border-t border-border/30">
              <button
                onClick={() => setSidebarOpen(false)}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-all"
              >
                收起侧栏
              </button>
            </div>
          </div>
        </aside>

        {/* 侧栏展开按钮（收起时显示） */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="fixed top-16 left-2 z-40 p-2 rounded-md bg-card/80 backdrop-blur border border-border/50 hover:bg-muted/50 transition-all"
          >
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </button>
        )}

        {/* 主内容区 */}
        <main
          className={`flex-1 transition-all duration-300 ${
            sidebarOpen ? 'ml-64' : 'ml-0'
          }`}
        >
          {/* 知识文章区 */}
          <div className="max-w-4xl mx-auto px-6 py-8 md:px-10 md:py-12">
            {/* 文章标题 */}
            <div className="mb-8">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <BookOpen className="h-4 w-4" />
                知识库
              </div>
              <h1 className="text-2xl md:text-3xl font-bold">{activeArticle.title}</h1>
            </div>

            {/* Markdown 渲染 */}
            <article className="markdown-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  h1: ({ children, ...props }) => (
                    <h1 {...props}>{children}</h1>
                  ),
                  h2: ({ children, ...props }) => (
                    <h2 {...props}>
                      <span className="md-heading-icon">&#167;</span>
                      {children}
                    </h2>
                  ),
                  a: ({ href, children, ...props }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                      {children}
                      <svg className="md-external-icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                        <path d="M8.5 1H14v5.5h-1V2.7L6.35 9.35l-.7-.7L12.29 2H8.5V1z"/>
                        <path d="M2 3h5v1H3v9h9v-4h1v5H2V3z"/>
                      </svg>
                    </a>
                  ),
                  blockquote: ({ children, ...props }) => (
                    <blockquote {...props}>
                      <span className="md-quote-mark">&#10077;</span>
                      <div className="md-quote-content">{children}</div>
                    </blockquote>
                  ),
                  table: ({ children, ...props }) => (
                    <div className="md-table-wrapper">
                      <table {...props}>{children}</table>
                    </div>
                  ),
                  pre: ({ children, ...props }) => {
                    const child = children as React.ReactElement<{ className?: string; children?: React.ReactNode }> | null;
                    const codeClassName = child?.props?.className || '';
                    if (codeClassName.startsWith('language-mermaid')) {
                      const code = String(child?.props?.children || '').replace(/\n$/, '');
                      return <MermaidRenderer chart={code} />;
                    }
                    return (
                      <div className="md-code-block">
                        <pre {...props}>{children}</pre>
                      </div>
                    );
                  },
                }}
              >
                {activeArticle.content}
              </ReactMarkdown>
            </article>

            {/* 资源下载区 */}
            <div className="mt-16 pt-8 border-t border-border/30">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Download className="h-4 w-4" />
                资源库
              </div>
              <h2 className="text-2xl font-bold mb-6">工具下载</h2>

              <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
                {resources.map((res) => (
                  <div
                    key={res.name}
                    className="group bg-card border border-border/50 rounded-xl p-5 hover:border-primary/30 hover:shadow-lg transition-all"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        {res.icon}
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{res.name}</h3>
                        <span className="text-xs text-muted-foreground">{res.platform}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                      {res.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{res.size}</span>
                      <a
                        href={res.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-all"
                      >
                        <ExternalLink className="h-3 w-3" />
                        获取
                      </a>
                    </div>
                    {res.password && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 rounded-md px-2 py-1">
                        <span>提取码：</span>
                        <code className="font-mono text-primary">{res.password}</code>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 外部推荐 */}
            <div className="mt-12 pt-8 border-t border-border/30">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <ExternalLink className="h-4 w-4" />
                推荐外部资源
              </div>
              <h2 className="text-2xl font-bold mb-6">更多学习资源</h2>

              <a
                href="https://waytoagi.feishu.cn/"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-4 bg-card border border-border/50 rounded-xl p-5 hover:border-primary/30 hover:shadow-lg transition-all"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Monitor className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold group-hover:text-primary transition-colors">
                    WaytoAGI 通往AGI之路
                  </h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    国内最大的免费AI知识库，涵盖AI绘画/视频/编程全方位学习路径
                  </p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </a>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
