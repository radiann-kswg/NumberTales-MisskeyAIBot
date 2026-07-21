import { describe, it, expect } from 'vitest';
import { CharacterAffinityStore, affinityLevel } from '../dist/storage/character-affinity.js';

describe('affinityLevel — レベル閾値（暫定: 1/10/30）', () => {
  it.each([
    [0, 0],
    [1, 1],
    [9, 1],
    [10, 2],
    [29, 2],
    [30, 3],
    [100, 3],
  ] as [number, number][])('%d点 → Lv.%d', (points, level) => {
    expect(affinityLevel(points)).toBe(level);
  });
});

describe('CharacterAffinityStore', () => {
  const store = (): CharacterAffinityStore => new CharacterAffinityStore(':memory:');

  it('addPoints で加算し getPoints/getLevel に反映される', () => {
    const s = store();
    expect(s.getPoints('u1', '78')).toBe(0);
    expect(s.addPoints('u1', '78', 12)).toBe(12);
    expect(s.getPoints('u1', '78')).toBe(12);
    expect(s.getLevel('u1', '78')).toBe(2);
    s.close();
  });

  it('日次上限で当日の超過分は加算しない／翌日はリセット', () => {
    const s = store();
    const day = '2026-07-21';
    expect(s.addPoints('u1', '78', 3, { dailyCap: 5, todayJstDateStr: day })).toBe(3);
    expect(s.addPoints('u1', '78', 3, { dailyCap: 5, todayJstDateStr: day })).toBe(2); // 残り 5-3=2
    expect(s.addPoints('u1', '78', 3, { dailyCap: 5, todayJstDateStr: day })).toBe(0); // 上限到達
    expect(s.getPoints('u1', '78')).toBe(5);
    expect(s.addPoints('u1', '78', 4, { dailyCap: 5, todayJstDateStr: '2026-07-22' })).toBe(4); // 翌日
    expect(s.getPoints('u1', '78')).toBe(9);
    s.close();
  });

  it('getTopAffinity は最高点・excludeNum 除外・0点なら null', () => {
    const s = store();
    expect(s.getTopAffinity('u1')).toBeNull();
    s.addPoints('u1', '78', 20);
    s.addPoints('u1', '44', 15);
    s.addPoints('u1', '33', 5);
    expect(s.getTopAffinity('u1')?.charNum).toBe('78');
    expect(s.getTopAffinity('u1', '78')?.charNum).toBe('44'); // アクティブ本人を除外
    s.close();
  });

  it('listByAffinity は points 降順・0点除外・ユーザー分離', () => {
    const s = store();
    s.addPoints('u1', '44', 15);
    s.addPoints('u1', '78', 20);
    s.addPoints('u2', '10', 5);
    expect(s.listByAffinity('u1').map((e) => e.charNum)).toEqual(['78', '44']);
    s.close();
  });
});
