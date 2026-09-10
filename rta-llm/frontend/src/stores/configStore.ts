import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LLMConfig, LLMProvider } from '@/types/rta';
import { llmConfigApi } from '@/lib/api';

interface ConfigStore {
  config: LLMConfig;
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;

  setConfig: (config: Partial<LLMConfig>) => void;
  saveConfig: () => Promise<void>;
  loadConfig: () => Promise<void>;
  testConnection: () => Promise<{ success: boolean; message: string }>;
  resetConfig: () => void;
}

const defaultConfig: LLMConfig = {
  provider: 'mock',
  model: 'mock',
  apiKey: '',
  apiEndpoint: '',
  temperature: 0.7,
  maxTokens: 4000,
  topP: 1,
  systemPrompt: '你是一位专业的质性研究分析师，擅长反思性主题分析法(RTA)。',
  skipGenerationParams: false,
};

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set, get) => ({
      config: defaultConfig,
      isLoading: false,
      error: null,
      isSaving: false,

      setConfig: (newConfig) => {
        set((state) => ({
          config: { ...state.config, ...newConfig },
        }));
      },

      saveConfig: async () => {
        const { config } = get();
        set({ isSaving: true, error: null });
        try {
          await llmConfigApi.save(config);
          set({ isSaving: false });
        } catch (_error) {
          set({ error: 'Failed to save config', isSaving: false });
        }
      },

      loadConfig: async () => {
        set({ isLoading: true, error: null });
        try {
          const config = await llmConfigApi.get();
          set({ config, isLoading: false });
        } catch {
          set({ config: defaultConfig, isLoading: false });
        }
      },

      testConnection: async () => {
        const { config } = get();
        set({ isLoading: true, error: null });
        try {
          const result = await llmConfigApi.test(config);
          set({ isLoading: false });
          return result;
        } catch {
          set({ error: 'Connection test failed', isLoading: false });
          return { success: false, message: 'Connection test failed' };
        }
      },

      resetConfig: () => {
        set({ config: defaultConfig });
      },
    }),
    {
      name: 'rta-llm-config',
      partialize: (state) => ({ config: state.config }),
    }
  )
);

export const MODEL_OPTIONS: Record<LLMProvider, string[]> = {
  mock: ['mock'],
  openai: [
    'gpt-5.2',
    'gpt-5.2-mini',
    'gpt-5.2-nano',
    'gpt-5.1',
    'gpt-5.1-mini',
    'gpt-5',
    'gpt-5-mini',
    'gpt-5-nano',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'gpt-4o',
    'gpt-4o-mini',
    'o4-mini',
    'o3',
  ],
  claude: [
    'claude-opus-4-6',
    'claude-sonnet-4-5-20250929',
    'claude-sonnet-4-5',
    'claude-haiku-4-5-20251001',
    'claude-haiku-4-5',
  ],
  gemini: [
    'gemini-3.1-flash-lite',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-pro',
  ],
  deepseek: [
    'deepseek-v4-pro',
    'deepseek-v4-flash',
    'deepseek-chat',
    'deepseek-reasoner',
  ],
  minimax: [
    'MiniMax-M2.7',
    'MiniMax-M2.1',
    'MiniMax-M2.1-lightning',
    'MiniMax-M2',
    'MiniMax-M1',
    'MiniMax-Text-01',
    'abab6.5s-chat',
  ],
  doubao: [
    'doubao-seed-1.8',
    'doubao-seed-1.6',
    'doubao-seed-1.6-thinking',
    'doubao-seed-1.6-flash',
    'doubao-seed-1.6-lite',
    'doubao-seed-1.6-vision',
    'doubao-1-5-pro-32k-250115',
    'doubao-pro-128k',
    'doubao-pro-32k',
    'doubao-lite-32k',
  ],
  kimi: [
    'kimi-k2.5',
    'kimi-k2-thinking',
    'kimi-k2-thinking-turbo',
    'kimi-k2-0905-preview',
    'kimi-k2-0711-preview',
    'kimi-k2-turbo-preview',
    'moonshot-v1-128k',
    'moonshot-v1-32k',
    'moonshot-v1-8k',
  ],
  custom: [],
};
