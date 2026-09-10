import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('llm_configs')
export class LlmConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: 'openai' })
  provider: string;

  @Column()
  model: string;

  @Column()
  apiKey: string;

  @Column({ nullable: true })
  apiEndpoint: string;

  @Column({ type: 'float', default: 0.7 })
  temperature: number;

  @Column({ default: 4000 })
  maxTokens: number;

  @Column({ type: 'float', nullable: true })
  topP: number;

  @Column({ type: 'text', nullable: true })
  systemPrompt: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
