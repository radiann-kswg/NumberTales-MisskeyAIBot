/**
 * ポーカー（5枚ドロー）ゲームロジック（D3-2a）
 *
 * Secvier トランプ絵文字（sv_card_{SUIT}_{RANK}）を使った役判定・表示を行う。
 * 標準 52 枚デッキ（A〜K × S/H/D/C）を使用。カヴァリエは除外。
 * 本来の5枚ドローポーカーに倣い、初回配札後に1回だけ交換（ドロー）できる。
 */
import { toHalfWidthDigits } from '../../utils/text.js';

/** ゲームセッション保持用の状態（交換は1回のみ、セッションが存在する間はまだ交換前） */
export interface PokerState {
  /** 現在の5枚の手札 */
  hand: Card[];
  /** 交換用に残っている山札 */
  deck: Card[];
}

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank =
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7'
  | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type PokerHand =
  | 'royal-flush'
  | 'straight-flush'
  | 'four-of-a-kind'
  | 'full-house'
  | 'flush'
  | 'straight'
  | 'three-of-a-kind'
  | 'two-pair'
  | 'one-pair'
  | 'high-card';

const RANK_VALUES: Record<Rank, number> = {
  A: 14, K: 13, Q: 12, J: 11,
  '10': 10, '9': 9, '8': 8, '7': 7,
  '6': 6, '5': 5, '4': 4, '3': 3, '2': 2,
};

export const POKER_HAND_LABELS: Record<PokerHand, string> = {
  'royal-flush':    'ロイヤルフラッシュ！！！',
  'straight-flush': 'ストレートフラッシュ！！',
  'four-of-a-kind': 'フォーカインド！',
  'full-house':     'フルハウス！',
  flush:            'フラッシュ！',
  straight:         'ストレート！',
  'three-of-a-kind':'スリーカード',
  'two-pair':       'ツーペア',
  'one-pair':       'ワンペア',
  'high-card':      'ハイカード',
};

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 手札を見やすいよう、ランク昇順（同ランクはスート順）に並べ替える */
export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const rankDiff = RANK_VALUES[a.rank] - RANK_VALUES[b.rank];
    if (rankDiff !== 0) return rankDiff;
    return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
  });
}

/** 標準 52 枚デッキをシャッフルし、5 枚の初期手札と残りの山札を返す */
export function dealPokerGame(): { hand: Card[]; deck: Card[] } {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  const shuffled = shuffle(deck);
  return { hand: shuffled.slice(0, 5), deck: shuffled.slice(5) };
}

/** 5 枚のカードの役を判定する */
export function evaluatePokerHand(cards: Card[]): PokerHand {
  const values = cards.map((c) => RANK_VALUES[c.rank]).sort((a, b) => a - b);
  const suits = cards.map((c) => c.suit);

  const isFlush = suits.every((s) => s === suits[0]);

  // A-2-3-4-5 ローエーストレート
  const isLowAceStraight =
    values[0] === 2 && values[1] === 3 && values[2] === 4 &&
    values[3] === 5 && values[4] === 14;
  const isRegularStraight =
    new Set(values).size === 5 && values[4]! - values[0]! === 4;
  const isStraight = isRegularStraight || isLowAceStraight;

  const counts: Record<number, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  const freq = Object.values(counts).sort((a, b) => b - a);

  if (isFlush && isStraight) {
    // A-K-Q-J-10 同スート = ロイヤルフラッシュ
    if (!isLowAceStraight && values[0] === 10 && values[4] === 14) return 'royal-flush';
    return 'straight-flush';
  }
  if (freq[0] === 4) return 'four-of-a-kind';
  if (freq[0] === 3 && freq[1] === 2) return 'full-house';
  if (isFlush) return 'flush';
  if (isStraight) return 'straight';
  if (freq[0] === 3) return 'three-of-a-kind';
  if (freq[0] === 2 && freq[1] === 2) return 'two-pair';
  if (freq[0] === 2) return 'one-pair';
  return 'high-card';
}

/** カード 1 枚を絵文字名に変換する */
export function cardEmoji(card: Card): string {
  return `sv_card_${card.suit}_${card.rank}`;
}

/** 5 枚の手札を絵文字 1 行で表示する */
export function handEmojiLine(cards: Card[]): string {
  return cards.map((c) => `:${cardEmoji(c)}:`).join(' ');
}

/** 5 枚の手札を位置番号（1始まり）付きで1行表示する */
export function handEmojiLineLabeled(cards: Card[]): string {
  return cards.map((c, i) => `${i + 1}:${cardEmoji(c)}:`).join(' ');
}

/** ポーカーゲーム結果テキストを生成する */
export function pokerResultText(cards: Card[], hand: PokerHand): string {
  return `${handEmojiLine(cards)}\n【${POKER_HAND_LABELS[hand]}】`;
}

/**
 * 交換コマンドを解析する。
 * - 'keep': 交換せず現在の手札で確定する
 * - number[]: 交換する 0-indexed の手札位置
 * - null: 交換コマンドとして認識できなかった
 */
export function parseExchangeCommand(text: string): number[] | 'keep' | null {
  const normalized = toHalfWidthDigits(text.trim());

  if (/このまま|キープ|確定|stand|keep/i.test(normalized)) return 'keep';

  const prefixMatch =
    /(?:交換|こうかん|チェンジ|change)[\s\u3000]*([1-5](?:[\s\u3000,、]+[1-5])*)/i.exec(normalized);
  const suffixMatch =
    /([1-5](?:[\s\u3000,、]+[1-5])*)[\s\u3000]*枚?[\s\u3000]*を?(?:交換|こうかん|チェンジ|change)/i.exec(normalized);
  const positionMatch = prefixMatch?.[1] ?? suffixMatch?.[1];
  if (positionMatch) {
    return [...new Set([...positionMatch.matchAll(/[1-5]/g)].map((m) => parseInt(m[0], 10) - 1))];
  }

  // 数字のみ（1〜5）のテキストも交換指定として許容する
  const numbersOnly = /^[\s\u3000]*([1-5](?:[\s\u3000,、]+[1-5])*)[\s\u3000]*$/.exec(normalized);
  if (numbersOnly?.[1]) {
    return [...new Set([...numbersOnly[1].matchAll(/[1-5]/g)].map((m) => parseInt(m[0], 10) - 1))];
  }

  return null;
}

/** ゲーム開始時（初回配札）の表示テキスト */
export function pokerInitialMessage(state: PokerState): string {
  const hand = evaluatePokerHand(state.hand);
  return (
    `${handEmojiLineLabeled(state.hand)}\n現在: ${POKER_HAND_LABELS[hand]}\n` +
    `「交換 1 3」で交換できるよ（1回のみ・1始まり）\n「このまま」で確定`
  );
}
