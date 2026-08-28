/**
 * 全角数字・丸数字をユーザー入力の数値解析で扱うための共通ヘルパー。
 *
 * Bot が一覧・ダイス表示等で丸数字（①②③...）を使う一方、ユーザーが返信で
 * 半角数字（1番）ではなく丸数字や全角数字（１番）をそのまま使うケースがあるため、
 * 各コマンドの数値解析の前段でこれらを半角数字へ正規化するために使う。
 */

/** 丸数字→半角数字（1-10）の対応 */
export const CIRCLED_DIGIT_TO_INDEX: Record<string, number> = {
  '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5,
  '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9, '⑩': 10,
};

/** テキスト中に含まれる丸数字（①〜⑩）のうち最初の1つを数値として返す。無ければ null */
export function matchCircledDigit(text: string): number | null {
  const match = /[①②③④⑤⑥⑦⑧⑨⑩]/.exec(text);
  return match ? CIRCLED_DIGIT_TO_INDEX[match[0]]! : null;
}

/** 全角数字（０-９）を半角数字に変換する */
export function toHalfWidthDigits(s: string): string {
  return s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
}
