/**
 * 意図分類エンジン（Phase 2 拡張版）
 *
 * カテゴリ:
 *   - greeting:               挨拶キーワードにマッチした場合
 *   - form-switch:            コアフォルダ/ヒューマノイド形態トリガー
 *   - creative-consultation:  創作相談・壁打ち・お題要求
 *   - chat:                   上記以外（LLM に委ねる）
 */

export type Intent = 'greeting' | 'form-switch' | 'creative-consultation' | 'chat';
export type FormTarget = 'core-folder' | 'humanoid';

export interface ClassificationResult {
  intent: Intent;
  /** form-switch のときのみ設定される */
  formTarget?: FormTarget;
}

// ----------------------------------------------------------------
// パターン定義
// ----------------------------------------------------------------

const GREETING_PATTERNS: RegExp[] = [
  /^おはよ/,
  /^こんにちは?/,
  /^こんばんは?/,
  /^おやすみ/,
  /^(やあ|やほ|ヤッホー)/,
  /^(hello|hi|hey)\b/i,
];

const CORE_FOLDER_PATTERNS: RegExp[] = [
  /もふもふ/,
  /コアフォルダ/,
  /球体型/,
  /ぷに/,
  /ぽてぽて/,
];

const HUMANOID_PATTERNS: RegExp[] = [
  /人型モード/,
  /ヒューマノイド/,
];

const CREATIVE_PATTERNS: RegExp[] = [
  /お題/,
  /創作テーマ/,
  /キャラ(クター)?.*(設定|考え|作り|補助)/,
  /設定.*(穴埋め|補助|手伝い)/,
  /世界観/,
  /壁打ち/,
  /お絵描き.*お題/,
  /創作.*(相談|話)/,
];

// ----------------------------------------------------------------
// 分類関数
// ----------------------------------------------------------------

/**
 * テキストから意図を分類する
 * @param text @mention を除去済みの本文テキスト
 */
export function classifyIntent(text: string): ClassificationResult {
  const normalized = text.trim();

  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'greeting' };
  }

  for (const pattern of CORE_FOLDER_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'form-switch', formTarget: 'core-folder' };
  }

  for (const pattern of HUMANOID_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'form-switch', formTarget: 'humanoid' };
  }

  for (const pattern of CREATIVE_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'creative-consultation' };
  }

  return { intent: 'chat' };
}
