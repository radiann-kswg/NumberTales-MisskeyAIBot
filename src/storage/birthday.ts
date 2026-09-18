/**
 * ユーザー誕生日の永続ストレージ（SQLite・F-11-A）
 *
 * プライバシー方針（AGENTS.md「ユーザー個人情報の永続保存は行わない」への明示的な例外）:
 *   - **年は保存しない**（月日のみ）。年齢の推測・言及も行わない
 *   - ユーザーが自分から申告したときだけ保存する（オプトイン）
 *   - 「誕生日を忘れて」でいつでも削除できる（delete）
 *   - 通知メンションに必要な username / user_host のみ併せて保持する（F-12 TaskStore と同じ範囲）
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface UserBirthday {
  userId: string;
  month: number;
  day: number;
  username: string | null;
  userHost: string | null;
}

interface BirthdayRow {
  user_id: string;
  month: number;
  day: number;
  username: string | null;
  user_host: string | null;
  updated_at: number;
}

function toEntry(row: BirthdayRow): UserBirthday {
  return {
    userId: row.user_id,
    month: row.month,
    day: row.day,
    username: row.username,
    userHost: row.user_host,
  };
}

export class UserBirthdayStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_birthdays (
        user_id    TEXT PRIMARY KEY,
        month      INTEGER NOT NULL,
        day        INTEGER NOT NULL,
        username   TEXT,
        user_host  TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_user_birthdays_date ON user_birthdays (month, day);
    `);
  }

  /** 誕生日を登録（既存があれば上書き）する */
  set(entry: UserBirthday): void {
    this.db
      .prepare(
        `INSERT INTO user_birthdays (user_id, month, day, username, user_host, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           month = excluded.month,
           day = excluded.day,
           username = excluded.username,
           user_host = excluded.user_host,
           updated_at = excluded.updated_at`,
      )
      .run(entry.userId, entry.month, entry.day, entry.username, entry.userHost, Date.now());
  }

  get(userId: string): UserBirthday | null {
    const row = this.db
      .prepare('SELECT * FROM user_birthdays WHERE user_id = ?')
      .get(userId) as BirthdayRow | undefined;
    return row ? toEntry(row) : null;
  }

  /** 登録を削除する。削除できたら true（プライバシー要件: ユーザーがいつでも取り消せること） */
  delete(userId: string): boolean {
    return this.db.prepare('DELETE FROM user_birthdays WHERE user_id = ?').run(userId).changes > 0;
  }

  /** 指定の月日が誕生日のユーザーを返す */
  listByDate(month: number, day: number): UserBirthday[] {
    const rows = this.db
      .prepare('SELECT * FROM user_birthdays WHERE month = ? AND day = ?')
      .all(month, day) as BirthdayRow[];
    return rows.map(toEntry);
  }

  close(): void {
    this.db.close();
  }
}
