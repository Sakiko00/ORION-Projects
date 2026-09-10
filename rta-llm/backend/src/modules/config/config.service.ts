import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmConfig } from '../../entities/llm-config.entity';

@Injectable()
export class ConfigService {
  constructor(
    @InjectRepository(LlmConfig)
    private readonly llmConfigRepository: Repository<LlmConfig>,
  ) {}

  async find(): Promise<LlmConfig> {
    let config = await this.llmConfigRepository.findOne({
      where: {},
      order: { updatedAt: 'DESC' },
    });

    if (!config) {
      config = this.llmConfigRepository.create({
        provider: 'openai',
        model: 'gpt-4',
        apiKey: '',
        temperature: 0.7,
        maxTokens: 4000,
        systemPrompt: '你是一位专业的质性研究分析师，擅长反思性主题分析法(RTA)。',
      });
      config = await this.llmConfigRepository.save(config);
    }

    return config;
  }

  async save(data: Partial<LlmConfig>): Promise<LlmConfig> {
    let config = await this.llmConfigRepository.findOne({
      where: {},
      order: { updatedAt: 'DESC' },
    });

    if (config) {
      Object.assign(config, data);
      return this.llmConfigRepository.save(config);
    } else {
      config = this.llmConfigRepository.create(data);
      return this.llmConfigRepository.save(config);
    }
  }
}
