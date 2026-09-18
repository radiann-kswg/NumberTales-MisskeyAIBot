import { describe, it, expect } from 'vitest';
import { handleCalculate, handleLifePath, handleKyusei, handleTsukimeisei } from '../dist/features/f06/index.js';
import { toNaturalNotation } from '../dist/features/f06/calculator.js';
import { decorateExpr } from '../dist/features/f06/calc-quiz.js';
import { calcResponse, CALC_TEXT_LIMIT } from '../dist/features/f06/responder.js';

/**
 * 実機バグ（2026-09-18）の回帰ガード: SLASH_CMD_PATTERN のサブコマンド用グループが
 * 引数の先頭トークンを食い、`/calc 2 + 3` が `+ 3` を評価して「3」と誤答していた。
 * 同じパターンを使う 4 ハンドラすべてで、空白区切りの引数が丸ごと届くことを固定する。
 */
describe('F-06 スラッシュコマンド — 空白区切りの引数が先頭から届く', () => {
  it.each([
    ['/calc 2 + 3', '= 5'],
    ['/calc 100 + 200', '= 300'],
    ['/calc 12 * 8', '= 96'],
    ['/calc 2+3', '= 5'], // 空白なしは従来どおり
    ['/calc 5 km to mile', '3.106855961 mile'],
  ])('%s → %s', (input, expected) => {
    expect(handleCalculate(input).text).toContain(expected);
  });

  it.each([
    ['/lp 1990 05 05', handleLifePath],
    ['/lp 19900505', handleLifePath],
    ['/tsukimei 1990 05 05', handleTsukimeisei],
    ['/kyusei 1990', handleKyusei],
    ['/kyusei 1990 おまけ', handleKyusei], // 旧パターンで拾えていた先頭の年を落とさない
  ])('%s は占い結果（CW）を返す', (input, handler) => {
    expect(handler(input).cwBody).toBeDefined();
  });
});

/**
 * 実機バグ（2026-09-18）の回帰ガード: 自然な数式の記号の正規化が自然文の経路にしか掛かっておらず、
 * `/calc 2×3` はエラー、上付きは未対応で `2²+1 を計算して` が `+1` だけ抽出され「1」と誤答していた。
 */
describe('F-06 数式計算 — 自然な数式の記号（×÷√・上付き）を両経路で読む', () => {
  it.each([
    ['2²+1 を計算して', '= 5'],
    ['/calc 2²+1', '= 5'],
    ['/calc 2×3', '= 6'],
    ['/calc 2÷4', '= 0.5'],
    ['/calc √2', '= 1.414213562'],
    ['/calc 10⁻³', '= 0.001'],
    ['2¹⁰ を計算して', '= 1024'],
    ['2×3 を計算して', '= 6'], // 自然文の経路は従来どおり
  ])('%s → %s', (input, expected) => {
    expect(handleCalculate(input).text).toContain(expected);
  });
});

/**
 * F-06 数式計算の清書（T1・2026-09-18）: プレーン式は自然な表記で `/calc` に貼り直せる形、
 * PM 絵文字（墨）はそれを 1 字ずつ置き換えたもの。本文の上限を超えるときは絵文字→プレーン式→切り詰めの順で落とす。
 */
describe('F-06 数式計算 — 清書（プレーン式 + PM 絵文字）', () => {
  it.each([
    ['2*3', '2×3'],
    ['sqrt(2)', '√2'],
    ['sqrt(x+1)', '√(x+1)'],
    ['2^10', '2¹⁰'],
    ['10^-3', '10⁻³'],
    ['2^0.5', '2^0.5'], // 小数の指数は上付きにしない
    ['1.180591621e+21', '1.180591621×10²¹'],
    ['1e-7', '1×10⁻⁷'],
    ['1/3', '1/3'], // `/` は ÷ にしない
  ])('toNaturalNotation(%s) → %s', (input, expected) => {
    expect(toNaturalNotation(input)).toBe(expected);
  });

  it('プレーン式は貼り直すと同じ答えになる', () => {
    const first = handleCalculate('/calc 2^10 * sqrt(4)').text;
    const plain = first.split('\n')[1]!; // 2 行目がプレーン式
    expect(plain).toBe('2¹⁰ × √4 = 2048');
    expect(handleCalculate(`/calc ${plain.split(' = ')[0]}`).text.split('\n')[1]).toBe(plain);
  });

  it('PM 絵文字は墨固定で、プレーン式を併記する', () => {
    const text = handleCalculate('/calc 2 + 3').text;
    expect(text).toBe(':n2p: :plp: :n3p: :eqp: :n5p:\n2 + 3 = 5\n計算完了だよ');
  });

  it('単位・行列・上付きも絵文字に置き換わる', () => {
    expect(decorateExpr('3.1 mile', 'sumi')).toBe(':n3p::dtp::n1p: :lmp::lip::llp::lep:');
    expect(decorateExpr('[1, 2]', 'sumi')).toBe(':bop::n1p::cmp: :n2p::bxp:');
    expect(decorateExpr('10⁻³', 'sumi')).toBe(':n1p::n0p::supminusp::sup3p:');
  });

  it('本文の上限を超えるときは絵文字を落とし、それでも超えるときは先頭だけ残す', () => {
    const mid = 'x'.repeat(CALC_TEXT_LIMIT - 100);
    expect(calcResponse(mid)).toBe(`${mid}\n計算完了だよ`);
    const long = 'x'.repeat(CALC_TEXT_LIMIT + 100);
    const truncated = calcResponse(long);
    expect(truncated).toContain('長すぎるから先頭だけ載せるね');
    expect(truncated.length).toBeLessThan(CALC_TEXT_LIMIT + 50);
  });
});

/**
 * F-06 数式計算の厳密値（T2・2026-09-18）: 割り算を含み小数が終わらない答えにだけ分数を併記する。
 */
describe('F-06 数式計算 — 厳密値の併記', () => {
  it.each([
    ['/calc 1/3', '1/3 = 0.3333333333 = 1/3'],
    ['/calc 2/6', '2/6 = 0.3333333333 = 1/3'],
    ['/calc 22/7', '22/7 = 3.142857143 = 22/7'],
    ['/calc 1/3 + 1/6', '1/3 + 1/6 = 0.5'], // 通分すると 1/2 で割り切れる
    ['/calc 1/4', '1/4 = 0.25'],
    ['/calc 10/4', '10/4 = 2.5'],
    ['/calc sqrt(2)/3', '√2/3 = 0.4714045208'], // 無理数は分数にできない
  ])('%s → %s', (input, expected) => {
    expect(handleCalculate(input).text.split('\n')[1]).toBe(expected);
  });
});

/**
 * F-06 評価範囲の拡張（T3・2026-09-18）: 天文系の単位語彙と、自然文「微分して」。
 */
describe('F-06 数式計算 — 単位語彙と微分', () => {
  it.each([
    ['/calc 1 lightyear to km', '9.460730473×10¹² km'],
    ['/calc 1 pc to ly', '3.261563777 ly'],
    ['/calc 1 au to km', '1.495978707×10⁸ km'],
  ])('%s → %s', (input, expected) => {
    expect(handleCalculate(input).text.split('\n')[1]).toContain(expected);
  });

  it.each([
    ['x^2+3x を微分して', 'd/dx (x²+3x) = 2 × x + 3'],
    ['x²+3x を微分して', 'd/dx (x²+3x) = 2 × x + 3'], // 上付きでも同じ
    ['sin(t) を微分して', 'd/dt (sin(t)) = cos(t)'], // x が無く英字が 1 種類なら t
    ['x*y を微分して', 'd/dx (x×y) = y'], // x があれば x
  ])('%s → %s', (input, expected) => {
    expect(handleCalculate(input).text.split('\n')[1]).toBe(expected);
  });

  it('微分する変数が決まらないときはエラー応答', () => {
    expect(handleCalculate('a*b を微分して').text).toContain('うまく読み取れなかった');
  });
});
