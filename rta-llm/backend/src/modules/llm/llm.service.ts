import { Injectable, BadRequestException } from '@nestjs/common';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  provider: string;
  model: string;
  apiKey: string;
  apiEndpoint?: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  messages: ChatMessage[];
  skipGenerationParams?: boolean;
}

interface ChatResult {
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number };
}

@Injectable()
export class LlmService {
  async chat(options: ChatOptions): Promise<ChatResult> {
    const { provider, model, apiKey, apiEndpoint, temperature, maxTokens, topP, skipGenerationParams, messages } = options;

    if (provider === 'mock') {
      return this.mockChat(messages);
    }

    try {
      if (provider === 'openai' || provider === 'custom' || provider === 'kimi' || provider === 'doubao') {
        return this.callOpenAICompatible(provider, apiKey, model, apiEndpoint, messages, temperature, maxTokens, topP, skipGenerationParams);
      } else if (provider === 'deepseek') {
        return this.callDeepSeek(apiKey, model, messages, temperature, maxTokens, topP, skipGenerationParams);
      } else if (provider === 'claude') {
        return this.callClaude(apiKey, model, messages, temperature, maxTokens);
      } else if (provider === 'gemini') {
        return this.callGemini(apiKey, model, messages, temperature, maxTokens);
      } else if (provider === 'minimax') {
        return this.callMiniMax(apiKey, model, messages, temperature, maxTokens, topP, skipGenerationParams);
      } else {
        throw new BadRequestException(`Unsupported provider: ${provider}`);
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`LLM call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getDefaultEndpoint(provider: string): string {
    const endpoints: Record<string, string> = {
      openai: 'https://api.openai.com/v1/chat/completions',
      kimi: 'https://api.moonshot.cn/v1/chat/completions',
      doubao: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
      custom: 'https://api.openai.com/v1/chat/completions',
    };
    return endpoints[provider] || endpoints.openai;
  }

  private async callOpenAICompatible(
    provider: string,
    apiKey: string,
    model: string,
    apiEndpoint: string | undefined,
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number,
    topP?: number,
    skipGenerationParams?: boolean,
  ): Promise<ChatResult> {
    const endpoint = apiEndpoint || this.getDefaultEndpoint(provider);

    const requestBody: Record<string, unknown> = { model, messages };

    if (!skipGenerationParams) {
      requestBody.temperature = temperature;
      requestBody.max_tokens = maxTokens;
      if (topP !== undefined) requestBody.top_p = topP;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(180000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: data.usage || { prompt_tokens: 0, completion_tokens: 0 },
    };
  }

  private async callDeepSeek(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number,
    topP?: number,
    skipGenerationParams?: boolean,
  ): Promise<ChatResult> {
    const endpoint = 'https://api.deepseek.com/chat/completions';

    const requestBody: Record<string, unknown> = { model, messages };

    if (!skipGenerationParams) {
      requestBody.temperature = temperature;
      requestBody.max_tokens = maxTokens;
      if (topP !== undefined) requestBody.top_p = topP;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(180000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`DeepSeek API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: data.usage || { prompt_tokens: 0, completion_tokens: 0 },
    };
  }

  private async callClaude(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number,
  ): Promise<ChatResult> {
    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const systemPrompt = messages.find(m => m.role === 'system')?.content || '';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: anthropicMessages,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        temperature,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json() as {
      content?: { text?: string }[];
      usage?: { input_tokens: number; output_tokens: number };
    };
    return {
      content: data.content?.[0]?.text || '',
      usage: data.usage
        ? { prompt_tokens: data.usage.input_tokens, completion_tokens: data.usage.output_tokens }
        : { prompt_tokens: 0, completion_tokens: 0 },
    };
  }

  private async callGemini(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number,
  ): Promise<ChatResult> {
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find(m => m.role === 'system')?.content || '';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
    };
    const usage = data.usageMetadata;
    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      usage: usage
        ? { prompt_tokens: usage.promptTokenCount, completion_tokens: usage.candidatesTokenCount }
        : { prompt_tokens: 0, completion_tokens: 0 },
    };
  }

  private async callMiniMax(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number,
    topP?: number,
    skipGenerationParams?: boolean,
  ): Promise<ChatResult> {
    const requestBody: Record<string, unknown> = { model, messages };

    if (!skipGenerationParams) {
      requestBody.temperature = temperature;
      requestBody.max_tokens = maxTokens;
      if (topP !== undefined) requestBody.top_p = topP;
    }

    const response = await fetch('https://api.minimaxi.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`MiniMax API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: data.usage || { prompt_tokens: 0, completion_tokens: 0 },
    };
  }

  private mockChat(messages: ChatMessage[]): Promise<ChatResult> {
    const userContent = messages.find(m => m.role === 'user')?.content || '';
    const isTest = userContent.includes('Connection successful');

    if (isTest) {
      return this.delay(200).then(() => ({
        content: 'Connection successful',
        usage: { prompt_tokens: 15, completion_tokens: 5 },
      }));
    }

    return this.delay(600 + Math.random() * 400).then(() => {
      const phasePrompt = messages.find(m => m.role === 'system')?.content || '';
      let content: string;

      if (phasePrompt.includes('数据熟悉') || phasePrompt.includes('FAMILIARIZE')) {
        content = `## 数据熟悉阶段分析结果\n\n### 一、数据概览\n本次分析的研究数据包含${Math.floor(userContent.length / 100)}段有效文本，涉及${3 + Math.floor(Math.random() * 4)}个核心话题领域。\n\n### 二、主要发现\n\n1. **情感倾向分析**：整体文本呈现中性偏积极的情感基调\n2. **高频词汇**：研究数据中"${this.pickRandom(['体验', '理解', '过程', '变化', '关系', '意义'])}"一词出现频率最高\n3. **叙事结构**：数据呈现出清晰的"情境-行动-结果"叙事模式\n\n### 三、初步主题识别\n\n| 序号 | 潜在主题 | 出现频次 | 情感倾向 |\n|------|---------|---------|--------|\n| 1 | 身份认同与自我认知 | 高频 | 中性偏积极 |\n| 2 | 社会关系与互动模式 | 中频 | 混合 |\n| 3 | 挑战应对与成长经历 | 高频 | 积极 |\n| 4 | 环境适应与变迁 | 中频 | 中性 |\n\n---\n*本分析由 Mock 模式生成，用于离线测试*`;
      } else if (phasePrompt.includes('初始编码') || phasePrompt.includes('CODE')) {
        content = `## 初始编码结果\n\n基于 RTA 编码规范，对研究数据进行了系统编码。以下是主要编码列表：\n\n### 编码清单\n\n| 编码ID | 编码名称 | 描述 | 参考片段数 |\n|--------|---------|------|-----------|\n| C-01 | 自我反思 | 参与者对自身行为、想法的回顾与审视 | ${2 + Math.floor(Math.random() * 5)} |\n| C-02 | 关系建构 | 描述与他人建立、维持或改变关系的经历 | ${2 + Math.floor(Math.random() * 5)} |\n| C-03 | 转折时刻 | 叙事中的关键转折点或重要事件 | ${2 + Math.floor(Math.random() * 5)} |\n| C-04 | 情绪表达 | 明确表达情感状态或情绪变化 | ${2 + Math.floor(Math.random() * 5)} |\n| C-05 | 应对策略 | 描述面对困难时的应对方式和策略 | ${2 + Math.floor(Math.random() * 5)} |\n| C-06 | 意义赋予 | 对经历的意义进行解读和诠释 | ${2 + Math.floor(Math.random() * 5)} |\n| C-07 | 成长叙事 | 强调个人成长、学习或变化的叙事 | ${2 + Math.floor(Math.random() * 5)} |\n| C-08 | 文化认同 | 与文化背景、价值观相关的表述 | ${2 + Math.floor(Math.random() * 5)} |\n\n> 注：以上编码基于对输入数据的语义分析生成，可在主题构建阶段进一步聚类和优化。`;
      } else if (phasePrompt.includes('主题构建') || phasePrompt.includes('THEMES')) {
        content = `## 主题构建结果\n\n基于初始编码的聚类分析，构建了以下主题层级结构：\n\n### 核心主题一：自我认同的建构与演变\n**包含编码：** C-01（自我反思）、C-06（意义赋予）、C-08（文化认同）\n\n### 核心主题二：关系网络中的动态平衡\n**包含编码：** C-02（关系建构）、C-04（情绪表达）\n\n### 核心主题三：逆境中的成长与蜕变\n**包含编码：** C-03（转折时刻）、C-05（应对策略）、C-07（成长叙事）`;
      } else if (phasePrompt.includes('主题审视') || phasePrompt.includes('REVIEW')) {
        content = `## 主题审视报告\n\n### 审视标准\n\n| 标准 | 权重 | 说明 |\n|------|-----|------|\n| 内部一致性 | ★★★★★ | 同一主题内部各编码是否逻辑一致 |\n| 外部差异性 | ★★★★★ | 不同主题之间是否边界清晰 |\n| 数据支撑度 | ★★★★☆ | 主题是否有足够的数据支撑 |\n| 理论贡献度 | ★★★☆☆ | 主题对理解研究问题的贡献 |\n\n### 各主题评审\n\n#### 主题一：自我认同的建构与演变 ✅ 通过\n#### 主题二：关系网络中的动态平衡 ✅ 通过\n#### 主题三：逆境中的成长与蜕变 ⚠️ 需调整\n\n### 修改摘要\n- 移除冗余编码：0 个\n- 合并相似编码：2 组\n- 新增次级主题：1 个`;
      } else if (phasePrompt.includes('主题定义') || phasePrompt.includes('DEFINE')) {
        content = `## 主题定义文档\n\n---\n\n### 主题一：自我认同的建构与演变\n\n**核心陈述：** 个体通过持续的反思和意义赋予，在不同生活阶段动态建构和重新定义自我身份。\n\n---\n\n### 主题二：关系网络中的动态平衡\n\n**核心陈述：** 人际关系作为社会存在的基石，呈现出持续的动态调整特征。\n\n---\n\n### 主题三：逆境中的成长与蜕变\n\n**核心陈述：** 面对生活挑战时，个体经历从初始冲击到主动应对、再到认知转化和意义重建的过程。`;
      } else {
        content = `# RTA 反思性主题分析报告\n\n## 摘要\n本报告基于反思性主题分析法（Reflexive Thematic Analysis, RTA），对研究数据进行了系统性的质性分析。\n\n## 研究背景与方法\n本研究采用 Braun & Clarke (2006, 2019) 提出的反思性主题分析法，将研究者视为分析的积极建构者。\n\n## 主要发现\n\n### 发现一：身份的叙事建构\n自我认同并非固定不变的本质，而是在叙事中不断被建构和重构的动态过程。\n\n### 发现二：关系的动态性与意义\n人际关系不仅是社会支持的来源，更是意义建构的核心场域。\n\n### 发现三：成长的转化力量\n从逆境到成长的转化需要三个条件：认知重构、社会认可和行动实施。\n\n## 结论\n本研究通过 RTA 方法揭示了参与者经验中的三个核心主题。\n\n---\n*本报告由 Mock 模式生成，用于离线测试和功能验证*`;
      }

      const outputTokens = Math.floor(content.length / 2.5);
      const inputTokens = Math.floor(userContent.length / 2.5) + Math.floor(Math.min(phasePrompt.length, 2000) / 2.5);
      return { content, usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens } };
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private pickRandom(arr: string[]): string {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  async testConnection(provider: string, apiKey: string, apiEndpoint?: string, model?: string, skipGenerationParams?: boolean): Promise<{ success: boolean; message: string }> {
    try {
      const testMessages: ChatMessage[] = [
        { role: 'user', content: 'Say "Connection successful" in exactly those words.' },
      ];

      await this.chat({
        provider,
        model: model || 'gpt-4o',
        apiKey,
        apiEndpoint,
        temperature: 0.7,
        maxTokens: 100,
        messages: testMessages,
        skipGenerationParams,
      });

      return { success: true, message: 'Connection test successful!' };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }
}
