import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { TaskService } from './task.service';
import { Task, TaskStatus, RTAPhase } from '../../entities/task.entity';

@Controller('api/tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  async create(@Body() data: {
    name: string;
    phase: RTAPhase;
    config: Task['config'];
    dataFileId?: string;
    description?: string;
  }): Promise<Task> {
    return this.taskService.create(data);
  }

  @Get()
  async findAll(): Promise<Task[]> {
    return this.taskService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Task> {
    return this.taskService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() data: Partial<Task>,
  ): Promise<Task> {
    return this.taskService.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<void> {
    await this.taskService.delete(id);
  }

  @Get(':id/progress')
  async getProgress(@Param('id') id: string): Promise<{ progress: number; status: string }> {
    return this.taskService.getProgress(id);
  }
}
