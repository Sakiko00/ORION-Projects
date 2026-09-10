'use client';

import React, { useRef, useEffect } from 'react';
import Link from 'next/link';
import anime from 'animejs';
import { useTaskStore } from '@/stores/taskStore';
import { RTA_PHASES } from '@/types/rta';
import {
  FlaskConical,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  ArrowRight,
  TrendingUp,
  FileText,
  Sparkles,
  Zap,
} from 'lucide-react';

export default function DashboardPage() {
  const { tasks } = useTaskStore();
  const heroRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (heroRef.current) anime({ targets: heroRef.current, opacity: [0, 1], translateY: [-30, 0], duration: 800, easing: 'easeOutExpo' });
    if (statsRef.current?.children) {
      anime({ targets: statsRef.current.children, opacity: [0, 1], translateY: [20, 0], duration: 600, delay: anime.stagger(100), easing: 'easeOutCubic' });
    }
    if (listRef.current?.children) {
      anime({ targets: listRef.current.children, opacity: [0, 1], translateX: [-20, 0], duration: 500, delay: anime.stagger(80, { start: 600 }), easing: 'easeOutCubic' });
    }
  }, []);

  const recentTasks = tasks.slice(0, 5);
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const processingTasks = tasks.filter((t) => t.status === 'processing').length;
  const pendingTasks = tasks.filter((t) => t.status === 'pending').length;

  const stats = [
    { label: '总任务数', value: tasks.length, icon: <FlaskConical className="w-5 h-5" />, color: 'from-cyan-400 to-teal-400' },
    { label: '已完成', value: completedTasks, icon: <CheckCircle2 className="w-5 h-5" />, color: 'from-emerald-400 to-green-500' },
    { label: '进行中', value: processingTasks, icon: <Clock className="w-5 h-5" />, color: 'from-amber-400 to-orange-500' },
    { label: '待处理', value: pendingTasks, icon: <AlertCircle className="w-5 h-5" />, color: 'from-slate-500 to-slate-600' },
  ];

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      processing: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      pending: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20',
      failed: 'bg-red-500/10 text-red-400 border-red-500/20',
    };
    return styles[status] || styles.pending;
  };

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div ref={heroRef} className="relative overflow-hidden rounded-3xl p-8 lg:p-12 border border-cyan-500/10 backdrop-blur-xl bg-white/50 dark:bg-transparent">
          <div className="absolute inset-0 z-0">
            <img src="/images/bg-1.png" alt="" className="w-full h-full object-cover opacity-15" />
          </div>
          <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl" />
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-3 max-w-xl">
              <div className="flex items-center gap-3">
                <img src="/images/icon.png" alt="ORION" className="w-8 h-8 object-contain" />
                <span className="text-xs text-cyan-400 tracking-widest uppercase">AI-Powered Qualitative Research</span>
              </div>
              <img src="/images/orion-logo.png" alt="ORION RTA" className="h-7 lg:h-9 w-auto object-contain opacity-95" />
              <p className="text-lg text-slate-500 dark:text-slate-400 leading-relaxed">
                基于 Braun &amp; Clarke 2022 规范的<br />
                <span className="text-cyan-600 dark:text-cyan-300">反思性主题分析法</span>自动化分析工具
              </p>
              <div className="flex gap-3 pt-2">
                <Link href="/analysis" className="cyan-btn inline-flex items-center gap-2 px-6 py-3">
                  <Play className="w-4 h-4" />
                  开始分析
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/settings" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-cyan-500/20 text-cyan-600 dark:text-cyan-300 font-medium hover:bg-cyan-500/10 transition-all">
                  配置模型
                </Link>
              </div>
            </div>
            <div className="hidden lg:flex items-center gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className={`w-3 h-3 rounded-full bg-cyan-${400 + i * 100} animate-pulse-glow`} style={{ animationDelay: `${i * 400}ms` }} />
              ))}
            </div>
          </div>
        </div>

        <div ref={statsRef} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="card group cursor-default">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-white opacity-90`}>
                  {stat.icon}
                </div>
                <span className="text-3xl font-bold text-slate-800 dark:text-slate-200 tabular-nums">{stat.value}</span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="card bg-gradient-to-br from-slate-50 dark:from-slate-900/80 to-white dark:to-slate-950/80 border-cyan-500/10">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            快速入门指南
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { step: 1, icon: '⚙️', title: '配置 LLM', desc: '填入 API Key，选择模型提供商和参数', link: '/settings', btn: '前往配置' },
              { step: 2, icon: '📝', title: '输入数据', desc: '输入或上传待分析的质性研究文本', link: '/analysis', btn: '开始分析' },
              { step: 3, icon: '🚀', title: '运行分析', desc: '选择 RTA 阶段，调用大模型执行分析', link: '/analysis', btn: '执行任务' },
              { step: 4, icon: '📊', title: '查看结果', desc: '浏览分析报告，导出 Markdown 文件', link: '/history', btn: '历史记录' },
            ].map((item) => (
              <Link key={item.step} href={item.link}
                className="relative overflow-hidden rounded-2xl p-5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/30 transition-all duration-300 group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl group-hover:bg-cyan-500/10 transition-colors" />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">{item.icon}</span>
                    <span className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-xs font-bold text-cyan-400">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-1.5">{item.title}</h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed mb-4">{item.desc}</p>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-cyan-600 dark:text-cyan-400 group-hover:text-cyan-800 dark:group-hover:text-cyan-300 transition-colors">
                    {item.btn} <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="lg:col-span-2">
            <div className="card">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-cyan-400" />
                  最近任务
                </h2>
                <Link href="/history" className="text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 font-medium flex items-center gap-1 transition-colors">
                  查看全部 <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {recentTasks.length > 0 ? (
                <div ref={listRef} className="space-y-2">
                  {recentTasks.map((task) => {
                    const phaseInfo = RTA_PHASES.find((p) => p.id === task.phase);
                    return (
                      <div key={task.id} className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-900/60 transition-colors border border-transparent hover:border-cyan-500/10">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500/20 to-teal-500/20 flex items-center justify-center border border-cyan-500/10">
                          <FileText className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm truncate">{task.name}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{phaseInfo?.name || task.phase}</p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadge(task.status)}`}>
                          {task.status === 'completed' ? '已完成' : task.status === 'processing' ? '进行中' : task.status === 'pending' ? '待处理' : '失败'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Sparkles className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
                  <p className="text-slate-400 dark:text-slate-500">暂无任务记录</p>
                  <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">创建第一个分析任务开始探索</p>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-6">
            <div className="card bg-gradient-to-br from-cyan-500/5 to-teal-500/5 border-cyan-500/20">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400/20 to-teal-400/20 flex items-center justify-center border border-cyan-500/20">
                  <Zap className="w-5 h-5 text-cyan-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">RTA 六阶段</h3>
              </div>
              <div className="space-y-2">
                {RTA_PHASES.slice(1).map((phase, index) => (
                  <div key={phase.id} className="flex items-center gap-3 group">
                    <div className="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-cyan-500/10 flex items-center justify-center text-xs font-bold text-cyan-400 group-hover:border-cyan-500/30 transition-colors">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{phase.name}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{phase.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card bg-gradient-to-br from-cyan-500/5 to-teal-500/5 border-cyan-500/20">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                &ldquo;反思性主题分析法强调研究者主体性在研究过程中的积极作用，承认知识和意义的共同建构性质。&rdquo;
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-2">&mdash; Braun &amp; Clarke, 2022</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
