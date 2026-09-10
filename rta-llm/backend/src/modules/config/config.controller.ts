import { Controller, Get, Post, Body } from '@nestjs/common';
import { ConfigService } from './config.service';
import { LlmConfig } from '../../entities/llm-config.entity';

@Controller('api/llm')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get('config')
  async getConfig(): Promise<LlmConfig> {
    return this.configService.find();
  }

  @Post('config')
  async saveConfig(@Body() data: Partial<LlmConfig>): Promise<LlmConfig> {
    return this.configService.save(data);
  }
}
