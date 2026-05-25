import OpenAI from 'openai';
import type { AIProvider, ChatMessage, AIResponse, ChatOptions } from './provider.js';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model = 'gpt-4o-mini') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<AIResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: options.maxTokens ?? 300,
      temperature: options.temperature ?? 0.7,
    });

    const text = response.choices[0]?.message?.content ?? '';
    return { text, provider: this.name };
  }
}
