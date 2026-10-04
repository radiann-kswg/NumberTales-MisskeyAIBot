import { describe, it, expect } from 'vitest';
import {
  birthdayLookupDates,
  birthdayNumber,
  findCalendarEvents,
  findCharacterAnniversaries,
  isValidMonthDay,
  parseBirthdayInput,
} from '../dist/features/anniversary.js';
import { UserBirthdayStore } from '../dist/storage/birthday.js';

describe('parseBirthdayInput — 自然文からの月日抽出（年は読み取らない）', () => {
  const cases: [string, { month: number; day: number } | null][] = [
    ['私の誕生日は7月7日です', { month: 7, day: 7 }],
    ['誕生日登録したい、6/15生まれ', { month: 6, day: 15 }],
    ['誕生日は１２月２５日だよ', { month: 12, day: 25 }],
    ['誕生日は02/29です', { month: 2, day: 29 }],
    // 実在しない日付は登録させない（誤登録を作らない）
    ['誕生日は13月40日', null],
    ['誕生日は2月30日', null],
    ['誕生日は4月31日', null],
    // 日付が読み取れない文は null（呼び出し側が聞き返す）
    ['誕生日を覚えておいて', null],
    // 年まじりの区切り表記は月日を取り違えうるので読まない（聞き返しに倒す）
    ['12/6/15', null],
    ['1990/6/15', null],
    ['1990年6月15日', { month: 6, day: 15 }],
  ];

  it.each(cases)('%s', (text, expected) => {
    expect(parseBirthdayInput(text)).toEqual(expected);
  });
});

describe('isValidMonthDay', () => {
  it('2/29 は登録可・2/30 と 4/31 は不可', () => {
    expect(isValidMonthDay(2, 29)).toBe(true);
    expect(isValidMonthDay(2, 30)).toBe(false);
    expect(isValidMonthDay(4, 31)).toBe(false);
    expect(isValidMonthDay(0, 1)).toBe(false);
  });
});

describe('birthdayNumber — 月日の数字和を縮約', () => {
  it.each([
    [7, 7, 5], // 7+7=14 → 5
    [12, 25, 1], // 1+2+2+5=10 → 1
    [2, 9, 11], // 2+9=11 → マスターナンバーは縮約しない
  ] as [number, number, number][])('%d/%d → %d', (m, d, expected) => {
    expect(birthdayNumber(m, d)).toBe(expected);
  });
});

describe('birthdayLookupDates — 平年の 2/28 は 2/29 生まれも祝う', () => {
  it('平年の 2/28 は 2/29 を含む', () => {
    expect(birthdayLookupDates(2026, 2, 28)).toEqual([
      { month: 2, day: 28 },
      { month: 2, day: 29 },
    ]);
  });

  it('閏年の 2/28 は 2/28 のみ（2/29 当日に祝う）', () => {
    expect(birthdayLookupDates(2028, 2, 28)).toEqual([{ month: 2, day: 28 }]);
  });

  it('通常の日は1件だけ', () => {
    expect(birthdayLookupDates(2026, 7, 7)).toEqual([{ month: 7, day: 7 }]);
  });
});

describe('findCalendarEvents', () => {
  it('定義日はヒットし、非定義日は空', () => {
    expect(findCalendarEvents(7, 7).map((e) => e.name)).toEqual(['七夕']);
    expect(findCalendarEvents(7, 8)).toEqual([]);
  });
});

describe('findCharacterAnniversaries — AnivDay の照合', () => {
  const characters = [
    {
      Num: '78',
      Name_JP: '78(ナナハ)',
      AnivDay: [{ Day: { Month: 7, DayOfMonth: 8 }, DayAbout_JP: '開発記念' }],
    },
    {
      Num: '47',
      Name_JP: '47(ヨナ)',
      AnivDay: [{ Day: { Month: 9, DayOfMonth: 7 }, DayAbout_JP: '加護観測記念(劇中)' }],
    },
    // AnivDay を持たないキャラは素通りする（released 92 件中 1 件が該当）
    { Num: '99', Name_JP: '99(ククリ)' },
  ];

  it('開発記念は誕生日として扱う', () => {
    expect(findCharacterAnniversaries(7, 8, characters)).toEqual([
      { charNum: '78', name: '78(ナナハ)', about: '開発記念', isBirthday: true },
    ]);
  });

  it('劇中記念日は誕生日扱いにしない', () => {
    const found = findCharacterAnniversaries(9, 7, characters);
    expect(found).toHaveLength(1);
    expect(found[0].isBirthday).toBe(false);
    expect(found[0].about).toBe('加護観測記念(劇中)');
  });

  it('該当が無い日は空配列', () => {
    expect(findCharacterAnniversaries(1, 1, characters)).toEqual([]);
  });
});

describe('UserBirthdayStore', () => {
  it('登録・日付検索・削除ができる', () => {
    const s = new UserBirthdayStore(':memory:');
    s.set({ userId: 'u1', month: 7, day: 7, username: 'alice', userHost: null });
    expect(s.get('u1')).toEqual({
      userId: 'u1',
      month: 7,
      day: 7,
      username: 'alice',
      userHost: null,
    });
    expect(s.listByDate(7, 7)).toHaveLength(1);
    expect(s.listByDate(7, 8)).toHaveLength(0);

    // 上書き登録（誕生日の訂正）
    s.set({ userId: 'u1', month: 8, day: 1, username: 'alice', userHost: null });
    expect(s.listByDate(7, 7)).toHaveLength(0);
    expect(s.listByDate(8, 1)).toHaveLength(1);

    // プライバシー要件: いつでも削除できること
    expect(s.delete('u1')).toBe(true);
    expect(s.get('u1')).toBeNull();
    expect(s.delete('u1')).toBe(false);
    s.close();
  });
});
