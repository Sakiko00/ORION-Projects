'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Monitor, Cpu, Wifi, Shield, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function RTAPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">返回主页</span>
          </Link>
          <h1 className="text-sm font-medium">RTA-LLM 反思性主题分析工具</h1>
          <ThemeToggle />
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 pt-24 pb-20">
        {/* Hero */}
        <section className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm mb-6">
            <Monitor className="h-4 w-4" />
            桌面应用 · Windows
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            RTA-LLM
          </h2>
          <p className="text-xl text-muted-foreground mb-2">您的 AI 质性研究助手</p>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            让质性研究中的主题分析从&quot;手工劳作&quot;变成&quot;一键生成&quot;，帮您把精力集中在思考和洞察上，而不是繁琐的编码和整理上。
          </p>
        </section>

        {/* Screenshot */}
        <section className="mb-16">
          <div className="relative rounded-2xl overflow-hidden border border-border/50 bg-muted/30 shadow-2xl">
            <Image
              src="/rta/app-screenshot.png"
              alt="RTA-LLM 应用界面"
              width={1200}
              height={750}
              className="w-full h-auto"
              priority
            />
          </div>
        </section>

        {/* Core Feature */}
        <section className="mb-16 text-center">
          <div className="bg-muted/30 rounded-2xl p-8 md:p-12 border border-border/30">
            <p className="text-lg md:text-xl text-muted-foreground mb-4">
              一款简单易用的桌面软件，它能帮您<strong className="text-foreground">自动完成质性研究中的主题分析工作</strong>。
            </p>
            <p className="text-muted-foreground">
              您只需要把研究数据（访谈记录、问卷文本、田野笔记等）输入进去，AI 就会按照学术规范，
              一步步帮您完成从&quot;熟悉数据&quot;到&quot;撰写报告&quot;的全部六个分析阶段。
            </p>
            <div className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary/10 text-primary font-medium">
              您给数据，它给报告 — 就像有一位研究助理在帮您干活
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="mb-16">
          <h3 className="text-2xl font-bold text-center mb-10">核心功能</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: '📖', title: '一键全流程分析', desc: '输入文本，点击开始，自动完成全部六个分析阶段' },
              { icon: '🔍', title: '分步分析', desc: '也可以只做其中某一步，比如只做"编码"或只做"主题构建"' },
              { icon: '📝', title: '自动生成报告', desc: '分析完成后自动生成结构化的研究报告' },
              { icon: '📂', title: '文件上传', desc: '支持直接粘贴文本或上传 TXT 文件' },
              { icon: '📋', title: '历史记录', desc: '所有分析记录自动保存，随时回看和对比' },
              { icon: '🔒', title: '数据安全', desc: '所有数据都存在您自己的电脑上，不会上传到任何服务器' },
            ].map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-xl bg-card/50 border border-border/30 hover:border-primary/30 transition-all duration-300"
              >
                <div className="text-2xl mb-3">{feature.icon}</div>
                <h4 className="font-semibold mb-2">{feature.title}</h4>
                <p className="text-sm text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 3 Steps */}
        <section className="mb-16">
          <h3 className="text-2xl font-bold text-center mb-10">使用有多简单？</h3>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: '配置 AI 模型',
                desc: '首次使用约 1 分钟。在设置页面填入 AI 平台 API Key（如 Kimi、DeepSeek、OpenAI 等），点击"测试连接"确认，保存即可。',
              },
              {
                step: '2',
                title: '输入分析数据',
                desc: '把您的文本数据粘贴到分析页面，或上传 TXT 文件。',
              },
              {
                step: '3',
                title: '点击"开始分析"',
                desc: '选择"全流程分析"，点击开始。等待几分钟，AI 会自动完成六个阶段的分析，您就能看到完整的分析报告。',
              },
            ].map((item) => (
              <div key={item.step} className="relative text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h4 className="font-semibold mb-2">{item.title}</h4>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Who is it for */}
        <section className="mb-16">
          <h3 className="text-2xl font-bold text-center mb-10">谁适合用这个软件？</h3>
          <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {[
              { emoji: '🎓', label: '高校师生', desc: '做论文、课题研究中的质性数据分析' },
              { emoji: '🔬', label: '科研人员', desc: '处理访谈、问卷、观察记录等文本数据' },
              { emoji: '📊', label: '市场研究者', desc: '分析用户反馈、访谈记录' },
              { emoji: '🏥', label: '社科/人文领域', desc: '任何需要做主题分析的场景' },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-3 p-4 rounded-xl bg-muted/30 border border-border/20">
                <span className="text-2xl">{item.emoji}</span>
                <div>
                  <h4 className="font-medium">{item.label}</h4>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Supported AI Platforms */}
        <section className="mb-16">
          <h3 className="text-2xl font-bold text-center mb-10">支持哪些 AI 平台？</h3>
          <div className="flex flex-wrap justify-center gap-3 max-w-3xl mx-auto">
            {['Kimi（月之暗面）', 'DeepSeek（深度求索）', 'OpenAI（ChatGPT）', 'Claude（Anthropic）', 'Gemini（Google）', '豆包（字节跳动）', 'MiniMax', '兼容 OpenAI 接口的自定义平台'].map(
              (platform) => (
                <span
                  key={platform}
                  className="px-4 py-2 rounded-full bg-muted/50 border border-border/30 text-sm"
                >
                  {platform}
                </span>
              )
            )}
          </div>
        </section>

        {/* System Requirements */}
        <section className="mb-16">
          <h3 className="text-2xl font-bold text-center mb-10">系统要求</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {[
              { icon: Monitor, label: '操作系统', value: 'Windows 10/11（64位）' },
              { icon: Cpu, label: '内存', value: '建议 4GB 以上' },
              { icon: Wifi, label: '网络', value: '需要联网（调用 AI 服务）' },
              { icon: Shield, label: '其他', value: '无需额外环境，开箱即用' },
            ].map((req) => (
              <div key={req.label} className="p-4 rounded-xl bg-muted/30 border border-border/20 text-center">
                <req.icon className="h-6 w-6 text-primary mx-auto mb-2" />
                <p className="text-xs text-muted-foreground mb-1">{req.label}</p>
                <p className="text-sm font-medium">{req.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Download */}
        <section className="text-center">
          <div className="bg-muted/30 rounded-2xl p-8 md:p-12 border border-border/30">
            <CheckCircle className="h-10 w-10 text-primary mx-auto mb-4" />
            <h3 className="text-2xl font-bold mb-2">获取 RTA-LLM</h3>
            <p className="text-muted-foreground mb-6">
              v1.0.0 · Windows 64位 · 开箱即用无需安装额外环境
            </p>
            <Button
              size="lg"
              className="gap-2 text-base px-8"
              onClick={() => {
                window.open('https://gitxtyrzx801.feishu.cn/wiki/WtVPwSanTiAbJFkt0eocl8s5nsf?from=from_copylink', '_blank', 'noopener,noreferrer');
              }}
            >
              <ExternalLink className="h-5 w-5" />
              详情 &amp; 安装
            </Button>
            <p className="text-xs text-muted-foreground mt-4">
              点击前往飞书 Wiki 查看详细介绍与安装指南
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 py-6 text-center text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition-colors">
          ← 返回 ORION AI STUDIO 主页
        </Link>
      </footer>
    </div>
  );
}
