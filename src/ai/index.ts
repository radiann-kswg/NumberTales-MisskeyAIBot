import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';
import type { AIProvider } from './provider.js';

export type { AIProvider, ChatMessage, AIResponse, ChatOptions } from './provider.js';

export interface AIProviderConfig {
  provider: 'openai' | 'gemini';
  openaiApiKey?: string;
  geminiApiKey?: string;
}

/**
 * 設定に応じた AIProvider インスタンスを生成するファクトリ関数
 * AI_PROVIDER 環境変数で openai / gemini を切り替える
 */
export function createAIProvider(config: AIProviderConfig): AIProvider {
  switch (config.provider) {
    case 'openai': {
      if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY is required for openai provider');
      return new OpenAIProvider(config.openaiApiKey);
    }
    case 'gemini': {
      if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY is required for gemini provider');
      return new GeminiProvider(config.geminiApiKey);
    }
    default: {
      // 網羅チェック: 追加プロバイダー時にコンパイルエラーで気づける
      const _exhaustive: never = config.provider;
      throw new Error(`Unknown AI provider: ${_exhaustive}`);
    }
  }
}
