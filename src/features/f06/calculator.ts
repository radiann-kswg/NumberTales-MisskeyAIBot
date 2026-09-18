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

// ----------------------------------------------------------------
// 表記の変換（自然な数式 ⇄ mathjs の書き方）
// ----------------------------------------------------------------

/** 上付き文字 → 通常の字（`2²` → `2^2`、`10⁻³` → `10^-3` の変換に使う） */
const SUPERSCRIPT_TO_PLAIN: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-',
};

const PLAIN_TO_SUPERSCRIPT: Record<string, string> = Object.fromEntries(
  Object.entries(SUPERSCRIPT_TO_PLAIN).map(([sup, plain]) => [plain, sup]),
);

/**
 * 自然な数式の記号（×・÷・√・上付き・全角の＋－）を mathjs の書き方に直す。
 * スラッシュコマンドと自然文の**両方**に掛けること。片方だけだと `/calc 2×3` が読めず、
 * 上付きを知らないと `2²+1` から `+1` だけが抽出されて「1」と誤答する。
 */
export function toMathjsNotation(text: string): string {
  return text
    .replace(/[＋]/g, '+')
    .replace(/[－]/g, '-')
    .replace(/[×]/g, '*')
    .replace(/[÷]/g, '/')
    // √N → sqrt(N)、√(expr) → sqrt(expr) の順で処理して括弧を補う
    .replace(/√\s*([0-9.]+)/g, 'sqrt($1)')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√/g, 'sqrt')   // それ以外の残った √ はそのまま変換
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, (run) => '^' + [...run].map((ch) => SUPERSCRIPT_TO_PLAIN[ch]).join(''));
}

/**
 * mathjs の書き方を自然な数式（プレーン式）に直す。toMathjsNotation の逆向き。
 * `*`→`×`、`sqrt(…)`→`√`、整数の指数→上付き、`1.2e+21`→`1.2×10²¹`。
 * `/` は分数として読めるので `÷` にしない。出力はそのまま `/calc` に貼り直せる。
 */
export function toNaturalNotation(text: string): string {
  return text
    .replace(/(\d)e([+-]?\d+)/g, (_, d: string, e: string) => `${d}×10^${e.replace('+', '')}`)
    .replace(/\*/g, '×')
    .replace(/sqrt\(([0-9.]+)\)/g, '√$1')
    .replace(/sqrt\(/g, '√(')
    // 整数の指数だけ上付きにする（`2^0.5` や `2^(1/2)` は触らない）
    .replace(/\^([+-]?\d+)(?![\d.])/g, (_, n: string) => [...n].map((ch) => PLAIN_TO_SUPERSCRIPT[ch]).join(''));
}
