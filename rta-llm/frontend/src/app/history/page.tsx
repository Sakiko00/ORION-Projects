'use client';

import React, { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import anime from 'animejs';
import { useTaskStore } from '@/stores/taskStore';
import { RTA_PHASES } from '@/types/rta';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';
import { History, Trash2, Eye, Download, ArrowRight, FileText, Clock, CheckCircle2, XCircle, AlertCircle, Calendar, Layers, Hexagon, X } from 'lucide-react';
import { exportToWord } from '@/lib/exportWord';

export default function HistoryPage() {
  const { tasks, fetchTasks, deleteTask } = useTaskStore();
  const listRef = useRef<HTMLDivElement>(null);
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    if (listRef.current?.children) {
      anime({ targets: listRef.current.children, opacity: [0, 1], translateY: [30, 0], duration: 500, delay: anime.stagger(60), easing: 'easeOutCubic' });
    }
  }, [tasks.length]);

  const formatDate = (d: string) => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d));

  const getStatus = (s: string) => {
    const m: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
      completed: { icon: <CheckCircle2 className="w-4 h-4" />, label: '已完成', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
      processing: { icon: <Clock className="w-4 h-4" />, label: '进行中', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
      pending: { icon: <AlertCircle className="w-4 h-4" />, label: '待处理', cls: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20' },
      failed: { icon: <XCircle className="w-4 h-4" />, label: '失败', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
    };
    return m[s] || m.pending;
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); if (confirm('确定要删除这个任务吗？')) await deleteTask(id); };

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-cyan-400 tracking-widest uppercase"><Hexagon className="w-3 h-3" />Task History</div>
          <h1 className="text-3xl font-extrabold tracking-tight"><span className="cyan-text">历史记录</span></h1>
          <p className="text-slate-500 dark:text-slate-400">查看和管理您的分析任务历史</p>
        </header>

        {tasks.length > 0 ? (
          <div ref={listRef} className="space-y-3">
            {tasks.map(task => {
              const phaseInfo = RTA_PHASES.find(p => p.id === task.phase);
              const st = getStatus(task.status);
              return (
                <div key={task.id} className="card group">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-400/20 to-teal-400/20 flex items-center justify-center border border-cyan-500/20 shrink-0">
                      <Layers className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">{task.name}</h3>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500"><FileText className="w-3 h-3" />{phaseInfo?.name || task.phase}</span>
                            <span className="inline-flex items-center gap-1 text-xs text-slate-300 dark:text-slate-600"><Calendar className="w-3 h-3" />{formatDate(task.createdAt)}</span>
                          </div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1 ${st.cls}`}>{st.icon}{st.label}</span>
                      </div>
                      {task.description && <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">{task.description}</p>}
                      {task.status === 'failed' && task.error && <div className="mt-2 p-3 bg-red-500/5 border border-red-500/20 rounded-lg text-xs text-red-400">错误: {task.error}</div>}
                      <div className="mt-3 flex items-center gap-2">
                        {task.status === 'completed' && task.result && (
                          <button onClick={() => setPreviewTaskId(task.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg hover:bg-cyan-500/20 transition-colors text-xs font-medium border border-cyan-500/20">
                            <Eye className="w-3 h-3" />查看结果
                          </button>
                        )}
                        {task.result?.content && (
                          <>
                            <button onClick={() => { const b = new Blob([task.result!.content], { type: 'text/markdown' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `${task.name}-${task.phase}.md`; a.click(); URL.revokeObjectURL(u); }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-xs font-medium">
                              <Download className="w-3 h-3" />导出MD
                            </button>
                            <button onClick={() => exportToWord(task.result!.content, `${task.name}-${task.phase}`)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-xs font-medium">
                              <FileText className="w-3 h-3" />导出Word
                            </button>
                          </>
                        )}
                        <button onClick={e => handleDelete(task.id, e)} className="inline-flex items-center gap-1 px-3 py-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-xs font-medium ml-auto">
                          <Trash2 className="w-3 h-3" />删除
                        </button>
                      </div>
                    </div>
                  </div>
                  {previewTaskId !== task.id && task.status === 'completed' && task.result && (
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                      <h4 className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1"><FileText className="w-3 h-3" />结果预览</h4>
                      <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-4 max-h-[250px] overflow-y-auto">
                        <MarkdownRenderer content={task.result.content.slice(0, 1000) + (task.result.content.length > 1000 ? '...' : '')} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card text-center py-16">
            <History className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-700" />
            <h3 className="text-xl font-semibold text-slate-500 dark:text-slate-400 mb-2">暂无历史记录</h3>
            <p className="text-slate-400 dark:text-slate-600 mb-6">开始您的第一个RTA分析任务吧</p>
            <Link href="/analysis" className="cyan-btn inline-flex items-center gap-2 px-6 py-3"><ArrowRight className="w-4 h-4" />前往分析</Link>
          </div>
        )}

        {previewTaskId && tasks.find(t => t.id === previewTaskId)?.result?.content && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPreviewTaskId(null)}>
            <div className="relative w-full max-w-4xl max-h-[85vh] mx-4" onClick={e => e.stopPropagation()}>
              <div className="card max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-cyan-400" />
                    {tasks.find(t => t.id === previewTaskId)?.name || '分析结果'}
                  </h2>
                  <button onClick={() => setPreviewTaskId(null)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                    <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 min-h-0">
                  <MarkdownRenderer content={tasks.find(t => t.id === previewTaskId)!.result!.content} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
