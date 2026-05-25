import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIProvider, ChatMessage, AIResponse, ChatOptions } from './provider.js';

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private readonly genAI: GoogleGenerativeAI;
  private readonly modelName: string;

  constructor(apiKey: string, modelName = 'gemini-2.5-flash') {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<AIResponse> {
    const systemInstruction = messages.find((m) => m.role === 'system')?.content;
    const nonSystem = messages.filter((m) => m.role !== 'system');
    const lastMessage = nonSystem.at(-1);
    const history = nonSystem.slice(0, -1).map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      ...(systemInstruction ? { systemInstruction } : {}),
      generationConfig: {
        maxOutputTokens: options.maxTokens ?? 300,
        temperature: options.temperature ?? 0.7,
      },
    });

    const chatSession = model.startChat({ history });
    const result = await chatSession.sendMessage(lastMessage?.content ?? '');
    return { text: result.response.text(), provider: this.name };
  }
}
