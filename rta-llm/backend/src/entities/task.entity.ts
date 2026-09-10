import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum TaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum RTAPhase {
  FAMILIARIZE = 'familiarize',
  CODE = 'code',
  THEMES = 'themes',
  REVIEW = 'review',
  DEFINE = 'define',
  REPORT = 'report',
  FULL = 'full',
}

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({
    type: 'varchar',
    default: TaskStatus.PENDING,
  })
  status: TaskStatus;

  @Column({
    type: 'varchar',
    default: RTAPhase.FAMILIARIZE,
  })
  phase: RTAPhase;

  @Column({ type: 'float', default: 0 })
  progress: number;

  @Column({ type: 'simple-json', nullable: true })
  config: {
    provider: string;
    model: string;
    apiKey: string;
    apiEndpoint?: string;
    temperature: number;
    maxTokens: number;
    topP?: number;
    systemPrompt?: string;
    skipGenerationParams?: boolean;
  };

  @Column({ nullable: true })
  dataFileId: string;

  @Column({ type: 'simple-json', nullable: true })
  result: {
    phase: string;
    content: string;
    summary?: string;
    metadata?: Record<string, unknown>;
  };

  @Column({ nullable: true })
  error: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;
}
