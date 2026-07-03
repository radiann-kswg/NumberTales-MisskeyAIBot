/**
 * ヒット＆ブロウゲームロジック（D3-3）
 *
 * Bot が重複なし 3〜4 桁の数字を設定し、ユーザーが予想する数当てゲーム。
 * - Hit: 桁・位置ともに一致
 * - Blow: 数字は一致するが位置が異なる
 */
import { randomInt } from 'node:crypto';

/** ゲームセッション保持用の状態 */
export interface HitBlowState {
  /** 正解の数列（重複なし） */
  secret: number[];
  /** 予想回数 */
  guessCount: number;
  /** 最大予想回数 */
  maxGuesses: number;
  /** 桁数（3 or 4） */
  digits: number;
  /** ターンごとの予想ログ（CW 表示用） */
  guessHistory: { guess: string; hits: number; blows: number }[];
}

/**
 * 重複なし digits 桁の数列を生成する。
 * 先頭が 0 にならないよう 1〜9 から先頭を選ぶ。
 */
export function generateSecret(digits: 3 | 4): number[] {
  // 先頭は 1〜9
  const firstDigit = randomInt(1, 10); // [1, 10) = 1〜9
  const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => n !== firstDigit);
  const result = [firstDigit];
  for (let i = 1; i < digits; i++) {
    const idx = randomInt(pool.length);
    result.push(pool[idx]!);
    pool.splice(idx, 1);
  }
  return result;
}

/** ヒット数とブロウ数を計算する */
export function calculateHitBlow(
  secret: number[],
  guess: number[],
): { hits: number; blows: number } {
  let hits = 0;
  let blows = 0;
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) {
      hits++;
    } else if (secret.includes(guess[i]!)) {
      blows++;
    }
  }
  return { hits, blows };
}

/**
 * テキストから digits 桁の数字予想を解析する。
 * - 数字が digits 桁で重複なし: 解析成功
 * - 重複あり・桁数不一致・数字なし: null を返す
 */
export function parseGuess(text: string, digits: number): number[] | null {
  // テキストから連続した数字の塊を抽出（最初の一致を使用）
  const allNums = text.replace(/\D/g, '');
  if (allNums.length === 0) return null;

  // digits 桁にぴったり一致する数字列を探す
  const match = new RegExp(`(?:^|\\D)(\\d{${digits}})(?:\\D|$)`).exec(text);
  const numStr = match?.[1] ?? (allNums.length === digits ? allNums : null);
  if (!numStr) return null;

  const guessDigits = numStr.split('').map(Number);
  if (new Set(guessDigits).size !== digits) return null; // 重複あり
  return guessDigits;
}

// ----------------------------------------------------------------
// 回答ログの絵文字化（D3-6）
// ----------------------------------------------------------------

/**
 * 数字タイル絵文字（白磁・中立色で統一）。
 * `SLOT_DIGIT_EMOJIS`（数字ごと固定色）とは別セットとして完全に切り離す。
 */
export const HITBLOW_DIGIT_EMOJIS: Record<number, string> = {
  0: 'sv_hakuji_0',
  1: 'sv_hakuji_1',
  2: 'sv_hakuji_2',
  3: 'sv_hakuji_3',
  4: 'sv_hakuji_4',
  5: 'sv_hakuji_5',
  6: 'sv_hakuji_6',
  7: 'sv_hakuji_7',
  8: 'sv_hakuji_8',
  9: 'sv_hakuji_9',
};

export type DigitMark = 'hit' | 'blow' | 'miss';

/** 状態マーカー絵文字（ヒット=赤／ブロウ=青／非該当=白） */
export const HITBLOW_MARKER_EMOJIS: Record<DigitMark, string> = {
  hit: 'sv_suit_heart_red',
  blow: 'sv_suit_spade_blue',
  miss: 'sv_suit_heart_white',
};

/** 予想の各桁がヒット/ブロウ/非該当のどれかを位置ごとに判定する */
export function markGuessDigits(secret: number[], guess: number[]): DigitMark[] {
  return guess.map((g, i) => {
    if (secret[i] === g) return 'hit';
    if (secret.includes(g)) return 'blow';
    return 'miss';
  });
}

/** 1ターン分のログ行（マーカー付き数字タイル＋ヒット/ブロウ要約）を生成する */
export function hitBlowLogLine(
  secret: number[],
  guess: number[],
  hits: number,
  blows: number,
): string {
  const marks = markGuessDigits(secret, guess);
  const tiles = guess
    .map((g, i) => `:${HITBLOW_MARKER_EMOJIS[marks[i]!]}::${HITBLOW_DIGIT_EMOJIS[g]!}:`)
    .join(' ');

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
