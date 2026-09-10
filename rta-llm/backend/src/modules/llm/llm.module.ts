import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { LlmConfig } from '../../entities/llm-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LlmConfig])],
  controllers: [LlmController],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
