'use client';

import React, { useState, useRef, useEffect } from 'react';
import anime from 'animejs';
import { useConfigStore, MODEL_OPTIONS } from '@/stores/configStore';
import type { LLMProvider } from '@/types/rta';
import { Save, TestTube2, CheckCircle2, XCircle, RefreshCw, Key, Globe, Sliders, MessageSquare, Loader2, Hexagon } from 'lucide-react';

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  mock: '🧪 Mock',
  openai: 'OpenAI', claude: 'Claude', gemini: 'Gemini',
  deepseek: 'DeepSeek', minimax: 'MiniMax', doubao: '豆包', kimi: 'Kimi',
  custom: '自定义',
};

export default function SettingsPage() {
  const { config, setConfig, saveConfig, testConnection, resetConfig } = useConfigStore();
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    cardRefs.current.forEach((el, i) => {
      if (el) anime({ targets: el, opacity: [0, 1], translateY: [20, 0], duration: 600, delay: 150 + i * 100, easing: 'easeOutCubic' });
    });
  }, []);

  const handleProviderChange = (provider: LLMProvider) => {
    const defaultModel = MODEL_OPTIONS[provider]?.[0] || '';
    setConfig({ provider, model: defaultModel });
    if (provider !== 'custom') setConfig({ apiEndpoint: '' });
  };

  const handleTestConnection = async () => { setIsTesting(true); setTestResult(null); const r = await testConnection(); setTestResult(r); setIsTesting(false); };
  const handleSave = async () => { await saveConfig(); };
  const tokenMarks = [1000, 2000, 4000, 8000, 16000];

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-cyan-400 tracking-widest uppercase"><Hexagon className="w-3 h-3" />Model Configuration</div>
          <h1 className="text-3xl font-extrabold tracking-tight"><span className="cyan-text">LLM设置</span></h1>
          <p className="text-slate-500 dark:text-slate-400">配置您的大模型参数和API密钥</p>
        </header>

        <div ref={el => { cardRefs.current[0] = el; }} className="card">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-5 flex items-center gap-2"><Key className="w-5 h-5 text-cyan-400" />API配置</h2>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">模型提供商</label>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {(Object.keys(PROVIDER_LABELS) as LLMProvider[]).map(p => (
                  <button key={p} onClick={() => handleProviderChange(p)}
                    className={`p-3 rounded-xl border text-xs font-medium transition-all duration-300 ${config.provider === p ? 'border-cyan-400/50 bg-gradient-to-br from-cyan-500/15 to-teal-500/10 text-cyan-600 dark:text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.1)]' : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-700 dark:hover:text-slate-300 bg-slate-50 dark:bg-slate-900/30'}`}>
                    {PROVIDER_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">API密钥</label>
                <input type="password" value={config.apiKey} onChange={e => setConfig({ apiKey: e.target.value })}
                  placeholder="sk-..." className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">模型选择</label>
                {config.provider === 'custom' ? (
                  <input type="text" value={config.model} onChange={e => setConfig({ model: e.target.value })} placeholder="例如: gpt-4, claude-3" className="input-field" />
                ) : (
                  <select value={config.model} onChange={e => setConfig({ model: e.target.value })}
                    className="input-field appearance-none cursor-pointer">
                    {MODEL_OPTIONS[config.provider]?.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
              </div>
            </div>

            {config.provider === 'custom' && (
              <div>
                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2"><Globe className="w-4 h-4 inline mr-1" />API端点（可选）</label>
                <input type="url" value={config.apiEndpoint || ''} onChange={e => setConfig({ apiEndpoint: e.target.value })}
                  placeholder="https://api.openai.com/v1/chat/completions" className="input-field" />
              </div>
            )}
          </div>
        </div>

        <div ref={el => { cardRefs.current[1] = el; }} className="card">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-5 flex items-center gap-2"><Sliders className="w-5 h-5 text-cyan-400" />生成参数</h2>
          <div className={`space-y-5 ${config.skipGenerationParams ? 'opacity-30 pointer-events-none' : ''}`}>
            {[{ label: 'Temperature', value: config.temperature, min: 0, max: 1, step: 0.1, marks: ['精确', '平衡', '创意'] },
              { label: 'Max Tokens', value: config.maxTokens, min: 1000, max: 16000, step: 1000, marks: tokenMarks.map(m => `${m / 1000}k`) },
              { label: 'Top-P', value: config.topP ?? 1, min: 0, max: 1, step: 0.1, marks: undefined }].map(field => (
              <div key={field.label}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-500 dark:text-slate-400">{field.label}</span>
                  <span className="text-sm text-cyan-400 font-medium">{field.value}</span>
                </div>
                <input type="range" min={field.min} max={field.max} step={field.step} value={field.value}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    if (field.label === 'Temperature') setConfig({ temperature: v });
                    else if (field.label === 'Max Tokens') setConfig({ maxTokens: v });
                    else setConfig({ topP: v });
                  }}
                  disabled={config.skipGenerationParams}
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full appearance-none cursor-pointer accent-cyan-400" />
                {field.marks && <div className="flex justify-between mt-1 text-[10px] text-slate-400 dark:text-slate-600">{field.marks.map((m, i) => <span key={i}>{m}</span>)}</div>}
              </div>
            ))}
          </div>
          <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-800">
            <label className="flex items-center justify-between cursor-pointer">
              <div><span className="text-sm font-medium text-slate-700 dark:text-slate-300">不传入生成参数</span><p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">部分推理模型只接受默认参数</p></div>
              <button type="button" role="switch" aria-checked={config.skipGenerationParams} onClick={() => setConfig({ skipGenerationParams: !config.skipGenerationParams })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${config.skipGenerationParams ? 'bg-cyan-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition duration-200 ${config.skipGenerationParams ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </label>
          </div>
        </div>

        <div ref={el => { cardRefs.current[2] = el; }} className="card">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-5 flex items-center gap-2"><MessageSquare className="w-5 h-5 text-cyan-400" />系统提示词</h2>
          <textarea value={config.systemPrompt || ''} onChange={e => setConfig({ systemPrompt: e.target.value })}
            placeholder="定义LLM的角色和行为..." rows={5} className="input-field resize-none" />
          <p className="text-xs text-slate-400 dark:text-slate-600 mt-2">系统提示词将指导LLM在RTA分析中的行为和输出格式</p>
        </div>

        <div ref={el => { cardRefs.current[3] = el; }} className="flex flex-wrap gap-4">
          <button onClick={handleSave} className="cyan-btn flex-1 min-w-[180px] py-3.5 flex items-center justify-center gap-2"><Save className="w-4 h-4" />保存配置</button>
          <button onClick={handleTestConnection} disabled={isTesting}
            className="flex-1 min-w-[180px] py-3.5 rounded-xl font-semibold border border-cyan-500/30 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 transition-all flex items-center justify-center gap-2">
            {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube2 className="w-4 h-4" />}测试连接</button>
          <button onClick={resetConfig} className="px-6 py-3.5 rounded-xl font-medium text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-all flex items-center gap-2"><RefreshCw className="w-4 h-4" />重置</button>
        </div>

        {testResult && (
          <div className={`p-4 rounded-xl border flex items-center gap-3 ${testResult.success ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/5 border-red-500/20 text-red-600 dark:text-red-400'}`}>
            {testResult.success ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
            <span className="text-sm">{testResult.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}
