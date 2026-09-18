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
