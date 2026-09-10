import { Injectable, BadRequestException } from '@nestjs/common';
import { TaskService } from '../task/task.service';
import { LlmService } from '../llm/llm.service';
import { RTAPhase, TaskStatus } from '../../entities/task.entity';

interface AnalysisRequest {
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

export interface AnalysisResult {
  phase: RTAPhase;
  content: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AnalysisService {
  constructor(
    private readonly taskService: TaskService,
    private readonly llmService: LlmService,
  ) {}

  async executeFullFlow(request: AnalysisRequest): Promise<AnalysisResult> {
    const { taskId, data, config } = request;
    const phases: RTAPhase[] = [
      RTAPhase.FAMILIARIZE,
      RTAPhase.CODE,
      RTAPhase.THEMES,
      RTAPhase.REVIEW,
      RTAPhase.DEFINE,
      RTAPhase.REPORT,
    ];

    await this.taskService.updateStatus(taskId, TaskStatus.PROCESSING, 0).catch(err => console.error('[FullFlow] init status', err));

    const allResults: string[] = [];
    const totalPhases = phases.length;

    for (let i = 0; i < totalPhases; i++) {
      const phase = phases[i];
      const phaseName = this.getPhaseName(phase);

      await this.taskService.updateStatus(taskId, TaskStatus.PROCESSING, Math.round((i / totalPhases) * 100)).catch(err => console.error('[FullFlow] progress', err));
      await this.taskService.update(taskId, {
        description: `正在执行第 ${i + 1}/${totalPhases} 阶段：${phaseName}`,
      }).catch(err => console.error('[FullFlow] desc', err));

      try {
        const phaseResult = await this.executePhase(phase, {
          taskId,
          data: i === 0 ? data : allResults[i - 1],
          config,
        });

        allResults.push(phaseResult.content);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        await this.taskService.updateStatus(taskId, TaskStatus.FAILED, Math.round((i / totalPhases) * 100)).catch(err => console.error('[FullFlow] fail status', err));
        await this.taskService.update(taskId, {
          error: `全流程分析在第 ${i + 1} 阶段 "${phaseName}" 失败: ${errMsg}`,
        }).catch(err => console.error('[FullFlow] fail error', err));
        throw new BadRequestException(`Full flow failed at phase "${phaseName}": ${errMsg}`);
      }
    }

    const report = allResults.join('\n\n---\n\n');

    const result: AnalysisResult = {
      phase: RTAPhase.FULL,
      content: report,
      summary: '全流程 RTA 分析完成',
      metadata: {
        taskId,
        executedAt: new Date().toISOString(),
        model: config.model,
        phasesCompleted: totalPhases,
      },
    };

    await this.taskService.update(taskId, {
      result,
      status: TaskStatus.COMPLETED,
      progress: 100,
      completedAt: new Date(),
      description: '全流程 RTA 分析已完成',
    }).catch(err => console.error('[FullFlow] final save', err));

    console.log(`[FullFlow] ${taskId} all phases completed`);
    return result;
  }

  async executePhase(phase: RTAPhase, request: AnalysisRequest): Promise<AnalysisResult> {
    const { taskId, data, config } = request;

    try {
      const task = await this.taskService.findOne(taskId);
      await this.taskService.updateStatus(taskId, TaskStatus.PROCESSING, 10);
      await this.taskService.update(taskId, {
        description: `正在执行"${this.getPhaseName(phase)}"阶段分析...`,
      });
    } catch (preError) {
      throw new BadRequestException(`任务状态更新失败: ${preError instanceof Error ? preError.message : 'Unknown error'}`);
    }

    const systemPrompt = this.getPhaseSystemPrompt(phase);
    const userPrompt = this.getPhaseUserPrompt(phase, data);

    await this.taskService.updateStatus(taskId, TaskStatus.PROCESSING, 30).catch(err => console.error('[TaskStatus30]', err));

    try {
      const chatResult = await this.llmService.chat({
        provider: config.provider,
        model: config.model,
        apiKey: config.apiKey,
        apiEndpoint: config.apiEndpoint,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        topP: config.topP,
        skipGenerationParams: config.skipGenerationParams,
        messages: [
          { role: 'system', content: systemPrompt + '\n\n' + (config.systemPrompt || '') },
          { role: 'user', content: userPrompt },
        ],
      });

      console.log(`[LLM] ${phase} completed, ${chatResult.usage?.completion_tokens || 0} tokens`);

      await this.taskService.updateStatus(taskId, TaskStatus.PROCESSING, 70).catch(err => console.error('[TaskStatus70]', err));

      const sanitizedUsage = chatResult.usage ? {
        prompt_tokens: chatResult.usage.prompt_tokens || 0,
        completion_tokens: chatResult.usage.completion_tokens || 0,
        total_tokens: (chatResult.usage as Record<string, unknown>).total_tokens || 0,
      } : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      const result: AnalysisResult = {
        phase,
        content: chatResult.content,
        summary: this.extractSummary(chatResult.content, phase),
        metadata: {
          taskId,
          executedAt: new Date().toISOString(),
          model: config.model,
          usage: sanitizedUsage,
        },
      };

      await this.taskService.update(taskId, {
        result,
        status: TaskStatus.COMPLETED,
        progress: 100,
        completedAt: new Date(),
      }).catch(err => console.error('[SaveResult]', err));

      console.log(`[TaskSave] ${taskId} updated to COMPLETED for ${phase}`);
      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[AnalysisError] ${phase} failed:`, errMsg);
      await this.taskService.updateStatus(taskId, TaskStatus.FAILED, 0).catch(err => console.error('[StatusFailed]', err));
      await this.taskService.update(taskId, {
        error: errMsg,
      }).catch(err => console.error('[SaveError]', err));
      throw new BadRequestException(`Analysis failed: ${errMsg}`);
    }
  }

  async getResults(taskId: string): Promise<AnalysisResult | null> {
    const task = await this.taskService.findOne(taskId);
    if (!task.result) return null;
    return {
      phase: task.result.phase as RTAPhase,
      content: task.result.content,
      summary: task.result.summary,
      metadata: task.result.metadata,
    };
  }

  private getPhaseName(phase: RTAPhase): string {
    const names: Record<RTAPhase, string> = {
      [RTAPhase.FAMILIARIZE]: '数据熟悉',
      [RTAPhase.CODE]: '初始编码',
      [RTAPhase.THEMES]: '主题构建',
      [RTAPhase.REVIEW]: '主题审视',
      [RTAPhase.DEFINE]: '主题定义',
      [RTAPhase.REPORT]: '报告撰写',
      [RTAPhase.FULL]: '全流程分析',
    };
    return names[phase] || '未知阶段';
  }

  private getPhaseSystemPrompt(phase: RTAPhase): string {
    const prompts: Record<RTAPhase, string> = {
      [RTAPhase.FAMILIARIZE]: `你是一位质性研究专家，擅长数据分析。请帮助用户熟悉研究数据。
      
分析要求：
1. 识别数据的主要主题和模式
2. 总结数据的核心内容和情感倾向
3. 识别潜在的研究问题和发现

输出格式：使用Markdown格式，包含结构化的摘要和分析洞察`,

      [RTAPhase.CODE]: `你是一位质性研究编码专家。请根据RTA规范对文本进行系统编码。

编码原则：
- 使用描述性编码，捕捉文本的核心意义
- 保持编码的一致性和客观性
- 每个编码应简洁明了

输出格式：Markdown格式的编码列表，包含编码名称、描述和对应的文本片段`,

      [RTAPhase.THEMES]: `你是一位主题分析专家。请将编码聚类为潜在主题。

聚类原则：
- 基于语义相似性进行聚类
- 考虑编码间的关联和层次
- 识别核心主题和次级主题

输出格式：Markdown格式的主题层级结构`,

      [RTAPhase.REVIEW]: `你是一位批判性分析专家。请审视和优化已构建的主题。

审视要点：
- 主题内部一致性检验
- 主题间边界清晰度
- 主题的独特性和完整性
- 删除冗余或重叠的主题

输出格式：优化后的主题结构及修改说明`,

      [RTAPhase.DEFINE]: `你是一位学术写作专家。请为主题定义清晰的边界和核心陈述。

定义要求：
- 简洁有力的主题名称
- 清晰的主题边界描述
- 核心陈述（1-2句话概括主题本质）

输出格式：每个主题的详细定义文档`,

      [RTAPhase.REPORT]: `你是一位学术报告撰写专家。请基于分析结果撰写完整的研究报告。

报告结构：
1. 引言和研究背景
2. 数据熟悉与方法
3. 编码分析结果
4. 主题呈现与讨论
5. 结论与局限性

格式要求：完整的Markdown格式学术报告，包含适当的小标题和论述`,

      [RTAPhase.FULL]: '',
    };

    return prompts[phase] || prompts[RTAPhase.FAMILIARIZE];
  }

  private getPhaseUserPrompt(phase: RTAPhase, inputData: string): string {
    const phaseName = this.getPhaseName(phase);

    return `请对以下研究数据进行分析，执行"${phaseName}"阶段的工作：

${'='.repeat(50)}

${inputData}

${'='.repeat(50)}

请基于以上数据，输出你的分析结果。`;
  }

  private extractSummary(content: string, phase: RTAPhase): string {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length <= 5) {
      return content.slice(0, 200) + (content.length > 200 ? '...' : '');
    }
    
    const keyLines = lines.slice(0, 3);
    return keyLines.join(' ').slice(0, 200) + '...';
  }
}
