/**
 * 担当キャラクターの番号からダイス絵文字の色（D3-6）を決定する。
 *
 * キャラクター番号の桁根（digital root）を計算し、`SLOT_DIGIT_EMOJIS`
 * （`responder.ts`）のコメントに明記された数字→色則をそのまま流用する:
 *   緑(suigyoku)=0,5 / 黄(sakin)=1,8 / 白(hakuji)=2,6 / 赤(kougyoku)=3,7 / 青(seiyuu)=4,9
 */

export type DiceColor = 'kougyoku' | 'sakin' | 'suigyoku' | 'seiyuu' | 'hakuji';

const DIGIT_ROOT_COLOR: Record<number, DiceColor> = {
  0: 'suigyoku',
  5: 'suigyoku',
  1: 'sakin',
  8: 'sakin',
  2: 'hakuji',
  6: 'hakuji',
  3: 'kougyoku',
  7: 'kougyoku',
  4: 'seiyuu',
  9: 'seiyuu',
};

/** 数値を1桁になるまで各桁の和を繰り返す（桁根） */
function digitalRoot(n: number): number {
  let value = Math.abs(n);
  while (value > 9) {
    value = String(value)
      .split('')
      .reduce((acc, d) => acc + Number(d), 0);
  }
  return value;
}

/** キャラクター番号（"000" 等の文字列も可）からダイス色を決定する */
export function characterDiceColor(characterNum: string | number): DiceColor {
  const numericValue = Number(String(characterNum).replace(/\D/g, '')) || 0;
  return DIGIT_ROOT_COLOR[digitalRoot(numericValue)]!;
}
