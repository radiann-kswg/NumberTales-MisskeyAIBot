// F-06 数秘術・九星気学モジュール

// ----------------------------------------------------------------
// ライフパスナンバー
// ----------------------------------------------------------------

/** マスターナンバー（これ以上は縮約しない） */
const MASTER_NUMBERS = new Set([11, 22, 33]);

/**
 * 数値を 1 桁（またはマスターナンバー）になるまで各桁の和を繰り返す。
 */
export function reduceToSingleDigit(n: number): number {
  while (n > 9 && !MASTER_NUMBERS.has(n)) {
    n = String(n)
      .split('')
      .reduce((acc, d) => acc + Number(d), 0);
  }
  return n;
}

/**
 * 生年月日からライフパスナンバーを計算する。
 *
 * @param year  生年（4桁）
 * @param month 生月（1〜12）
 * @param day   生日（1〜31）
 */
export function lifePathNumber(year: number, month: number, day: number): number {
  const sum = [...String(year), ...String(month), ...String(day)].reduce(
    (acc, d) => acc + Number(d),
    0,
  );
  return reduceToSingleDigit(sum);
}

// ----------------------------------------------------------------
// 九星気学 — 本命星（年命星）
// ----------------------------------------------------------------

const KYUSEI_NAMES = [
  '',           // 0: 未使用
  '一白水星',
  '二黒土星',
  '三碧木星',
  '四緑木星',
  '五黄土星',
  '六白金星',
  '七赤金星',
  '八白土星',
  '九紫火星',
] as const;

/**
 * 生年から本命星（年命星）を返す。
 * 立春基準（1〜2月は前年扱い）の補正は Stage B で追加予定。
 *
 * @param year 生年（4桁）
 */
export function honmeisei(year: number): string {
  const n = ((11 - ((year - 1984) % 9)) % 9) || 9;
  return KYUSEI_NAMES[n]!;
}

// ----------------------------------------------------------------
// タロット対応表
// ----------------------------------------------------------------

export const TAROT_MAP: Record<number, string> = {
  1:  '魔術師',
  2:  '女教皇',
  3:  '女帝',
  4:  '皇帝',
  5:  '教皇',
  6:  '恋人',
  7:  '戦車',
  8:  '力',
  9:  '隠者',
  10: '運命の輪',
  11: '正義',
  12: '吊るされた男',
  13: '死神',
  14: '節制',
  15: '悪魔',
  16: '塔',
  17: '星',
  18: '月',
  19: '太陽',
  20: '審判',
  21: '世界',
  22: '愚者',
  33: '愚者（マスター）',
};
