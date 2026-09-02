'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ExternalLink } from 'lucide-react';

export default function MCPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border/50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <Image src="/logo-icon.png" alt="ORION" width={32} height={32} className="transition-transform group-hover:scale-110" />
            <span className="font-semibold tracking-wide">ORION</span>
          </Link>
          <div className="flex items-center gap-6">
            <ThemeToggle />
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              返回首页
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-12 px-6 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
          <div className="absolute top-20 left-10 w-16 h-16 bg-primary/10 rounded-sm rotate-12 animate-pulse" style={{ animationDuration: '3s' }} />
          <div className="absolute top-40 right-20 w-12 h-12 bg-primary/8 rounded-sm -rotate-6 animate-pulse" style={{ animationDuration: '4s', animationDelay: '1s' }} />
          <div className="absolute bottom-20 left-1/4 w-8 h-8 bg-primary/5 rounded-sm rotate-45 animate-pulse" style={{ animationDuration: '5s', animationDelay: '2s' }} />
        </div>

        <div className="max-w-6xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm text-primary font-medium">服务器在线</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight">
            ORION <span className="text-primary">MC</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-4">
            ORION 工作室 Minecraft 服务器
          </p>
          <p className="text-base text-muted-foreground/70 max-w-xl mx-auto">
            与我们一起探索方块世界，建造属于你的梦想家园
          </p>
        </div>
      </section>

      {/* Showcase Image */}
      <section className="px-6 pb-16">
        <div className="max-w-5xl mx-auto">
          <div className="relative rounded-2xl overflow-hidden border border-border/50 shadow-2xl shadow-primary/5 group">
            <Image
              src="/mc-banner.png"
              alt="ORION MC 服务器场景"
              width={1200}
              height={600}
              className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-[1.02]"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/40 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
              <span className="text-sm text-foreground/80 bg-background/60 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-border/30">
                服务器游戏场景
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Resource & Join Guide */}
      <section className="px-6 pb-20">
        <div className="max-w-2xl mx-auto">
          <div className="p-8 rounded-2xl bg-card border border-border/50 text-center">
            <h2 className="text-2xl font-bold mb-4">资源 & 加入指南</h2>
            <p className="text-muted-foreground mb-6">
              点击下方链接查看服务器资源下载、模组列表及详细加入指南
            </p>
            <a
              href="https://gitxtyrzx801.feishu.cn/wiki/ICzowHvmiiWV8HkZkQNcGj6EnQL?from=from_copylink"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-all duration-200 active:scale-95"
            >
              <ExternalLink className="w-4 h-4" />
              查看详情
            </a>
          </div>

          {/* Footer */}
          <div className="mt-16 text-center text-sm text-muted-foreground">
            <p>ORION AI Studio · Minecraft Server</p>
          </div>
        </div>
      </section>
    </div>
  );
}
