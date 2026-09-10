import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task, TaskStatus } from '../../entities/task.entity';

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
  ) {}

  async create(data: Partial<Task>): Promise<Task> {
    const task = this.taskRepository.create({
      ...data,
      status: TaskStatus.PENDING,
      progress: 0,
    });
    return this.taskRepository.save(task);
  }

  async findAll(): Promise<Task[]> {
    return this.taskRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Task> {
    const task = await this.taskRepository.findOne({ where: { id } });
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return task;
  }

  async update(id: string, data: Partial<Task>): Promise<Task> {
    const task = await this.findOne(id);
    Object.assign(task, data);
    return this.taskRepository.save(task);
  }

  async updateStatus(id: string, status: TaskStatus, progress?: number): Promise<Task> {
    const task = await this.findOne(id);
    task.status = status;
    if (progress !== undefined) {
      task.progress = progress;
    }
    if (status === TaskStatus.COMPLETED) {
      task.completedAt = new Date();
    }
    return this.taskRepository.save(task);
  }

  async delete(id: string): Promise<void> {
    const task = await this.findOne(id);
    await this.taskRepository.remove(task);
  }

  async getProgress(id: string): Promise<{ progress: number; status: string }> {
    const task = await this.findOne(id);
    return {
      progress: task.progress,
      status: task.status,
    };
  }

}
