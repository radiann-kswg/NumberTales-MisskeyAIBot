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
