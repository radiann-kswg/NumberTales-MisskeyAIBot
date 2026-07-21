import { describe, it, expect } from 'vitest';
import { formatDowntime } from '../dist/features/recovery-notice.js';

/**
 * 復旧通知の停止時間表記はコード側で確定する（LLM に計算させない）。
 * 「●分 / ●時間 / ●日と●時間」の境界を固定化する。
 */
describe('formatDowntime — 停止時間のコード側整形', () => {
  const cases: [number, string][] = [
    [5 * 60_000, '5分'],
    [59 * 60_000, '59分'],
    [60 * 60_000, '1時間'],
    [90 * 60_000, '1時間'],
    [24 * 60 * 60_000, '1日'],
    [25 * 60 * 60_000, '1日と1時間'],
    [2 * 24 * 60 * 60_000, '2日'],
  ];

  it.each(cases)('%dms → %s', (ms, expected) => {
    expect(formatDowntime(ms)).toBe(expected);
  });
});
