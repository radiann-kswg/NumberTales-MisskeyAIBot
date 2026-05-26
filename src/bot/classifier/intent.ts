/**
 * 意図分類エンジン（Phase 2 拡張版）
 *
 * カテゴリ:
 *   - greeting:               挨拶キーワードにマッチした場合
 *   - form-switch:            コアフォルダ/ヒューマノイド形態トリガー
 *   - creative-consultation:  創作相談・壁打ち・お題要求
 *   - chat:                   上記以外（LLM に委ねる）
 */

export type Intent = 'greeting' | 'form-switch' | 'creative-consultation' | 'chat' | 'calculate' | 'numerology' | 'dice' | 'trivia';
export type FormTarget = 'core-folder' | 'humanoid';
export type NumerologyType = 'life-path' | 'kyusei';

export interface ClassificationResult {
  intent: Intent;
  /** form-switch のときのみ設定される */
  formTarget?: FormTarget;
  /** numerology のときのみ設定される */
  numerologyType?: NumerologyType;
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

const DICE_PATTERNS: RegExp[] = [
  /\d*[dD]\d+/,
  /ダイス(?:ロール)?を?振|サイコロを?振/,
  /\d+\s*(?:から|〜|~)\s*\d+.*(?:乱数|ランダム)/,
  /(?:乱数|ランダム).*\d+\s*(?:から|〜|~)\s*\d+/,
];

const TRIVIA_PATTERNS: RegExp[] = [
  /\d+\s*(?:という数字|について(?:教えて|の話|話して)|のうんちく|の豆知識)/,
  /今日の数字/,
  /数字(?:うんちく|の豆知識)/,
];

const CALCULATE_PATTERNS: RegExp[] = [
  /計算して|計算お願い|を計算|を求めて/i,
  /\/calc\s/i,
  /sqrt|sin|cos|tan|log|factorial|√|∑/i,
];

const LIFE_PATH_PATTERNS: RegExp[] = [
  /ライフパス|lifepath|life\s*path|誕生数|運命数/i,
  /\/numerology|\/lp\s/i,
];

const KYUSEI_PATTERNS: RegExp[] = [
  /九星|本命星|気学|きゅうせい/i,
  /\/kyusei\s/i,
];

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function detectFormTarget(text: string): FormTarget | null {
  const normalized = text.trim();

  if (matchesAny(normalized, CORE_FOLDER_PATTERNS)) {
    return 'core-folder';
  }

  if (matchesAny(normalized, HUMANOID_PATTERNS)) {
    return 'humanoid';
  }

  return null;
}

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

  const formTarget = detectFormTarget(normalized);
  if (formTarget) {
    return { intent: 'form-switch', formTarget };
  }

  for (const pattern of CREATIVE_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'creative-consultation' };
  }

  for (const pattern of LIFE_PATH_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'numerology', numerologyType: 'life-path' };
  }

  for (const pattern of KYUSEI_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'numerology', numerologyType: 'kyusei' };
  }

  for (const pattern of DICE_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'dice' };
  }

  for (const pattern of TRIVIA_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'trivia' };
  }

  for (const pattern of CALCULATE_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'calculate' };
  }

  return { intent: 'chat' };
}
