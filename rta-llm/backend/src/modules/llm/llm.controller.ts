import { Controller, Get, Post, Body } from '@nestjs/common';
import { LlmService } from './llm.service';

@Controller('api/llm')
export class LlmController {
  constructor(private readonly llmService: LlmService) {}

  @Post('test')
  async testConnection(@Body() data: {
    provider: string;
    apiKey: string;
    apiEndpoint?: string;
    model?: string;
    skipGenerationParams?: boolean;
  }): Promise<{ success: boolean; message: string }> {
    return this.llmService.testConnection(data.provider, data.apiKey, data.apiEndpoint, data.model, data.skipGenerationParams);
  }
}
