'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import anime from 'animejs';
import { useTaskStore } from '@/stores/taskStore';
import { useConfigStore } from '@/stores/configStore';
import { RTA_PHASES, type RTAPhase } from '@/types/rta';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer';
import {
  Search, Tag, Layers, Eye, FileText, FileCheck, Upload,
  Loader2, CheckCircle2, AlertCircle, X, ChevronRight, Sparkles,
  Zap, ChevronDown, ChevronUp, Terminal, BarChart3, Timer,
  Hash, Activity, Send, Hexagon,
} from 'lucide-react';

interface ProgressLog {
  id: string; timestamp: string; phase: string; phaseName: string;
  status: 'running' | 'done' | 'error'; message: string;
  duration?: number; preview?: string; fullContent?: string;
  tokenCount?: { input?: number; output?: number }; expanded?: boolean;
}

const PHASE_ICONS: Record<string, React.ReactNode> = {
  full: <Zap className="w-4 h-4" />, familiarize: <Search className="w-4 h-4" />,
  code: <Tag className="w-4 h-4" />, themes: <Layers className="w-4 h-4" />,
  review: <Eye className="w-4 h-4" />, define: <FileText className="w-4 h-4" />,
  report: <FileCheck className="w-4 h-4" />,
};
const BACKEND = '';
const PHASE_NAMES: Record<string, string> = {
  familiarize: '数据熟悉', code: '初始编码', themes: '主题构建',
  review: '主题审视', define: '主题定义', report: '报告撰写', full: '全流程分析',
};
function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  if (Number(s) < 60) return `${s}s`;
  return `${Math.floor(Number(s) / 60)}m ${(Number(s) % 60).toFixed(0)}s`;
}
function getTimeLabel() { return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

export default function AnalysisPage() {
  const { currentTask, createTask, setTaskResult, updateTaskStatus } = useTaskStore();
  const { config } = useConfigStore();
  const [selectedPhase, setSelectedPhase] = useState<RTAPhase>('full');
  const [taskName, setTaskName] = useState('');
  const [inputData, setInputData] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progressLogs, setProgressLogs] = useState<ProgressLog[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [currentPhaseLabel, setCurrentPhaseLabel] = useState('');
  const [totalTokens, setTotalTokens] = useState(0);
  const [startTime, setStartTime] = useState(0);

  const phaseGridRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phaseGridRef.current?.children) {
      anime({ targets: phaseGridRef.current.children, opacity: [0, 1], scale: [0.95, 1], duration: 500, delay: anime.stagger(50), easing: 'easeOutCubic' });
    }
  }, []);

  useEffect(() => {
    if (logContainerRef.current && progressLogs.length > 0) {
      const last = logContainerRef.current.lastElementChild;
      if (last) {
        anime({ targets: last, opacity: [0, 1], translateX: [-30, 0], duration: 400, easing: 'easeOutCubic' });
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      }
    }
  }, [progressLogs.length]);

  const addLog = useCallback((log: Omit<ProgressLog, 'id' | 'timestamp'>) => {
    setProgressLogs(prev => [...prev, { ...log, id: crypto.randomUUID(), timestamp: getTimeLabel() }]);
  }, []);
  const toggleLogExpanded = useCallback((id: string) => {
    setProgressLogs(prev => prev.map(l => l.id === id ? { ...l, expanded: !l.expanded } : l));
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { const r = new FileReader(); r.onload = (ev) => setInputData(ev.target?.result as string); r.readAsText(file); }
  }, []);

  const handleStartAnalysis = async () => {
    if (!taskName.trim()) { setError('请输入任务名称'); return; }
    if (!inputData.trim()) { setError('请输入分析数据或上传文件'); return; }
    if (config.provider !== 'mock' && !config.apiKey) { setError('请先在设置页面配置LLM参数'); return; }
    setError(null); setIsProcessing(true); setResult(''); setShowResult(false);
    setProgressLogs([]); setOverallProgress(0); setCurrentPhaseLabel(''); setTotalTokens(0); setStartTime(Date.now());

    try {
      addLog({ phase: 'init', phaseName: '初始化', status: 'running', message: '正在创建分析任务...' });
      let task: Awaited<ReturnType<typeof createTask>>;
      try { task = await createTask(taskName, selectedPhase, config); }
      catch (e) { throw new Error(`创建任务失败: ${e instanceof Error ? e.message : String(e)}`); }
      addLog({ phase: 'init', phaseName: '初始化', status: 'done', message: `任务"${taskName}"创建成功 (ID: ${task.id.slice(0, 8)}...)` });

      if (selectedPhase === 'full') {
        const phases = ['familiarize', 'code', 'themes', 'review', 'define', 'report'];
        const fullResults: string[] = [];
        for (let i = 0; i < phases.length; i++) {
          const phase = phases[i], phaseName = PHASE_NAMES[phase], phaseStart = Date.now();
          setCurrentPhaseLabel(`${i + 1}/${phases.length} ${phaseName}`);
          setOverallProgress(Math.round((i / phases.length) * 100));
          addLog({ phase, phaseName, status: 'running', message: `正在调用大模型执行"${phaseName}"分析...` });

          let response: Response;
          try { response = await fetch(`${BACKEND}/api/analysis/${phase}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: task.id, data: i === 0 ? inputData : fullResults[i - 1], config }) }); }
          catch (e) { throw new Error(`网络请求失败: ${e instanceof Error ? e.message : String(e)}`); }

          let data: Record<string, unknown>;
          try { data = await response.json(); } catch { const t = await response.text().catch(() => ''); throw new Error(`服务返回了非JSON响应 (HTTP ${response.status}): ${t.slice(0, 200)}`); }
          const duration = Date.now() - phaseStart;

          if (!response.ok) {
            const errMsg = (data.message as string) || (data.error as string) || `HTTP ${response.status}`;
            addLog({ phase, phaseName, status: 'error', message: errMsg, duration });
            throw new Error(`${phaseName}失败: ${errMsg}`);
          }
          fullResults.push(data.content as string);
          const cs = data.content as string;
          const md = data.metadata as Record<string, unknown> | undefined;
          const usage = md?.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
          const pt = usage ? (usage.prompt_tokens || 0) + (usage.completion_tokens || 0) : 0;
          setTotalTokens(prev => prev + pt);
          addLog({ phase, phaseName, status: 'done', message: `"${phaseName}"阶段完成`, duration, preview: cs.slice(0, 500) + (cs.length > 500 ? '...' : ''), fullContent: cs, tokenCount: usage ? { input: usage.prompt_tokens, output: usage.completion_tokens } : undefined });
        }
        setCurrentPhaseLabel('全流程完成'); setOverallProgress(100);
        const report = fullResults.join('\n\n---\n\n'); setResult(report);
        setTaskResult(task.id, { phase: 'full', content: report }); setShowResult(true); updateTaskStatus(task.id, 'completed', 100);

        fetch(`${BACKEND}/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'completed',
            progress: 100,
            result: { phase: 'full', content: report, summary: '全流程 RTA 分析完成' },
            completedAt: new Date().toISOString(),
          }),
        }).catch(e => console.error('[FinalPATCH]', e));
      } else {
        const phaseName = PHASE_NAMES[selectedPhase]; setCurrentPhaseLabel(phaseName); setOverallProgress(10); const phaseStart = Date.now();
        addLog({ phase: selectedPhase, phaseName, status: 'running', message: `正在调用大模型执行"${phaseName}"分析...` });

        let response: Response;
        try { response = await fetch(`${BACKEND}/api/analysis/${selectedPhase}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: task.id, data: inputData, config }) }); }
        catch (e) { throw new Error(`网络请求失败: ${e instanceof Error ? e.message : String(e)}`); }

        let data: Record<string, unknown>;
        try { data = await response.json(); } catch { const t = await response.text().catch(() => ''); throw new Error(`服务返回了非JSON响应 (HTTP ${response.status}): ${t.slice(0, 200)}`); }
        const duration = Date.now() - phaseStart;
        if (!response.ok) { const em = (data.message as string) || (data.error as string) || `HTTP ${response.status}`; addLog({ phase: selectedPhase, phaseName, status: 'error', message: em, duration }); throw new Error(`${phaseName}失败: ${em}`); }

        const md = data.metadata as Record<string, unknown> | undefined;
        const usage = md?.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
        if (usage) setTotalTokens((usage.prompt_tokens || 0) + (usage.completion_tokens || 0));
        const cs = data.content as string;
        addLog({ phase: selectedPhase, phaseName, status: 'done', message: `"${phaseName}"阶段完成`, duration, preview: cs.slice(0, 500) + (cs.length > 500 ? '...' : ''), fullContent: cs, tokenCount: usage ? { input: usage.prompt_tokens, output: usage.completion_tokens } : undefined });
        setOverallProgress(100); setCurrentPhaseLabel('完成'); setResult(cs); setTaskResult(task.id, { phase: selectedPhase, content: cs }); setShowResult(true); updateTaskStatus(task.id, 'completed', 100);

        fetch(`${BACKEND}/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'completed',
            progress: 100,
            result: { phase: selectedPhase, content: cs, summary: `${phaseName}分析完成` },
            completedAt: new Date().toISOString(),
          }),
        }).catch(e => console.error('[FinalPATCH]', e));
      }
    } catch (err) {
      const em = err instanceof Error ? err.message : String(err); console.error('[RTA Analysis Error]', err);
      setError(em || '分析过程中出现错误，请重试'); if (currentTask) updateTaskStatus(currentTask.id, 'failed', 0);
    } finally { setIsProcessing(false); }
  };

  const currentPhaseInfo = RTA_PHASES.find(p => p.id === selectedPhase);
  const elapsedSec = startTime ? ((Date.now() - startTime) / 1000).toFixed(1) : '0';

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-cyan-400 tracking-widest uppercase"><Hexagon className="w-3 h-3" />Analysis Workspace</div>
          <h1 className="text-3xl font-extrabold tracking-tight"><span className="cyan-text">分析工作台</span></h1>
          <p className="text-slate-500 dark:text-slate-400">选择RTA阶段，输入数据，开始智能分析</p>
        </header>

        {isProcessing ? (
          <div className="space-y-6">
            <div className="card">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400/20 to-teal-400/20 flex items-center justify-center border border-cyan-500/20 animate-pulse-glow">
                  <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">正在执行 {selectedPhase === 'full' ? '全流程' : ''} RTA 分析</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{taskName}</p>
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1"><Timer className="w-4 h-4 text-cyan-400" />{elapsedSec}s</span>
                  <span className="flex items-center gap-1"><Hash className="w-4 h-4 text-cyan-400" />{totalTokens.toLocaleString()}</span>
                </div>
              </div>
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{currentPhaseLabel}</span>
                  <span className="text-sm font-bold text-cyan-400">{overallProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-400 to-teal-400 rounded-full transition-all duration-700 ease-out" style={{ width: `${overallProgress || 2}%` }} />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2"><Terminal className="w-4 h-4 text-cyan-400" />执行日志</h3>
                <div ref={logContainerRef} className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {progressLogs.map(log => (
                    <div key={log.id} className={`rounded-xl p-3 border transition-all ${log.status === 'running' ? 'border-cyan-500/20 bg-cyan-500/5' : ''}${log.status === 'done' ? 'border-emerald-500/10 bg-slate-50 dark:bg-slate-900/40' : ''}${log.status === 'error' ? 'border-red-500/20 bg-red-500/5' : ''}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-slate-400 dark:text-slate-600 w-14 shrink-0">{log.timestamp}</span>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${log.status === 'running' ? 'bg-cyan-400 animate-pulse' : ''}${log.status === 'done' ? 'bg-emerald-400' : ''}${log.status === 'error' ? 'bg-red-400' : ''}`} />
                        <span className={`text-sm font-medium ${log.status === 'error' ? 'text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>{log.phaseName}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 flex-1">{log.message}</span>
                        {log.duration && <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-0.5"><Timer className="w-3 h-3" />{formatDuration(log.duration)}</span>}
                        {log.tokenCount && <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-0.5"><Hash className="w-3 h-3" />in:{log.tokenCount.input?.toLocaleString()} out:{log.tokenCount.output?.toLocaleString()}</span>}
                        {log.preview && <button onClick={() => toggleLogExpanded(log.id)} className="text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 flex items-center gap-0.5 shrink-0">{log.expanded ? <><ChevronUp className="w-3 h-3" />收起内容</> : <><ChevronDown className="w-3 h-3" />查看内容</>}</button>}
                      </div>
                      {log.expanded && log.fullContent && <div className="mt-3 ml-[4.5rem] p-4 bg-slate-50 dark:bg-slate-950/50 rounded-lg border border-slate-200 dark:border-slate-800 max-h-[600px] overflow-y-auto"><MarkdownRenderer content={log.fullContent} /></div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="card">
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-5 flex items-center gap-2"><Sparkles className="w-5 h-5 text-cyan-400" />选择分析阶段</h2>
                  <div ref={phaseGridRef} className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                    {RTA_PHASES.map(phase => (
                      <button key={phase.id} onClick={() => setSelectedPhase(phase.id)}
                        className={`relative p-4 rounded-xl border transition-all duration-300 text-left ${selectedPhase === phase.id ? 'border-cyan-400/40 bg-gradient-to-br from-cyan-500/10 to-teal-500/5 shadow-[0_0_20px_rgba(6,182,212,0.1)]' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50 dark:bg-slate-900/30'}`}>
                        <div className={`w-9 h-9 rounded-lg mb-3 flex items-center justify-center ${selectedPhase === phase.id ? 'bg-gradient-to-br from-cyan-400 to-teal-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>
                          {PHASE_ICONS[phase.id]}
                        </div>
                        <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-sm">{phase.name}</h3>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 line-clamp-2">{phase.description}</p>
                        {selectedPhase === phase.id && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-cyan-400 animate-pulse-glow" />}
                      </button>
                    ))}
                  </div>
                  {currentPhaseInfo && (
                    <div className="rounded-xl p-4 bg-gradient-to-r from-cyan-500/5 to-teal-500/5 border border-cyan-500/10 mb-6">
                      <h3 className="font-semibold text-cyan-600 dark:text-cyan-300 mb-1">{currentPhaseInfo.name}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{currentPhaseInfo.description}</p>
                    </div>
                  )}
                  <div className="space-y-4">
                    <div><label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">任务名称</label><input type="text" value={taskName} onChange={e => setTaskName(e.target.value)} placeholder="例如：访谈数据分析-第一轮" className="input-field" /></div>
                    <div><label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">分析数据</label><textarea value={inputData} onChange={e => setInputData(e.target.value)} placeholder="粘贴您的研究文本数据（访谈记录、问卷答案等）..." rows={8} className="input-field resize-none" /></div>
                    <div className="flex items-center gap-4">
                      <label className="flex-1"><input type="file" accept=".txt,.md,.csv" onChange={handleFileUpload} className="hidden" />
                        <div className="flex items-center justify-center gap-2 px-6 py-3 border-2 border-dashed border-cyan-500/20 rounded-xl cursor-pointer hover:border-cyan-400/40 hover:bg-cyan-500/5 transition-all">
                          <Upload className="w-5 h-5 text-cyan-400" /><span className="text-sm text-slate-500 dark:text-slate-400">上传文件</span>
                        </div>
                      </label>
                    </div>
                    {error && <div className="flex items-center gap-2 p-4 bg-red-500/5 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400"><AlertCircle className="w-5 h-5" /><span className="text-sm">{error}</span></div>}
                    <button onClick={handleStartAnalysis} disabled={isProcessing}
                      className={`w-full py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all duration-300 ${isProcessing ? 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed' : 'cyan-btn'}`}>
                      {isProcessing ? <><Loader2 className="w-5 h-5 animate-spin" />分析中...</> : <><Send className="w-5 h-5" />开始分析<ChevronRight className="w-5 h-5" /></>}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {showResult && result && (
                  <div className="card">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-400" />分析结果</h3>
                      <button onClick={() => setShowResult(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"><X className="w-4 h-4 text-slate-400 dark:text-slate-500" /></button>
                    </div>
                    <div className="max-h-[500px] overflow-y-auto"><MarkdownRenderer content={result} /></div>
                  </div>
                )}
                <div className="card">
                  <h3 className="font-semibold text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2 text-sm"><Activity className="w-4 h-4 text-cyan-400" />当前配置</h3>
                  {config.provider === 'mock' && (
                    <div className="mb-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl text-xs text-amber-600 dark:text-amber-400">🧪 Mock 模式 — 使用内置模拟响应测试完整流程</div>
                  )}
                  <div className="space-y-2 text-sm">
                    {[{ k: 'Provider', v: config.provider }, { k: 'Model', v: config.model }, { k: 'Temperature', v: config.skipGenerationParams ? '默认' : config.temperature }, { k: 'Max Tokens', v: config.skipGenerationParams ? '默认' : config.maxTokens }].map(r => (
                      <div key={r.k} className="flex justify-between"><span className="text-slate-400 dark:text-slate-500">{r.k}</span><span className="text-slate-700 dark:text-slate-300 font-medium">{r.v}</span></div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-600">输入数据约 {(new Blob([inputData]).size / 1024).toFixed(1)} KB</div>
                </div>
              </div>
            </div>
          </>
        )}

        {showResult && result && !isProcessing && (
          <div className="max-w-4xl">
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-400" />完整分析结果
                  <span className="text-xs font-normal text-slate-400 dark:text-slate-500 ml-2">耗时 {elapsedSec}s · {totalTokens.toLocaleString()} tokens</span>
                </h3>
                <button onClick={() => setShowResult(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"><X className="w-4 h-4 text-slate-400 dark:text-slate-500" /></button>
              </div>
              <div className="max-h-[800px] overflow-y-auto prose max-w-none"><MarkdownRenderer content={result} /></div>
            </div>
          </div>
        )}

        {progressLogs.length > 0 && !isProcessing && (
          <div className="max-w-4xl">
            <div className="card">
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-cyan-400" />执行摘要</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/10"><div className="text-2xl font-bold text-cyan-400">{progressLogs.length}</div><div className="text-xs text-slate-400 dark:text-slate-500 mt-1">任务步骤</div></div>
                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10"><div className="text-2xl font-bold text-emerald-400">{totalTokens.toLocaleString()}</div><div className="text-xs text-slate-400 dark:text-slate-500 mt-1">消耗 Tokens</div></div>
                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10"><div className="text-2xl font-bold text-amber-400">{elapsedSec}s</div><div className="text-xs text-slate-400 dark:text-slate-500 mt-1">总耗时</div></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
