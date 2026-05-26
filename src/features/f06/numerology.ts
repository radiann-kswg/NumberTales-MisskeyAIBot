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
  // 1990年 = 二黒土星 を基準として逆算（年が進むにつれて星番号は 1 ずつ減少）
  const n = ((11 - ((year - 1990) % 9)) % 9) || 9;
  return KYUSEI_NAMES[n]!;
}

// ----------------------------------------------------------------
// 九星気学 — 立春補正・月命星
// ----------------------------------------------------------------

/** 節入り日の近似値（インデックス 0 = 1月、インデックス 1 = 2月/立春 …）。 */
const NODE_DAYS = [6, 4, 6, 5, 6, 6, 7, 7, 8, 8, 7, 7] as const;

/**
 * 生年月日から九星気学の基準年（立春補正済み）を返す。
 * 立春（約2月4日）より前に生まれた場合は前年を基準とする。
 */
export function adjustedKyuseiYear(year: number, month: number, day: number): number {
  if (month === 1 || (month === 2 && day < NODE_DAYS[1]!)) {
    return year - 1;
  }
  return year;
}

/**
 * 暦月・日から九星気学の月番号（寅月 = 1 … 丑月 = 12）を返す。
 * 各月の節入りは NODE_DAYS の近似値で判定する。
 */
export function toKyuseiMonth(month: number, day: number): number {
  const nodeDay = NODE_DAYS[month - 1]!;
  if (day >= nodeDay) {
    return ((month - 2 + 12) % 12) + 1;
  }
  return ((month - 3 + 12) % 12) + 1;
}

/**
 * 生年月日から年命星と月命星の名前を返す（立春補正あり）。
 *
 * @returns `{ yearStar, moonStar }` — 九星名（例: "一白水星"）
 */
export function kyuseiPair(
  year: number,
  month: number,
  day: number,
): { yearStar: string; moonStar: string } {
  const adjYear = adjustedKyuseiYear(year, month, day);
  const yearNum = ((11 - ((adjYear - 1990) % 9)) % 9) || 9;
  const kMonth = toKyuseiMonth(month, day);
  // 月命星の起点: 年命星 n に対して base = 8 - (n-1)*3 (mod 9, 0→9)
  const base = ((8 - (yearNum - 1) * 3) % 9 + 9) % 9 || 9;
  const moonNum = ((base - (kMonth - 1)) % 9 + 9) % 9 || 9;
  return {
    yearStar: KYUSEI_NAMES[yearNum]!,
    moonStar: KYUSEI_NAMES[moonNum]!,
  };
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
