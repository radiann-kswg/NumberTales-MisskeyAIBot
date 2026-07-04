/**
 * ヒット＆ブロウゲームロジック（D3-3、桁数/重複可変対応 D3-6追加提案分）
 *
 * Bot が可変桁数（デフォルト4桁）の数字（またはアルファベット）を設定し、ユーザーが予想する数当てゲーム。
 * - Hit: 桁・位置ともに一致
 * - Blow: 数字は一致するが位置が異なる
 * - デフォルトは重複なしだが、「重複あり」指定で重複を許容するモードにも対応する。
 * - モードは数字10種（デフォルト）とアルファベット26種から選べる。
 * - 「結果発表のみ色ヒント」指定時は、ゲーム進行中はヒント表示の文字色を白固定にし、
 *   ゲーム終了時にのみ回答推移の色ヒントを表示する。
 */
import { randomInt } from 'node:crypto';
import { toHalfWidthDigits } from '../../utils/text.js';
import { wordsOfLength } from './hitblow-words.js';

/** 対応する桁数の範囲（数字モード） */
export const HITBLOW_MIN_DIGITS = 2;
export const HITBLOW_MAX_DIGITS = 8;
/** 対応する文字数の範囲（アルファベットモード／ワードウルフ風。英単語バンクの最長に合わせる） */
export const HITBLOW_ALPHABET_MAX_DIGITS = 15;

/** 開始・条件変更コマンドから桁数指定を検出するパターン（アルファベットモードは「文字」表記も使うため両対応） */
export const HITBLOW_DIGITS_PATTERN = /(\d+)\s*(?:桁|ケタ|けた|文字)/;
/** 開始・条件変更コマンドから「重複あり」指定を検出するパターン */
export const HITBLOW_DUPLICATE_PATTERN = /重複(?:あり|OK|可|して|して?いい)/i;
/**
 * 開始・条件変更コマンドから「アルファベットモード」指定を検出するパターン。
 * 「ワードウルフ」は本機能（ヒット＆ブロウのアルファベットモード）の別名として扱う。
 */
export const HITBLOW_ALPHABET_PATTERN = /アルファベット|エービーシー|A\s*[〜~-]\s*Z|ワードウルフ/i;
/** 開始・条件変更コマンドから「結果発表のみ色ヒント」指定を検出するパターン（確信度が高い言い回し） */
export const HITBLOW_REVEAL_ON_END_PATTERN =
  /結果発表(?:の?時)?(?:のみ|だけ)(?:色|色ヒント)?|(?:文字)?色ヒント(?:な[しく]|無し|オフ|OFF|要らない|いらない|抜き)|白(?:固定|ヒント)|ヒントを?隠/i;
/**
 * 色ヒント関連の話題には触れているが、上記の確信度の高いパターンには一致しない曖昧な言及。
 * 「文字色ヒント無しで」のような表記ゆれを取りこぼした場合の保険として、
 * この場合は判定を確定させず、事前確認を挟む（HITBLOW_REVEAL_ON_END_PATTERN と併用する）。
 */
export const HITBLOW_REVEAL_AMBIGUOUS_PATTERN =
  /色.*ヒント|ヒント.*色|ネタバレ|色.*(?:わか|ばれ|バレ)|(?:わか|ばれ|バレ).*色/i;

/** ヒット＆ブロウのシンボル種別（数字10種 / アルファベット26種） */
export type HitBlowMode = 'digit' | 'alphabet';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** モードごとのシンボル総数 */
function poolSize(mode: HitBlowMode): number {
  return mode === 'alphabet' ? ALPHABET.length : 10;
}

/** シンボル値（0始まりのインデックス）を表示用の1文字に変換する */
export function symbolLabel(mode: HitBlowMode, value: number): string {
  return mode === 'alphabet' ? ALPHABET[value]! : String(value);
}

/** 表示用の1文字をシンボル値（インデックス）に変換する。無効な文字は null */
function labelToSymbol(mode: HitBlowMode, ch: string): number | null {
  if (mode === 'alphabet') {
    const idx = ALPHABET.indexOf(ch.toUpperCase());
    return idx === -1 ? null : idx;
  }
  return /^\d$/.test(ch) ? Number(ch) : null;
}

/** ゲームセッション保持用の状態 */
export interface HitBlowState {
  /** 正解のシンボル列（インデックス表現） */
  secret: number[];
  /** 予想回数 */
  guessCount: number;
  /** 最大予想回数 */
  maxGuesses: number;
  /** 桁数 */
  digits: number;
  /** 重複を許容するモードかどうか */
  allowDuplicates: boolean;
  /** シンボル種別（数字10種 / アルファベット26種） */
  mode: HitBlowMode;
  /** 結果発表のみ色ヒントを表示するモードかどうか（true の間はゲーム進行中、色を白固定にする） */
  revealOnEnd: boolean;
  /** ターンごとの予想ログ（CW 表示用） */
  guessHistory: { guess: string; hits: number; blows: number }[];
}

/**
 * digits 桁のシンボル列を生成する。
 * アルファベットモードでは、桁数に対応する実在の英単語（`hitblow-words.ts` の安全性確認済みリスト）が
 * あればそれを正解にする（ワードウルフ風）。該当する単語が無い場合のみランダムな文字列にフォールバックする。
 * 数字モードは先頭が 0 にならないよう 1〜9 から先頭を選ぶ（アルファベットモードは制約なし）。
 * allowDuplicates が false の場合は残り桁も重複なしで選出する（digits はプールサイズ以下であること）。
 */
export function generateSecret(digits: number, allowDuplicates: boolean, mode: HitBlowMode = 'digit'): number[] {
  if (mode === 'alphabet') {
    const candidates = wordsOfLength(digits);
    if (candidates.length > 0) {
      const word = candidates[randomInt(candidates.length)]!;
      return word.split('').map((ch) => ALPHABET.indexOf(ch));
    }
  }

  const size = poolSize(mode);
  const firstDigit = mode === 'digit' ? randomInt(1, 10) : randomInt(0, size); // 数字は[1,10)=1〜9、それ以外は[0,size)
  const result = [firstDigit];

  if (allowDuplicates) {
    for (let i = 1; i < digits; i++) {
      result.push(randomInt(0, size));
    }
    return result;
  }

  const pool = Array.from({ length: size }, (_, i) => i).filter((n) => n !== firstDigit);
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
 * テキストから digits 桁のシンボル予想を解析する（数字モード / アルファベットモード共通）。
 * allowDuplicates が false の場合、重複ありの入力は null を返す。
 */
export function parseGuess(
  text: string,
  digits: number,
  allowDuplicates: boolean,
  mode: HitBlowMode = 'digit',
): number[] | null {
  if (mode === 'alphabet') {
    const normalized = text.toUpperCase();
    const allLetters = normalized.replace(/[^A-Z]/g, '');
    if (allLetters.length === 0) return null;

    const match = new RegExp(`(?:^|[^A-Z])([A-Z]{${digits}})(?:[^A-Z]|$)`).exec(normalized);
    const letterStr = match?.[1] ?? (allLetters.length === digits ? allLetters : null);
    if (!letterStr) return null;

    const guessSymbols = letterStr.split('').map((ch) => labelToSymbol(mode, ch)!);
    if (!allowDuplicates && new Set(guessSymbols).size !== digits) return null;
    return guessSymbols;
  }

  const normalized = toHalfWidthDigits(text);
  // テキストから連続した数字の塊を抽出（最初の一致を使用）
  const allNums = normalized.replace(/\D/g, '');
  if (allNums.length === 0) return null;

  // digits 桁にぴったり一致する数字列を探す
  const match = new RegExp(`(?:^|\\D)(\\d{${digits}})(?:\\D|$)`).exec(normalized);
  const numStr = match?.[1] ?? (allNums.length === digits ? allNums : null);
  if (!numStr) return null;

  const guessDigits = numStr.split('').map(Number);
  if (!allowDuplicates && new Set(guessDigits).size !== digits) return null; // 重複あり
  return guessDigits;
}

// ----------------------------------------------------------------
// 回答ログの絵文字化（D3-6、色分け表示への改訂）
// ----------------------------------------------------------------

export type DigitMark = 'hit' | 'blow' | 'miss' | 'hit-dup' | 'blow-dup';

/**
 * 状態ごとの数字タイル色。
 * ヒット=赤／ブロウ=青／非該当=白。
 * 重複ありモードで同一シンボルにヒットとブロウが同時に発生している場合は、
 * 赤・青と紛らわしいため hit-dup=黄／blow-dup=緑の別色で識別する。
 *
 * ワードウルフ（アルファベットモード）は本機能のサブモードという位置づけのため、
 * 色分けはこのマップと `coloredDigitEmoji`/`markGuessDigits` をそのまま共用する。
 * モード固有の色分けを新設しないこと（数字モードとの見た目の一貫性を保つため）。
 */
const DIGIT_MARK_COLOR: Record<DigitMark, string> = {
  hit: 'kougyoku',
  blow: 'seiyuu',
  miss: 'hakuji',
  'hit-dup': 'sakin',
  'blow-dup': 'suigyoku',
};

/** 状態に応じた色付きシンボルタイル絵文字名を返す（`:` なし） */
export function coloredDigitEmoji(value: number, mark: DigitMark, mode: HitBlowMode = 'digit'): string {
  return `sv_${DIGIT_MARK_COLOR[mark]}_${symbolLabel(mode, value)}`;
}

/**
 * 予想の各桁がヒット/ブロウ/非該当のどれかを位置ごとに判定する。
 * `calculateHitBlow` と同じ多重集合方式で、重複ありモードでも正しく判定する。
 * さらに、同一シンボル値でヒットとブロウが同時に発生している場合は、
 * 赤・青と別色で識別できるよう hit-dup/blow-dup に振り替える。
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

  // 同一シンボル値でヒットとブロウが両方発生している場合、赤・青とは別色に振り替える
  const marksBySymbol = new Map<number, Set<DigitMark>>();
  for (let i = 0; i < guess.length; i++) {
    const mark = marks[i]!;
    if (mark === 'miss') continue;
    const set = marksBySymbol.get(guess[i]!) ?? new Set<DigitMark>();
    set.add(mark);
    marksBySymbol.set(guess[i]!, set);
  }
  for (let i = 0; i < guess.length; i++) {
    const set = marksBySymbol.get(guess[i]!);
    if (!set || !(set.has('hit') && set.has('blow'))) continue;
    if (marks[i] === 'hit') marks[i] = 'hit-dup';
    else if (marks[i] === 'blow') marks[i] = 'blow-dup';
  }

  return marks;
}

/** 位置ごとの実際のマークを白（非該当）で覆い隠した表示用マーク列を返す（結果発表待ちの間の表示に使う） */
function concealMarks(marks: DigitMark[]): DigitMark[] {
  return marks.map(() => 'miss' as DigitMark);
}

/** 1ターン分のログ行（色分けシンボルタイル＋ヒット/ブロウ要約）を生成する */
export function hitBlowLogLine(
  secret: number[],
  guess: number[],
  hits: number,
  blows: number,
  mode: HitBlowMode = 'digit',
  revealColors = true,
): string {
  const marks = revealColors ? markGuessDigits(secret, guess) : concealMarks(markGuessDigits(secret, guess));
  const tiles = guess.map((g, i) => `:${coloredDigitEmoji(g, marks[i]!, mode)}:`).join(' ');

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

/**
 * ここまでの全予想ログを CW 本文用にまとめる。
 * revealColors が false の間はシンボルタイルの色を白固定にし、
 * ヒット/ブロウの個数のみをヒントとして表示する（「結果発表のみ色ヒント」オプション用）。
 */
export function hitBlowCwBody(
  secret: number[],
  guessHistory: { guess: string; hits: number; blows: number }[],
  mode: HitBlowMode = 'digit',
  revealColors = true,
): string {
  return guessHistory
    .map(({ guess, hits, blows }) => {
      const guessSymbols = guess.split('').map((ch) => labelToSymbol(mode, ch) ?? 0);
      return hitBlowLogLine(secret, guessSymbols, hits, blows, mode, revealColors);
    })
    .join('\n');
}
