import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { join } from 'path';
import { TaskModule } from './modules/task/task.module';
import { LlmModule } from './modules/llm/llm.module';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { DataModule } from './modules/data/data.module';
import { ConfigModule } from './modules/config/config.module';
import { Task } from './entities/task.entity';
import { DataFile } from './entities/data-file.entity';
import { LlmConfig } from './entities/llm-config.entity';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'data/rta.db',
      entities: [Task, DataFile, LlmConfig],
      synchronize: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: (() => {
        const fs = require('fs');
        const candidates = [
          join(__dirname, '..', 'frontend-out'),
          join(__dirname, 'frontend-out'),
          join(__dirname, '..', 'frontend', 'out'),
          join(__dirname, '..', '..', 'frontend', 'out'),
        ];
        for (const p of candidates) {
          if (fs.existsSync(p)) {
            console.log('[ServeStatic] Using rootPath:', p);
            return p;
          }
        }
        console.warn('[ServeStatic] No frontend found, tried:', candidates);
        return candidates[0];
      })(),
      exclude: ['/api/(.*)'],
    }),
    TaskModule,
    LlmModule,
    AnalysisModule,
    DataModule,
    ConfigModule,
  ],
})
export class AppModule {}
