/**
 * ヨット（ヤッツィー系）ゲームロジック（D3-2b）
 *
 * Secvier ダイス絵文字（sv_dice_{COLOR}_d6_{FACE}）を使った役判定・表示を行う。
 * - キープしたダイス: suigyoku（翠玉・緑）
 * - 新たに振ったダイス: hakuji（白磁・白）
 */

/** ゲームセッション保持用の状態 */
export interface YachtState {
  /** 現在の 5 個のダイス目（1〜6） */
  dice: number[];
  /** 振り直し済み回数（0: 初期ロール、1: 1回振り直し済み、2: 2回振り直し済み） */
  rerollCount: number;
  /** 前回のロールでキープしたインデックス（0-indexed）。初回は空。 */
  keptIndices: number[];
}

export type YachtHand =
  | 'yahtzee'
  | 'four-of-a-kind'
  | 'full-house'
  | 'large-straight'
  | 'small-straight'
  | 'three-of-a-kind'
  | 'chance';

export const YACHT_HAND_LABELS: Record<YachtHand, string> = {
  yahtzee:         'ヤッツィー！！',
  'four-of-a-kind':'フォーカインド！',
  'full-house':    'フルハウス！',
  'large-straight':'ラージストレート！',
  'small-straight':'スモールストレート！',
  'three-of-a-kind':'スリーカード',
  chance:          'チャンス',
};

// キープ済みダイス（前ターンから保持）= suigyoku（緑）、新たに振ったダイス = hakuji（白）
const COLOR_FRESH = 'hakuji';
const COLOR_KEPT  = 'suigyoku';

/** ダイス 1 個を絵文字名に変換する */
export function diceEmoji(value: number, kept: boolean): string {
  const color = kept ? COLOR_KEPT : COLOR_FRESH;
  return `sv_dice_${color}_d6_${value}`;
}

/** 5 個のダイスを絵文字 1 行で表示する */
export function diceEmojiLine(dice: number[], keptIndices: number[]): string {
  return dice.map((d, i) => `:${diceEmoji(d, keptIndices.includes(i))}:`).join(' ');
}

/** 5d6 をロールする */
export function rollDice(): number[] {
  return Array.from({ length: 5 }, () => Math.floor(Math.random() * 6) + 1);
}

/** 指定したインデックス位置のダイスだけ振り直す（他はそのまま保持） */
export function rerollDice(current: number[], rerollIndices: number[]): number[] {
  const next = [...current];
  for (const i of rerollIndices) {
    if (i >= 0 && i < 5) {
      next[i] = Math.floor(Math.random() * 6) + 1;
    }
  }
  return next;
}

/** ヨットの役を判定する */
export function evaluateYacht(dice: number[]): YachtHand {
  const sorted = [...dice].sort((a, b) => a - b);
  const counts: Record<number, number> = {};
  for (const d of sorted) counts[d] = (counts[d] ?? 0) + 1;
  const freq = Object.values(counts).sort((a, b) => b - a);

  if (freq[0] === 5) return 'yahtzee';
  if (freq[0] === 4) return 'four-of-a-kind';
  if (freq[0] === 3 && freq[1] === 2) return 'full-house';

  // ラージストレート: [1,2,3,4,5] または [2,3,4,5,6]
  if (
    JSON.stringify(sorted) === JSON.stringify([1, 2, 3, 4, 5]) ||
    JSON.stringify(sorted) === JSON.stringify([2, 3, 4, 5, 6])
  ) {
    return 'large-straight';
  }

  // スモールストレート: 4連続が含まれる
  const unique = [...new Set(sorted)].sort((a, b) => a - b);
  const smallSeqs = [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]] as const;
  if (smallSeqs.some((seq) => seq.every((n) => unique.includes(n)))) {
    return 'small-straight';
  }

  if (freq[0] === 3) return 'three-of-a-kind';
  return 'chance';
}

/**
 * 振り直しコマンドを解析する。
 * - 'keep': ゲームをそのまま確定する
 * - number[]: 振り直すダイスの 0-indexed インデックスリスト
 * - null: 振り直しコマンドとして認識できなかった
 */
export function parseRerollCommand(text: string): number[] | 'keep' | null {
  const normalized = text.trim();

  // キープ / 確定 コマンド
  if (/このまま|キープ|確定|keep/i.test(normalized)) return 'keep';

  // 全振り直し
  if (/全部|全て|すべて|全部振り直し|全振り直し|all/i.test(normalized)) {
    return [0, 1, 2, 3, 4];
  }

  // 「振り直し 1 3 5」「1 3 を振り直し」など 1-indexed で指定
  const prefixMatch =
    /(?:振り直し|ふりなおし|reroll)[\s　]*([1-5](?:[\s　,、]+[1-5])*)/i.exec(normalized);
  if (prefixMatch?.[1]) {
    const indices = [...prefixMatch[1].matchAll(/[1-5]/g)].map((m) => parseInt(m[0], 10) - 1);
    return [...new Set(indices)];
  }

  const suffixMatch =
    /([1-5](?:[\s　,、]+[1-5])*)[\s　]を?(?:振り直し|ふりなおし|reroll)/i.exec(normalized);
  if (suffixMatch?.[1]) {
    const indices = [...suffixMatch[1].matchAll(/[1-5]/g)].map((m) => parseInt(m[0], 10) - 1);
    return [...new Set(indices)];
  }

  // 数字のみ（1〜5）のテキストも振り直し指定として許容する
  const numbersOnly = /^[\s　]*([1-5](?:[\s　,、]+[1-5])*)[\s　]*$/.exec(normalized);
  if (numbersOnly?.[1]) {
    const indices = [...numbersOnly[1].matchAll(/[1-5]/g)].map((m) => parseInt(m[0], 10) - 1);
    return [...new Set(indices)];
  }

  return null;
}

/** 役のラベルを取得する（chance の場合は合計点を付加） */
export function yachtHandLabel(hand: YachtHand, dice: number[]): string {
  if (hand === 'chance') {
    const sum = dice.reduce((a, b) => a + b, 0);
    return `${YACHT_HAND_LABELS[hand]}（合計: ${sum}点）`;
  }
  return YACHT_HAND_LABELS[hand];
}

/** ゲーム開始時（初回ロール）の表示テキスト */
export function yachtInitialMessage(state: YachtState): string {
  const { dice, keptIndices } = state;
  const emojiLine = diceEmojiLine(dice, keptIndices);
  const hand = evaluateYacht(dice);
  const label = yachtHandLabel(hand, dice);
  return (
    `${emojiLine}\n現在: ${label}\n` +
    `振り直し可能: あと${2 - state.rerollCount}回\n` +
    `「振り直し 1 3」で 1・3 番を振り直せる（1始まり）\n` +
    `「このまま」で確定`
  );
}

/** 振り直し後（ゲーム中）の表示テキスト */
export function yachtMidMessage(state: YachtState): string {
  const { dice, keptIndices, rerollCount } = state;
  const emojiLine = diceEmojiLine(dice, keptIndices);
  const hand = evaluateYacht(dice);
  const label = yachtHandLabel(hand, dice);
  const remaining = 2 - rerollCount;
  if (remaining <= 0) {
    return `${emojiLine}\n現在: ${label}\n振り直し上限です。「このまま」で確定してください`;
  }
  return (
    `${emojiLine}\n現在: ${label}\n` +
    `あと${remaining}回振り直せる。「振り直し X X」または「このまま」で確定`
  );
}

/** ゲーム終了時の最終結果テキスト */
export function yachtFinalMessage(dice: number[]): string {
  const hand = evaluateYacht(dice);
  const label = yachtHandLabel(hand, dice);
  const emojiLine = diceEmojiLine(dice, []);
  return `${emojiLine}\n【${label}】`;
}
