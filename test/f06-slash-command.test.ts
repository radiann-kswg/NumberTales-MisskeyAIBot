import { describe, it, expect } from 'vitest';
import { handleCalculate, handleLifePath, handleKyusei, handleTsukimeisei } from '../dist/features/f06/index.js';

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
