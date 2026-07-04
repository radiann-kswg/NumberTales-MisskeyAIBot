/**
 * ヒット＆ブロウゲームロジック（D3-3、桁数/重複可変対応 D3-6追加提案分）
 *
 * Bot が可変桁数（デフォルト4桁）の数字を設定し、ユーザーが予想する数当てゲーム。
 * - Hit: 桁・位置ともに一致
 * - Blow: 数字は一致するが位置が異なる
 * - デフォルトは重複なしだが、「重複あり」指定で重複を許容するモードにも対応する。
 */
import { randomInt } from 'node:crypto';

/** 対応する桁数の範囲 */
export const HITBLOW_MIN_DIGITS = 2;
export const HITBLOW_MAX_DIGITS = 8;

/** 開始・条件変更コマンドから桁数指定を検出するパターン */
export const HITBLOW_DIGITS_PATTERN = /(\d+)\s*(?:桁|ケタ|けた)/;
/** 開始・条件変更コマンドから「重複あり」指定を検出するパターン */
export const HITBLOW_DUPLICATE_PATTERN = /重複(?:あり|OK|可|して|して?いい)/i;

/** ゲームセッション保持用の状態 */
export interface HitBlowState {
  /** 正解の数列 */
  secret: number[];
  /** 予想回数 */
  guessCount: number;
  /** 最大予想回数 */
  maxGuesses: number;
  /** 桁数 */
  digits: number;
  /** 重複を許容するモードかどうか */
  allowDuplicates: boolean;
  /** ターンごとの予想ログ（CW 表示用） */
  guessHistory: { guess: string; hits: number; blows: number }[];
}

/**
 * digits 桁の数列を生成する。先頭が 0 にならないよう 1〜9 から先頭を選ぶ。
 * allowDuplicates が false の場合は残り桁も重複なしで選出する（digits は 10 以下であること）。
 */
export function generateSecret(digits: number, allowDuplicates: boolean): number[] {
  const firstDigit = randomInt(1, 10); // [1, 10) = 1〜9
  const result = [firstDigit];

  if (allowDuplicates) {
    for (let i = 1; i < digits; i++) {
      result.push(randomInt(0, 10)); // 0〜9、重複可
    }
    return result;
  }

  const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => n !== firstDigit);
  for (let i = 1; i < digits; i++) {
    const idx = randomInt(pool.length);
    result.push(pool[idx]!);
    pool.splice(idx, 1);
  }
  return result;
}

/**
 * ヒット数とブロウ数を計算する。
 * 重複ありモードでも正しく数えられるよう、ヒット確定後に残った桁だけを
 * 多重集合（出現数カウント）として突き合わせる標準的な Mastermind 方式で判定する。
 */
export function calculateHitBlow(
  secret: number[],
  guess: number[],
): { hits: number; blows: number } {
  let hits = 0;
  const secretRemaining: number[] = [];
  const guessRemaining: number[] = [];

  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) {
      hits++;
    } else {
      secretRemaining.push(secret[i]!);
      guessRemaining.push(guess[i]!);
    }
  }

  const secretCounts = new Map<number, number>();
  for (const d of secretRemaining) secretCounts.set(d, (secretCounts.get(d) ?? 0) + 1);

  let blows = 0;
  for (const d of guessRemaining) {
    const remaining = secretCounts.get(d) ?? 0;
    if (remaining > 0) {
      blows++;
      secretCounts.set(d, remaining - 1);
    }
  }

  return { hits, blows };
}

/**
 * テキストから digits 桁の数字予想を解析する。
 * allowDuplicates が false の場合、重複ありの入力は null を返す。
 */
export function parseGuess(text: string, digits: number, allowDuplicates: boolean): number[] | null {
  // テキストから連続した数字の塊を抽出（最初の一致を使用）
  const allNums = text.replace(/\D/g, '');
  if (allNums.length === 0) return null;

  // digits 桁にぴったり一致する数字列を探す
  const match = new RegExp(`(?:^|\\D)(\\d{${digits}})(?:\\D|$)`).exec(text);
  const numStr = match?.[1] ?? (allNums.length === digits ? allNums : null);
  if (!numStr) return null;

  const guessDigits = numStr.split('').map(Number);
  if (!allowDuplicates && new Set(guessDigits).size !== digits) return null; // 重複あり
  return guessDigits;
}

// ----------------------------------------------------------------
// 回答ログの絵文字化（D3-6、色分け表示への改訂）
// ----------------------------------------------------------------

export type DigitMark = 'hit' | 'blow' | 'miss';

/** 状態ごとの数字タイル色（ヒット=赤／ブロウ=青／非該当=白） */
const DIGIT_MARK_COLOR: Record<DigitMark, string> = {
  hit: 'kougyoku',
  blow: 'seiyuu',
  miss: 'hakuji',
};

/** 状態に応じた色付き数字タイル絵文字名を返す（`:` なし） */
export function coloredDigitEmoji(digit: number, mark: DigitMark): string {
  return `sv_${DIGIT_MARK_COLOR[mark]}_${digit}`;
}

/**
 * 予想の各桁がヒット/ブロウ/非該当のどれかを位置ごとに判定する。
 * `calculateHitBlow` と同じ多重集合方式で、重複ありモードでも正しく判定する。
 */
export function markGuessDigits(secret: number[], guess: number[]): DigitMark[] {
  const marks: DigitMark[] = new Array(guess.length).fill('miss') as DigitMark[];
  const secretCounts = new Map<number, number>();

  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) {
      marks[i] = 'hit';
    } else {
      secretCounts.set(secret[i]!, (secretCounts.get(secret[i]!) ?? 0) + 1);
    }
  }

  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === 'hit') continue;
    const remaining = secretCounts.get(guess[i]!) ?? 0;
    if (remaining > 0) {
      marks[i] = 'blow';
      secretCounts.set(guess[i]!, remaining - 1);
    }
  }

  return marks;
}

/** 1ターン分のログ行（色分け数字タイル＋ヒット/ブロウ要約）を生成する */
export function hitBlowLogLine(
  secret: number[],
  guess: number[],
  hits: number,
  blows: number,
): string {
  const marks = markGuessDigits(secret, guess);
  const tiles = guess.map((g, i) => `:${coloredDigitEmoji(g, marks[i]!)}:`).join(' ');

  let summary: string;
  if (hits === secret.length) {
    summary = `${hits}ヒット！正解！`;
  } else if (hits > 0 && blows > 0) {
    summary = `${hits}ヒット${blows}ブロウ`;
  } else if (hits > 0) {
    summary = `${hits}ヒット`;
  } else if (blows > 0) {
    summary = `${blows}ブロウ`;
  } else {
    summary = '0ヒット0ブロウ';
  }

  return `${tiles} ： ${summary}`;
}

/** ここまでの全予想ログを CW 本文用にまとめる */
export function hitBlowCwBody(
  secret: number[],
  guessHistory: { guess: string; hits: number; blows: number }[],
): string {
  return guessHistory
    .map(({ guess, hits, blows }) => hitBlowLogLine(secret, guess.split('').map(Number), hits, blows))
    .join('\n');
}
