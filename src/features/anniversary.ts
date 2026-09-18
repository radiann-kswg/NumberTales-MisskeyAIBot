/**
 * F-11 / F-13 記念日ロジック（純関数のみ）
 *
 * 「今日は誰の・何の日か」を判定するだけのモジュール。投稿や DB アクセスは持たない
 * （配信は `bot/scheduler/anniversary.ts`、ユーザー誕生日の保存は `storage/birthday.ts`）。
 */

import type { CharacterRecord } from '../bot/character/loader.js';
import { reduceToSingleDigit } from './f06/numerology.js';
import { toHalfWidthDigits } from '../utils/text.js';

// ----------------------------------------------------------------
// F-13 カレンダーイベント（静的定義）
// ----------------------------------------------------------------

export interface CalendarEvent {
  readonly month: number;
  readonly day: number;
  readonly name: string;
  /** LLM へ渡す投稿コンセプト。話題・状況だけを書き、口調は書かないこと（TIME_SLOTS と同じ方針） */
  readonly hint: string;
}

/**
 * 季節・記念日イベント。
 *
 * 値が変わらない静的データなので DB テーブルは作らない（アイデアメモの `calendar_events` 案から変更）。
 * 追加・変更はこの配列を直接編集する。
 *
 * 春分の日は年によって 3/20 になるが、毎年の暦計算を持ち込まないため固定 3/21 で運用する。
 */
export const CALENDAR_EVENTS: readonly CalendarEvent[] = [
  { month: 1, day: 1, name: 'お正月', hint: '新年の始まり。今年を表すナンバーテールズ的な数字をひとつ挙げる話題。' },
  { month: 2, day: 3, name: '節分', hint: '節分。厄を払う数字にまつわる話題や、豆まきの情景。' },
  { month: 2, day: 14, name: 'バレンタイン', hint: 'バレンタイン。フォロワーへ向けた気持ちを数字になぞらえて伝える話題。' },
  { month: 3, day: 14, name: 'π（パイ）の日', hint: '円周率 3.14… にまつわる数学の話題。' },
  { month: 3, day: 21, name: '春分の日', hint: '季節の変わり目。サイクルを象徴する数字（9 の完結・1 の始まり）の話題。' },
  { month: 4, day: 1, name: 'エイプリルフール', hint: '数字にまつわる軽い「嘘」ネタ。誰も傷つけない範囲にとどめる話題。' },
  { month: 5, day: 25, name: 'Bot 開発記念日', hint: 'この Bot が動き始めた日。「私が生まれた日」として振り返る話題。' },
  { month: 7, day: 7, name: '七夕', hint: '七夕。7 の意味（精神性・直観）と、星に願いを託す情景。' },
  { month: 11, day: 11, name: 'ポッキーの日 / エンジェルナンバーの日', hint: 'ゾロ目の 1111 は特別なエンジェルナンバーだという話題。' },
  { month: 12, day: 25, name: 'クリスマス', hint: 'クリスマス。2+5=7 で「完成の数字」として一年を締めくくる話題。' },
  { month: 12, day: 31, name: '大晦日', hint: '大晦日。9 のエネルギー（サイクルの完結・手放しと再生）の話題。' },
];

/** 指定日のカレンダーイベントを返す */
export function findCalendarEvents(month: number, day: number): CalendarEvent[] {
  return CALENDAR_EVENTS.filter((e) => e.month === month && e.day === day);
}

// ----------------------------------------------------------------
// F-11-B キャラクターの記念日
// ----------------------------------------------------------------

/** `DayAbout_JP` がこの値のものを「誕生日」として扱い、それ以外は劇中の記念日として扱う */
const BIRTHDAY_LABEL = '開発記念';

export interface CharacterAnniversary {
  readonly charNum: string;
  readonly name: string;
  /** DB の DayAbout_JP（例: '開発記念' / '第一リリース記念(劇中)'） */
  readonly about: string;
  /** 開発記念（＝誕生日）なら true */
  readonly isBirthday: boolean;
}

/**
 * 指定日に記念日を持つキャラクターを返す。
 *
 * 渡す `characters` は `getReleasedCharacters()`（Progress === 'released'）を想定しており、
 * 未公開キャラはその時点で除外されている。`AnivDay` を持たないキャラは素通りする。
 */
export function findCharacterAnniversaries(
  month: number,
  day: number,
  characters: readonly CharacterRecord[],
): CharacterAnniversary[] {
  const found: CharacterAnniversary[] = [];
  for (const c of characters) {
    for (const entry of c.AnivDay ?? []) {
      if (entry.Day?.Month !== month || entry.Day?.DayOfMonth !== day) continue;
      const about = entry.DayAbout_JP ?? '記念日';
      found.push({
        charNum: String(c.Num),
        name: c.Name_JP ?? c.Name ?? `${String(c.Num)}番機`,
        about,
        isBirthday: about === BIRTHDAY_LABEL,
      });
    }
  }
  return found;
}

// ----------------------------------------------------------------
// F-11-A ユーザーの誕生日
// ----------------------------------------------------------------

export interface MonthDay {
  readonly month: number;
  readonly day: number;
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** 実在する月日か（2/29 は登録可。平年の扱いは birthdayLookupDates 側で吸収する） */
export function isValidMonthDay(month: number, day: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= DAYS_IN_MONTH[month - 1]!;
}

const BIRTHDAY_INPUT_PATTERNS: RegExp[] = [
  /(\d{1,2})\s*月\s*(\d{1,2})\s*日/g,
  /(\d{1,2})\s*[/／.-]\s*(\d{1,2})/g,
];

/** 区切りつきの数字が 3 つ以上並ぶ＝年が混ざっている疑い。月日の取り違えを作らないため読み取らない */
const AMBIGUOUS_DATE = /\d+\s*[/／.-]\s*\d+\s*[/／.-]\s*\d+/;

/**
 * 自然文から誕生日の月日を抽出する。年は読み取らない（プライバシー方針: 年は保存しない）。
 * 読み取れない・実在しない日付なら null を返し、呼び出し側は聞き返すこと（誤登録を作らない）。
 */
export function parseBirthdayInput(text: string): MonthDay | null {
  const normalized = toHalfWidthDigits(text);
  if (AMBIGUOUS_DATE.test(normalized)) return null;
  for (const pattern of BIRTHDAY_INPUT_PATTERNS) {
    // matchAll は正規表現を複製して走査するので lastIndex の持ち越しは起きない
    for (const m of normalized.matchAll(pattern)) {
      const month = parseInt(m[1]!, 10);
      const day = parseInt(m[2]!, 10);
      if (isValidMonthDay(month, day)) return { month, day };
    }
  }
  return null;
}

/** 誕生数（月日の数字和を縮約）。F-10 の解釈文が実装されたら、この値に文面を紐付ける */
export function birthdayNumber(month: number, day: number): number {
  const sum = [...String(month), ...String(day)].reduce((acc, d) => acc + Number(d), 0);
  return reduceToSingleDigit(sum);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * その日に照合すべき月日の一覧を返す。
 * 平年の 2/28 は 2/29 生まれも一緒に祝う（2/29 は 4 年に 1 度しか来ないため）。
 */
export function birthdayLookupDates(year: number, month: number, day: number): MonthDay[] {
  const dates: MonthDay[] = [{ month, day }];
  if (month === 2 && day === 28 && !isLeapYear(year)) {
    dates.push({ month: 2, day: 29 });
  }
  return dates;
}
