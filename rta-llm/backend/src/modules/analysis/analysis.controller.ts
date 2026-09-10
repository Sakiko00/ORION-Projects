import { Controller, Post, Get, Body, Param, BadRequestException, NotFoundException } from '@nestjs/common';
import { AnalysisService } from './analysis.service';
import { RTAPhase } from '../../entities/task.entity';

interface AnalysisBody {
  taskId: string;
  data: string;
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
}

function rethrow(err: unknown): never {
  if (err instanceof BadRequestException || err instanceof NotFoundException) throw err;
  throw new BadRequestException(err instanceof Error ? err.message : String(err));
}

@Controller('api/analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('full')
  async full(@Body() data: AnalysisBody) {
    return this.analysisService.executeFullFlow(data).catch(rethrow);
  }

  @Post('familiarize')
  async familiarize(@Body() data: AnalysisBody) {
    return this.analysisService.executePhase(RTAPhase.FAMILIARIZE, data).catch(rethrow);
  }

  @Post('code')
  async code(@Body() data: AnalysisBody) {
    return this.analysisService.executePhase(RTAPhase.CODE, data).catch(rethrow);
  }

  @Post('themes')
  async themes(@Body() data: AnalysisBody) {
    return this.analysisService.executePhase(RTAPhase.THEMES, data).catch(rethrow);
  }

  @Post('review')
  async review(@Body() data: AnalysisBody) {
    return this.analysisService.executePhase(RTAPhase.REVIEW, data).catch(rethrow);
  }

  @Post('define')
  async define(@Body() data: AnalysisBody) {
    return this.analysisService.executePhase(RTAPhase.DEFINE, data).catch(rethrow);
  }

  @Post('report')
  async report(@Body() data: AnalysisBody) {
    return this.analysisService.executePhase(RTAPhase.REPORT, data).catch(rethrow);
  }

  @Get('results/:taskId')
  async getResults(@Param('taskId') taskId: string) {
    const result = await this.analysisService.getResults(taskId).catch(rethrow);
    if (!result) throw new NotFoundException('Result not found');
    return result;
  }
}
