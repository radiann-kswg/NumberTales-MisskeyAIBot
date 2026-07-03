/**
 * リマインダー永続ストレージ（SQLite・F-12）
 *
 * ユーザーからの「〇時間後に〇〇を教えて」等のリクエストを保持し、
 * スケジューラーが定期的に期限切れ分を配信する。
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type ReminderStatus = 'pending' | 'done' | 'cancelled';

export interface ReminderRecord {
  id: number;
  userId: string;
  username: string | null;
  userHost: string | null;
  content: string;
  remindAt: number;
  status: ReminderStatus;
  createdAt: number;
  noteId: string | null;
}

/** 1ユーザーあたりの同時登録上限 */
export const REMINDER_MAX_PENDING = 3;

/** 完了・キャンセル済みレコードの保持期限（7日） */
const REMINDER_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

interface ReminderRow {
  id: number;
  user_id: string;
  username: string | null;
  user_host: string | null;
  content: string;
  remind_at: number;
  status: ReminderStatus;
  created_at: number;
  note_id: string | null;
}

function toRecord(row: ReminderRow): ReminderRecord {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    userHost: row.user_host,
    content: row.content,
    remindAt: row.remind_at,
    status: row.status,
    createdAt: row.created_at,
    noteId: row.note_id,
  };
}

export class ReminderStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reminders (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     TEXT NOT NULL,
        username    TEXT,
        user_host   TEXT,
        content     TEXT NOT NULL,
        remind_at   INTEGER NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done','cancelled')),
        created_at  INTEGER NOT NULL,
        note_id     TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders (user_id, status);
      CREATE INDEX IF NOT EXISTS idx_reminders_due  ON reminders (status, remind_at);
    `);
  }

  /** 指定ユーザーの pending 件数を返す */
  countPending(userId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS count FROM reminders WHERE user_id = ? AND status = 'pending'`)
      .get(userId) as { count: number };
    return row.count;
  }

  /** リマインダーを新規登録する（上限チェックは呼び出し側の責務） */
  create(
    userId: string,
    username: string | null,
    userHost: string | null,
    content: string,
    remindAtMs: number,
    noteId?: string,
  ): number {
    const now = Date.now();
    const result = this.db
      .prepare(
        `INSERT INTO reminders (user_id, username, user_host, content, remind_at, status, created_at, note_id)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .run(userId, username, userHost, content, remindAtMs, now, noteId ?? null);
    return Number(result.lastInsertRowid);
  }

  /** 指定ユーザーの pending リマインダーを remind_at 昇順で取得する */
  listPending(userId: string): ReminderRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM reminders WHERE user_id = ? AND status = 'pending' ORDER BY remind_at ASC`,
      )
      .all(userId) as ReminderRow[];
    return rows.map(toRecord);
  }

  /** listPending() と同じ並び順の1-indexed 番号でキャンセルする */
  cancelByIndex(userId: string, index1based: number): ReminderRecord | null {
    const pending = this.listPending(userId);
    const target = pending[index1based - 1];
    if (!target) return null;
    this.db.prepare(`UPDATE reminders SET status = 'cancelled' WHERE id = ?`).run(target.id);
    return target;
  }

  /** content の部分一致で1件だけヒットした場合にキャンセルする（複数/0件ヒット時は null） */
  cancelByContent(userId: string, query: string): ReminderRecord | null {
    const pending = this.listPending(userId);
    const matches = pending.filter((r) => r.content.includes(query));
    if (matches.length !== 1) return null;
    const target = matches[0]!;
    this.db.prepare(`UPDATE reminders SET status = 'cancelled' WHERE id = ?`).run(target.id);
    return target;
  }

  /** 配信時刻を過ぎた pending レコードを全ユーザー横断で取得する */
  getDue(nowMs: number): ReminderRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM reminders WHERE status = 'pending' AND remind_at <= ? ORDER BY remind_at ASC`)
      .all(nowMs) as ReminderRow[];
    return rows.map(toRecord);
  }

  /** 配信完了をマークする */
  markDone(id: number): void {
    this.db.prepare(`UPDATE reminders SET status = 'done' WHERE id = ?`).run(id);
  }

  /** 完了・キャンセル済みで保持期限（7日）を過ぎたレコードを削除する */
  pruneOld(): void {
    const cutoff = Date.now() - REMINDER_RETENTION_MS;
    this.db
      .prepare(`DELETE FROM reminders WHERE status IN ('done','cancelled') AND created_at <= ?`)
      .run(cutoff);
  }

  close(): void {
    this.db.close();
  }
}
