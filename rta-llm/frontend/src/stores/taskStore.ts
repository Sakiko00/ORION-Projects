import { create } from 'zustand';
import type { Task, TaskStatus, RTAPhase, LLMConfig } from '@/types/rta';
import { taskApi } from '@/lib/api';

interface TaskStore {
  tasks: Task[];
  currentTask: Task | null;
  isLoading: boolean;
  error: string | null;

  fetchTasks: () => Promise<void>;
  createTask: (name: string, phase: RTAPhase, config: LLMConfig, dataFileId?: string) => Promise<Task>;
  updateTaskStatus: (id: string, status: TaskStatus, progress?: number) => void;
  setCurrentTask: (task: Task | null) => void;
  deleteTask: (id: string) => Promise<void>;
  setTaskResult: (id: string, result: Task['result']) => void;
  setTaskError: (id: string, error: string) => void;
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],
  currentTask: null,
  isLoading: false,
  error: null,

  fetchTasks: async () => {
    set({ isLoading: true, error: null });
    try {
      const tasks = await taskApi.list();
      set({ tasks, isLoading: false });
    } catch (_error) {
      set({ error: 'Failed to fetch tasks', isLoading: false });
    }
  },

  createTask: async (name, phase, config, dataFileId) => {
    set({ isLoading: true, error: null });
    try {
      const task = await taskApi.create({
        name,
        phase,
        config,
        dataFileId,
        status: 'pending',
        progress: 0,
      });
      set((state) => ({
        tasks: [task, ...state.tasks],
        currentTask: task,
        isLoading: false,
      }));
      return task;
    } catch (error) {
      set({ error: 'Failed to create task', isLoading: false });
      throw error;
    }
  },

  updateTaskStatus: (id, status, progress) => {
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id
          ? { ...task, status, progress: progress ?? task.progress, updatedAt: new Date().toISOString() }
          : task
      ),
      currentTask:
        state.currentTask?.id === id
          ? { ...state.currentTask, status, progress: progress ?? state.currentTask.progress }
          : state.currentTask,
    }));
  },

  setCurrentTask: (task) => {
    set({ currentTask: task });
  },

  deleteTask: async (id) => {
    try {
      await taskApi.delete(id);
      set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== id),
        currentTask: state.currentTask?.id === id ? null : state.currentTask,
      }));
    } catch {
      set({ error: 'Failed to delete task' });
    }
  },

  setTaskResult: (id, result) => {
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id ? { ...task, result, status: 'completed' as TaskStatus } : task
      ),
      currentTask:
        state.currentTask?.id === id ? { ...state.currentTask, result, status: 'completed' as TaskStatus } : state.currentTask,
    }));
  },

  setTaskError: (id, error) => {
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id ? { ...task, error, status: 'failed' as TaskStatus } : task
      ),
      currentTask:
        state.currentTask?.id === id ? { ...state.currentTask, error, status: 'failed' as TaskStatus } : state.currentTask,
    }));
  },
}));
