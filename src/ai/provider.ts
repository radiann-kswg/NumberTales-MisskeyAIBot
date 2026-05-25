export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  /** 最大トークン数（デフォルト: 300） */
  maxTokens?: number;
  /** 温度パラメータ（0.0〜1.0、デフォルト: 0.7） */
  temperature?: number;
}

export interface AIResponse {
  /** 生成されたテキスト */
  text: string;
  /** 使用したプロバイダー名 */
  provider: string;
}

/**
 * AIプロバイダー共通インターフェース
 * OpenAI / Gemini を差し替え可能にするための抽象レイヤー
 */
export interface AIProvider {
  readonly name: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<AIResponse>;
}
