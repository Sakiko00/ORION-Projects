export type RTAPhase =
  | 'familiarize'
  | 'code'
  | 'themes'
  | 'review'
  | 'define'
  | 'report'
  | 'full';

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type LLMProvider = 'mock' | 'openai' | 'claude' | 'gemini' | 'deepseek' | 'minimax' | 'doubao' | 'kimi' | 'custom';

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey: string;
  apiEndpoint?: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  systemPrompt?: string;
  skipGenerationParams?: boolean;
}

export interface RTAPhaseInfo {
  id: RTAPhase;
  name: string;
  description: string;
  icon: string;
}

export const RTA_PHASES: RTAPhaseInfo[] = [
  {
    id: 'full',
    name: '全流程分析',
    description: '一次性执行所有 RTA 阶段，自动串联完整分析流程',
    icon: 'Zap',
  },
  {
    id: 'familiarize',
    name: '数据熟悉',
    description: '熟悉研究数据，识别主要主题和模式',
    icon: 'Search',
  },
  {
    id: 'code',
    name: '初始编码',
    description: '对文本进行系统编码，捕捉核心意义',
    icon: 'Tag',
  },
  {
    id: 'themes',
    name: '主题构建',
    description: '将编码聚类为潜在主题',
    icon: 'Layers',
  },
  {
    id: 'review',
    name: '主题审视',
    description: '审视和优化已构建的主题',
    icon: 'Eye',
  },
  {
    id: 'define',
    name: '主题定义',
    description: '为主题定义清晰的边界和核心陈述',
    icon: 'FileText',
  },
  {
    id: 'report',
    name: '报告撰写',
    description: '撰写完整的研究分析报告',
    icon: 'FileCheck',
  },
];

export interface Task {
  id: string;
  name: string;
  description?: string;
  status: TaskStatus;
  phase: RTAPhase;
  progress: number;
  config: LLMConfig;
  dataFileId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  result?: AnalysisResult;
  error?: string;
}

export interface AnalysisResult {
  phase: RTAPhase;
  content: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface Code {
  id: string;
  name: string;
  description: string;
  data: string;
  frequency: number;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  codes: string[];
  subThemes?: string[];
  coreStatement?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  tasks: Task[];
}

export interface DataFile {
  id: string;
  name: string;
  type: string;
  size: number;
  content?: string;
  uploadedAt: string;
}
