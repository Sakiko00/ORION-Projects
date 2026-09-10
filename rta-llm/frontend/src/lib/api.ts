import axios from 'axios';
import type { Task, LLMConfig, DataFile, AnalysisResult, RTAPhase } from '@/types/rta';

const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const taskApi = {
  create: async (data: Partial<Task>): Promise<Task> => {
    const response = await api.post<Task>('/tasks', data);
    return response.data;
  },

  list: async (): Promise<Task[]> => {
    const response = await api.get<Task[]>('/tasks');
    return response.data;
  },

  get: async (id: string): Promise<Task> => {
    const response = await api.get<Task>(`/tasks/${id}`);
    return response.data;
  },

  update: async (id: string, data: Partial<Task>): Promise<Task> => {
    const response = await api.patch<Task>(`/tasks/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/tasks/${id}`);
  },

  getProgress: async (id: string): Promise<{ progress: number; status: string }> => {
    const response = await api.get(`/tasks/${id}/progress`);
    return response.data;
  },
};

export const llmConfigApi = {
  get: async (): Promise<LLMConfig> => {
    const response = await api.get<LLMConfig>('/llm/config');
    return response.data;
  },

  save: async (config: LLMConfig): Promise<LLMConfig> => {
    const response = await api.post<LLMConfig>('/llm/config', config);
    return response.data;
  },

  test: async (config: LLMConfig): Promise<{ success: boolean; message: string }> => {
    const response = await api.post('/llm/test', config);
    return response.data;
  },
};

export const dataApi = {
  upload: async (file: File): Promise<DataFile> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<DataFile>('/data/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  list: async (): Promise<DataFile[]> => {
    const response = await api.get<DataFile[]>('/data/files');
    return response.data;
  },

  get: async (id: string): Promise<DataFile> => {
    const response = await api.get<DataFile>(`/data/files/${id}`);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/data/files/${id}`);
  },
};

export const analysisApi = {
  execute: async (phase: RTAPhase, taskId: string, data?: Record<string, unknown>): Promise<AnalysisResult> => {
    const response = await api.post<AnalysisResult>(`/analysis/${phase}`, { taskId, ...data });
    return response.data;
  },

  getResults: async (taskId: string): Promise<AnalysisResult[]> => {
    const response = await api.get<AnalysisResult[]>(`/analysis/results/${taskId}`);
    return response.data;
  },
};

export default api;
