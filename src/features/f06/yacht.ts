/**
 * ヨット（ヤッツィー系）ゲームロジック（D3-2b）
 *
 * Secvier ダイス絵文字（sv_dice_{COLOR}_d6_{FACE}）を使った役判定・表示を行う。
 * - キープしたダイス: suigyoku（翠玉・緑）
 * - 新たに振ったダイス: hakuji（白磁・白）
 */
import { CIRCLED_DIGIT_TO_INDEX, toHalfWidthDigits } from '../../utils/text.js';

/** ゲームセッション保持用の状態 */
export interface YachtState {
  /** 現在の 5 個のダイス目（1〜6） */
  dice: number[];
  /** 振り直し済み回数（0: 初期ロール、1: 1回振り直し済み、2: 2回振り直し済み） */
  rerollCount: number;
  /** 前回のロールでキープしたインデックス（0-indexed）。初回は空。 */
  keptIndices: number[];
  /** 確認待ちの振り直し対象インデックス（確認不要な指定のときは null） */
  pendingReroll: number[] | null;
}

/** ダイス位置ラベル（1〜5番目、丸数字） */
export const CIRCLE_NUMS = ['①', '②', '③', '④', '⑤'] as const;

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

/** 5 個のダイスを絵文字 1 行で表示する（位置を示す丸数字付き） */
export function diceEmojiLine(dice: number[], keptIndices: number[]): string {
  return dice
    .map((d, i) => `${CIRCLE_NUMS[i]}:${diceEmoji(d, keptIndices.includes(i))}:`)
    .join(' ');
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

/** 振り直し解析結果。`requiresConfirm` が true の場合は即実行せず確認を挟む */
export interface RerollParseResult {
  indices: number[];
  requiresConfirm: boolean;
}

/**
 * ダイス位置を表す丸数字（①②③④⑤）を、対応する半角数字を前後スペースで囲んだ形に展開し、
 * 全角数字も半角に変換する。丸数字は区切り文字なしで並ぶことが多い（「①③」等）ため、
 * 単純に数字へ変換するだけだと隣接して桁が繋がってしまう（例:「13」）ので、
 * 各数字をスペースで区切って複数指定の正規表現がそのまま機能するようにする。
 */
function expandDicePositionDigits(text: string): string {
  const withExpandedCircles = text.replace(
    /[①②③④⑤]/g,
    (c) => ` ${CIRCLED_DIGIT_TO_INDEX[c]!} `,
  );
  return toHalfWidthDigits(withExpandedCircles);
}

/**
 * 出目ベースの振り直し指定を解析する。
 * - 「Nの目を振り直し」: 出目Nのダイスを対象にする
 * - 「Nの目以外を振り直し」: 出目Nをキープし、残りを対象にする
 * 該当なしなら null。
 */
export function parseRerollByFaceValue(text: string, dice: number[]): number[] | null {
  const normalized = toHalfWidthDigits(text.trim());

  const exceptMatch = /([1-6])の目以外を?(?:振り直し|ふりなおし|reroll)/i.exec(normalized);
  if (exceptMatch?.[1]) {
    const value = parseInt(exceptMatch[1], 10);
    return dice.reduce<number[]>((acc, d, i) => (d !== value ? [...acc, i] : acc), []);
  }

  const valueMatches = [...normalized.matchAll(/([1-6])の目を?(?:振り直し|ふりなおし|reroll)/gi)];
  if (valueMatches.length > 0) {
    const values = new Set(valueMatches.map((m) => parseInt(m[1]!, 10)));
    return dice.reduce<number[]>((acc, d, i) => (values.has(d) ? [...acc, i] : acc), []);
  }

  return null;
}

/**
 * 振り直しコマンドを解析する。
 * - 'keep': ゲームをそのまま確定する
 * - RerollParseResult: 振り直すダイスの 0-indexed インデックスと確認要否
 * - null: 振り直しコマンドとして認識できなかった
 *
 * 確認要否ルール（D3-6 仕様）:
 * - 位置指定の明示コマンド（「振り直し 1 3」等）のみ: 即実行
 * - 「全部/全て」一括指定、出目ベース指定、キーワードなしの数字のみ入力: 確認必須
 * - 位置指定と出目指定が同一文に混在した場合は和集合（OR）にした上で確認必須
 */
export function parseRerollCommand(text: string, dice: number[]): RerollParseResult | 'keep' | null {
  // ①②③のような丸数字表示（Bot自身がダイス位置ラベルとして使う）や全角数字での
  // 返信もそのまま解析できるよう、位置指定部分は事前に半角数字へ正規化する。
  const normalized = expandDicePositionDigits(text.trim());

  // キープ / 確定 コマンド
  if (/このまま|キープ|確定|keep/i.test(normalized)) return 'keep';

  // 全振り直し（一括指定 → 確認必須）
  if (/全部|全て|すべて|all/i.test(normalized)) {
    return { indices: [0, 1, 2, 3, 4], requiresConfirm: true };
  }

  // 「振り直し 1 3 5」「1 3 を振り直し」など 1-indexed の位置指定（明示 → 即実行）
  const prefixMatch =
    /(?:振り直し|ふりなおし|reroll)[\s　]*([1-5](?:[\s　,、]+[1-5])*)/i.exec(normalized);
  const suffixMatch =
    /([1-5](?:[\s　,、]+[1-5])*)[\s　]を?(?:振り直し|ふりなおし|reroll)/i.exec(normalized);
  const positionMatch = prefixMatch?.[1] ?? suffixMatch?.[1];
  const positionIndices = positionMatch
    ? [...new Set([...positionMatch.matchAll(/[1-5]/g)].map((m) => parseInt(m[0], 10) - 1))]
    : [];

  // 出目ベース指定（新規 → 確認必須）
  const faceIndices = parseRerollByFaceValue(normalized, dice) ?? [];

  if (positionIndices.length > 0 && faceIndices.length > 0) {
    // 位置指定・出目指定が混在 → 和集合（OR）にした上で確認必須
    return { indices: [...new Set([...positionIndices, ...faceIndices])], requiresConfirm: true };
  }

  if (positionIndices.length > 0) {
    return { indices: positionIndices, requiresConfirm: false };
  }

  if (faceIndices.length > 0) {
    return { indices: faceIndices, requiresConfirm: true };
  }

  // 数字のみ（1〜5）のテキストも振り直し指定として許容する（キーワードなし → 曖昧指定・確認必須）
  const numbersOnly = /^[\s　]*([1-5](?:[\s　,、]+[1-5])*)[\s　]*$/.exec(normalized);
  if (numbersOnly?.[1]) {
    const indices = [
      ...new Set([...numbersOnly[1].matchAll(/[1-5]/g)].map((m) => parseInt(m[0], 10) - 1)),
    ];
    return { indices, requiresConfirm: true };
  }

  return null;
}

/** 振り直し確認メッセージ（位置指定の明示以外の解釈を伴う振り直し前に挟む） */
export function yachtConfirmPrompt(indices: number[]): string {
  const labels = [...indices]
    .sort((a, b) => a - b)
    .map((i) => CIRCLE_NUMS[i])
    .join('');
  return `${labels}のダイスを振り直すね。いい？`;
}

/** 振り直し確認への返答（肯定/否定）を解析する */
export function parseConfirmResponse(text: string): 'yes' | 'no' | null {
  const normalized = text.trim();
  if (/いいよ|はい|OK|おっけ|うん|お願い|それで|^する$|する[!！。.]?$/i.test(normalized)) return 'yes';
  if (/やめとく|待って|やめて|いや|ちがう|違う|^しない$|しない[!！。.]?$/i.test(normalized)) return 'no';
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
    `:sv_dice_hakuji_type_d6: 5d6のヨットだよ\n` +
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
