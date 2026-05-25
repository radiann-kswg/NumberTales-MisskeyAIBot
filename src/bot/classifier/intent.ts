/**
 * 意図分類エンジン（Phase 1: ルールベース）
 *
 * Phase 1 では 2 カテゴリに絞る:
 *   - greeting: 挨拶キーワードにマッチした場合
 *   - chat: それ以外（LLM に委ねる）
 *
 * Phase 2 以降でカテゴリを拡張予定（創作相談 / コマンド等）
 */

export type Intent = 'greeting' | 'chat';

const GREETING_PATTERNS: RegExp[] = [
  /^おはよ/,
  /^こんにちは?/,
  /^こんばんは?/,
  /^おやすみ/,
  /^(やあ|やほ|ヤッホー)/,
  /^(hello|hi|hey)\b/i,
];

/**
 * テキストから意図を分類する
 * @param text @mention を除去済みの本文テキスト
 */
export function classifyIntent(text: string): Intent {
  const normalized = text.trim();

  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(normalized)) return 'greeting';
  }

  return 'chat';
}
