// F-06 数式計算モジュール — mathjs ラッパー

import * as math from 'mathjs';

/** evaluate() を呼んでよいか検査する禁止キーワード */
const FORBIDDEN_PATTERN = /import|require|process|__dirname|__filename|global|eval|Function/i;

// mathjs 標準に無い単位の語彙（天文系）。`1 lightyear to km` のように使う
math.createUnit({
  lightyear: { definition: '9460730472580800 m', aliases: ['ly'] },
  parsec: { definition: '30856775814913673 m', aliases: ['pc'] },
  au: '149597870700 m',
});

/** 入力の長さと禁止キーワードの検査（evaluate と derivative で共通） */
function assertSafeExpr(expr: string): void {
  if (expr.length > 200) {
    throw new Error('式が長すぎるよ');
  }
  if (FORBIDDEN_PATTERN.test(expr)) {
    throw new Error('その式は評価できないよ');
  }
}

/**
 * 式を微分して mathjs の書き方で返す。
 * 微分する変数は、式に `x` があれば `x`、無くて英字（関数名を除く）が 1 種類だけならその字。
 * @throws 変数を決められない・式を読み取れない場合
 */
export function safeDerivative(expr: string): { variable: string; result: string } {
  assertSafeExpr(expr);
  const letters = new Set(expr.replace(/\b(sin|cos|tan|log|sqrt|exp|abs|pi|e)\b/g, '').replace(/[^a-zA-Z]/g, ''));
  const variable = letters.has('x') ? 'x' : letters.size === 1 ? [...letters][0]! : null;
  if (!variable) {
    throw new Error('微分する変数が分からなかった');
  }
  try {
    return { variable, result: math.derivative(expr, variable).toString() };
  } catch {
    throw new Error('式を読み取れなかった');
  }
}

/**
 * 数式文字列を安全に評価して結果文字列を返す。
 *
 * @param expr - 評価する数式（最大 200 文字）
 * @returns 評価結果を文字列化したもの
 * @throws 式が長すぎる・禁止キーワード含む・評価エラーの場合
 */
export function safeEvaluate(expr: string): string {
  assertSafeExpr(expr);

  let result: unknown;
  try {
    result = math.evaluate(expr);
  } catch {
    throw new Error('式を読み取れなかった');
  }

  // 数値・行列・単位以外（関数オブジェクト等）は拒否する
  const typeName = math.typeOf(result);
  // 行列の typeOf は 'Matrix' ではなく 'DenseMatrix' / 'SparseMatrix'（2026-09-18 に判明。それまで行列は全部弾かれていた）
  const allowedTypes = new Set(['number', 'BigNumber', 'Fraction', 'Complex', 'DenseMatrix', 'SparseMatrix', 'Unit', 'ResultSet']);
  if (!allowedTypes.has(typeName)) {
    throw new Error('計算結果を返せる形式じゃなかった');
  }

  return math.format(result as math.MathType, { precision: 10 });
}

/** 厳密値用: 数値を Fraction として評価するインスタンス（√ や単位が混じると評価に失敗するので、その時は諦める） */
const fractionMath = math.create(math.all, { number: 'Fraction' });

/**
 * 割り算を含み、小数が終わらない答えにだけ分数（厳密値）を返す。
 * 分母に 2 と 5 以外の素因数が残るものが対象: `1/3` → "1/3"、`1/4` → null。
 * safeEvaluate を通った式にだけ使うこと（禁止キーワードの検査はしない）。
 */
export function exactFraction(expr: string): string | null {
  if (!expr.includes('/')) return null;
  let result: unknown;
  try {
    result = fractionMath.evaluate(expr);
  } catch {
    return null;
  }
  if (math.typeOf(result) !== 'Fraction') return null;
  let d = Number((result as math.Fraction).d);
  for (const p of [2, 5]) while (d % p === 0) d /= p;
  return d === 1 ? null : math.format(result);
}

// ----------------------------------------------------------------
// 画像清書（F-17C）向けの TeX
// ----------------------------------------------------------------

/** 画像にする式の長さの上限（プレーン式の文字数）。10×10 の行列が収まる程度。実物を見ながら調整する */
export const TYPESET_MAX_CHARS = 400;

/** mathjs の 1 式を、画像パイプラインが読める TeX に直す */
function toTex(expr: string): string {
  return math
    .parse(expr)
    .toTex({ parenthesis: 'auto' })
    .replace(/\\cdot/g, '\\times')
    .replace(/\\begin\{bmatrix\}([\s\S]*?)\\end\{bmatrix\}/g, '\\left[\\matrix{$1}\\right]')
    .replace(/\\mathrm\{([^}]*)\}/g, '$1')
    .replace(/~/g, ' ')
    // mathjs は指数の底を `{ x}^{2}` と括るが、パイプラインは `{…}^` の形を読めない。単純な底の括りを外す
    // ponytail: `{sin(x)}^{2}` のような複合の底は外さない（描画に失敗してプレーン式に落ちる）。要るなら括弧の釣り合いを数える
    .replace(/\{\s*([A-Za-z0-9.]+)\s*\}(?=[\^_])/g, '$1')
    // パイプラインに無いコマンド: 関数名は素の字で、単位換算の矢印は字形のある → で
    .replace(/\\(sin|cos|tan|log|ln|exp|abs)\b/g, ' $1')
    .replace(/\\rightarrow/g, '→');
}

/**
 * `式 = 答え（= 厳密値）` の TeX と、縦構造（分数・入れ子の根号・行列）の有無を返す。
 * どれかが TeX にできなければ null（画像にしない）。
 * @param derivativeVar 微分のときの変数。`d/dx(式) = 答え` の形で組み、常に縦構造とみなす
 */
export function toTypesetTex(
  expr: string,
  result: string,
  options: { exact?: string | null; derivativeVar?: string } = {},
): { tex: string; vertical: boolean } | null {
  try {
    const lhs = options.derivativeVar ? `\\frac{d}{d${options.derivativeVar}}\\left(${toTex(expr)}\\right)` : toTex(expr);
    const tex = `${lhs} = ${toTex(result)}${options.exact ? ` = ${toTex(options.exact)}` : ''}`;
    return { tex, vertical: /\\frac|\\sqrt\{[^}]*\\sqrt|\\matrix/.test(tex) };
  } catch {
    return null;
  }
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
