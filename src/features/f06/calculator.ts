// F-06 数式計算モジュール — mathjs ラッパー

import * as math from 'mathjs';

/** evaluate() を呼んでよいか検査する禁止キーワード */
const FORBIDDEN_PATTERN = /import|require|process|__dirname|__filename|global|eval|Function/i;

/**
 * 数式文字列を安全に評価して結果文字列を返す。
 *
 * @param expr - 評価する数式（最大 200 文字）
 * @returns 評価結果を文字列化したもの
 * @throws 式が長すぎる・禁止キーワード含む・評価エラーの場合
 */
export function safeEvaluate(expr: string): string {
  if (expr.length > 200) {
    throw new Error('式が長すぎるよ');
  }

  if (FORBIDDEN_PATTERN.test(expr)) {
    throw new Error('その式は評価できないよ');
  }

  let result: unknown;
  try {
    result = math.evaluate(expr);
  } catch {
    throw new Error('式を読み取れなかった');
  }

  // 数値・行列・単位以外（関数オブジェクト等）は拒否する
  const typeName = math.typeOf(result);
  const allowedTypes = new Set(['number', 'BigNumber', 'Fraction', 'Complex', 'Matrix', 'Unit', 'ResultSet']);
  if (!allowedTypes.has(typeName)) {
    throw new Error('計算結果を返せる形式じゃなかった');
  }

  return math.format(result as math.MathType, { precision: 10 });
}
