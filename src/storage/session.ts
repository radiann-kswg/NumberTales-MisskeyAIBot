/**
 * セッションコンテキスト一時ストレージ（SQLite）
 *
 * ユーザーごとの会話履歴を TTL 付きで保持する。
 * 個人情報は保存しない — userId を識別子として使用するのみ。
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type MessageRole = 'user' | 'assistant';

export interface SessionMessage {
  role: MessageRole;
  content: string;
}

/** 会話履歴の有効期間（デフォルト: 30分） */
const SESSION_TTL_MS = 30 * 60 * 1000;

/** 1ユーザーあたりの最大保持メッセージ数（user + assistant 各3往復） */
const MAX_HISTORY = 6;

export class SessionStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    // DB ファイル用ディレクトリがなければ作成
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_messages (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    TEXT    NOT NULL,
        role       TEXT    NOT NULL CHECK(role IN ('user', 'assistant')),
        content    TEXT    NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_user_created
        ON session_messages (user_id, created_at DESC);
    `);
  }

  /**
   * ユーザーの直近の会話履歴を取得する（TTL 内・最大 MAX_HISTORY 件）
   */
  getHistory(userId: string): SessionMessage[] {
    const cutoff = Date.now() - SESSION_TTL_MS;
    return this.db
      .prepare(
        `SELECT role, content
         FROM session_messages
         WHERE user_id = ? AND created_at > ?
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(userId, cutoff, MAX_HISTORY) as SessionMessage[];
  }

  /**
   * メッセージを会話履歴に追加する
   */
  addMessage(userId: string, role: MessageRole, content: string): void {
    this.db
      .prepare(
        `INSERT INTO session_messages (user_id, role, content, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(userId, role, content, Date.now());
  }

  /**
   * ユーザーの会話履歴を全削除する
   */
  clearHistory(userId: string): void {
    this.db
      .prepare(`DELETE FROM session_messages WHERE user_id = ?`)
      .run(userId);
  }

  /**
   * TTL 切れのメッセージを一括削除する（起動時・定期クリーン用）
   */
  pruneExpired(): void {
    const cutoff = Date.now() - SESSION_TTL_MS;
    this.db
      .prepare(`DELETE FROM session_messages WHERE created_at <= ?`)
      .run(cutoff);
  }

  close(): void {
    this.db.close();
  }
}
