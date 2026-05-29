/**
 * Bot 状態の永続ストレージ（SQLite）
 *
 * キーバリュー形式で Bot の状態を保持する。
 * セッション会話履歴とは独立した軽量テーブルを使用する。
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// ----------------------------------------------------------------
// Bot 状態キー定数
// ----------------------------------------------------------------

/** 週次担当キャラクターの番号を格納するキー */
export const STATE_KEY_SCHEDULER_CHAR = 'current_scheduler_char';
/** 集計待ちの Poll ノート ID を格納するキー */
export const STATE_KEY_POLL_NOTE_ID = 'current_poll_note_id';
/** 週次担当の候補キャラクター番号（JSON 配列文字列）を格納するキー */
export const STATE_KEY_POLL_CANDIDATES = 'current_poll_candidates';

// ----------------------------------------------------------------
// BotStateStore クラス
// ----------------------------------------------------------------

export class BotStateStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bot_state (
        key        TEXT    PRIMARY KEY,
        value      TEXT    NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  /**
   * 指定キーの値を取得する。存在しない場合は null を返す。
   */
  getState(key: string): string | null {
    const row = this.db
      .prepare<[string], { value: string }>('SELECT value FROM bot_state WHERE key = ?')
      .get(key);
    return row?.value ?? null;
  }

  /**
   * 指定キーに値をセット（存在すれば更新）する。
   */
  setState(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO bot_state (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, value, Date.now());
  }

  /**
   * 指定キーを削除する。
   */
  deleteState(key: string): void {
    this.db.prepare('DELETE FROM bot_state WHERE key = ?').run(key);
  }

  close(): void {
    this.db.close();
  }
}
