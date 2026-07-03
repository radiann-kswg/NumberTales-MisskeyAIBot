/**
 * タスク＆スケジュール管理 永続ストレージ（SQLite・F-12 Phase A）
 *
 * F-12 MVP の `reminders` テーブルを置き換える。優先度・難易度・期日（due_at）と
 * 通知日時（remind_at）を分離して保持し、進捗％計算・スケジュール自動完了に対応する。
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type TaskRemindType = 'todo' | 'alert' | 'schedule';
export type TaskStatus = 'todo' | 'done' | 'cancelled';
export type TaskPriority = 1 | 2 | 3;
export type TaskDifficulty = 1 | 2 | 3;

export interface TaskRecord {
  id: number;
  userId: string;
  username: string | null;
  userHost: string | null;
  title: string;
  dueAt: number | null;
  remindAt: number | null;
  remindType: TaskRemindType;
  status: TaskStatus;
  priority: TaskPriority;
  difficulty: TaskDifficulty;
  dueNotified: boolean;
  createdAt: number;
  completedAt: number | null;
  noteId: string | null;
}

/** 同時アクティブ（status='todo'）上限 */
export const TASK_MAX_ACTIVE = 10;

interface TaskRow {
  id: number;
  user_id: string;
  username: string | null;
  user_host: string | null;
  title: string;
  due_at: number | null;
  remind_at: number | null;
  remind_type: TaskRemindType;
  status: TaskStatus;
  priority: TaskPriority;
  difficulty: TaskDifficulty;
  due_notified: number;
  created_at: number;
  completed_at: number | null;
  note_id: string | null;
}

function toRecord(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    userHost: row.user_host,
    title: row.title,
    dueAt: row.due_at,
    remindAt: row.remind_at,
    remindType: row.remind_type,
    status: row.status,
    priority: row.priority,
    difficulty: row.difficulty,
    dueNotified: row.due_notified === 1,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    noteId: row.note_id,
  };
}

export class TaskStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       TEXT NOT NULL,
        username      TEXT,
        user_host     TEXT,
        title         TEXT NOT NULL,
        due_at        INTEGER,
        remind_at     INTEGER,
        remind_type   TEXT NOT NULL DEFAULT 'todo' CHECK(remind_type IN ('todo','alert','schedule')),
        status        TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','done','cancelled')),
        priority      INTEGER NOT NULL DEFAULT 2,
        difficulty    INTEGER NOT NULL DEFAULT 2,
        due_notified  INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL,
        completed_at  INTEGER,
        note_id       TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_user   ON tasks (user_id, status);
      CREATE INDEX IF NOT EXISTS idx_tasks_remind ON tasks (remind_at, status);
      CREATE INDEX IF NOT EXISTS idx_tasks_due    ON tasks (due_at, status);
    `);
  }

  /** 指定ユーザーの status='todo' 件数を返す（上限チェック用） */
  countActive(userId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS count FROM tasks WHERE user_id = ? AND status = 'todo'`)
      .get(userId) as { count: number };
    return row.count;
  }

  /** タスクを新規登録する（上限チェックは呼び出し側の責務） */
  create(params: {
    userId: string;
    username: string | null;
    userHost: string | null;
    title: string;
    dueAt: number | null;
    remindAt: number | null;
    remindType: TaskRemindType;
    priority: TaskPriority;
    difficulty: TaskDifficulty;
    noteId?: string;
  }): number {
    const now = Date.now();
    const result = this.db
      .prepare(
        `INSERT INTO tasks
           (user_id, username, user_host, title, due_at, remind_at, remind_type,
            status, priority, difficulty, due_notified, created_at, note_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?, 0, ?, ?)`,
      )
      .run(
        params.userId,
        params.username,
        params.userHost,
        params.title,
        params.dueAt,
        params.remindAt,
        params.remindType,
        params.priority,
        params.difficulty,
        now,
        params.noteId ?? null,
      );
    return Number(result.lastInsertRowid);
  }

  /** 指定ユーザーの status='todo' タスクを priority ASC, due_at ASC（null は最後）で取得する */
  listActive(userId: string): TaskRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM tasks WHERE user_id = ? AND status = 'todo'
         ORDER BY priority ASC, (due_at IS NULL), due_at ASC`,
      )
      .all(userId) as TaskRow[];
    return rows.map(toRecord);
  }

  /** キャンセル以外（進捗％計算用: todo + done） */
  listAllNonCancelled(userId: string): TaskRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM tasks WHERE user_id = ? AND status != 'cancelled'`)
      .all(userId) as TaskRow[];
    return rows.map(toRecord);
  }

  /** listActive() と同じ並び順の1-indexed 番号でタスクを取得する */
  findByIndex(userId: string, index1based: number): TaskRecord | null {
    const active = this.listActive(userId);
    return active[index1based - 1] ?? null;
  }

  /** title の部分一致でアクティブタスクを検索する（複数ヒット可） */
  findCandidatesByTitle(userId: string, query: string): TaskRecord[] {
    return this.listActive(userId).filter((t) => t.title.includes(query));
  }

  /** タスクを完了にする */
  markDone(id: number, completedAtMs: number): void {
    this.db
      .prepare(`UPDATE tasks SET status = 'done', completed_at = ? WHERE id = ?`)
      .run(completedAtMs, id);
  }

  /** タスクをキャンセルする */
  markCancelled(id: number): void {
    this.db.prepare(`UPDATE tasks SET status = 'cancelled' WHERE id = ?`).run(id);
  }

  /** 通知時刻を過ぎた pending 通知対象（alert/schedule）を全ユーザー横断で取得する */
  getDueForRemind(nowMs: number, limit: number): TaskRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM tasks
         WHERE status = 'todo' AND remind_type IN ('alert','schedule')
           AND remind_at IS NOT NULL AND remind_at <= ?
         ORDER BY remind_at ASC LIMIT ?`,
      )
      .all(nowMs, limit) as TaskRow[];
    return rows.map(toRecord);
  }

  /** 期日を過ぎた未通知の alert タスクを取得する */
  getOverdue(nowMs: number, limit: number): TaskRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM tasks
         WHERE status = 'todo' AND remind_type = 'alert' AND due_notified = 0
           AND due_at IS NOT NULL AND due_at <= ?
         ORDER BY due_at ASC LIMIT ?`,
      )
      .all(nowMs, limit) as TaskRow[];
    return rows.map(toRecord);
  }

  /** 期日超過通知済みフラグを立てる（重複通知防止） */
  markDueNotified(id: number): void {
    this.db.prepare(`UPDATE tasks SET due_notified = 1 WHERE id = ?`).run(id);
  }

  close(): void {
    this.db.close();
  }
}
