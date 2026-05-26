import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * ユーザーごとのアクティブキャラクター状態を保持するストア。
 *
 * SQLite に永続化し、再起動後もユーザー別の担当キャラクターと
 * 全体デフォルト担当を復元する。
 */
export class ActiveCharacterStore {
  private readonly activeCharacters = new Map<string, string>();
  private readonly db: Database.Database;
  private defaultCharacterNum: string;

  constructor(dbPath: string, defaultCharacterNum: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.defaultCharacterNum = defaultCharacterNum;
    this.initialize();
    this.loadState();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS active_character_state (
        user_id       TEXT PRIMARY KEY,
        character_num TEXT NOT NULL,
        updated_at    INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bot_settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  private loadState(): void {
    const rows = this.db
      .prepare(`SELECT user_id, character_num FROM active_character_state`)
      .all() as Array<{ user_id: string; character_num: string }>;

    for (const row of rows) {
      this.activeCharacters.set(row.user_id, row.character_num);
    }

    const defaultRow = this.db
      .prepare(`SELECT value FROM bot_settings WHERE key = 'default_character_num'`)
      .get() as { value: string } | undefined;

    if (defaultRow?.value) {
      this.defaultCharacterNum = defaultRow.value;
    }
  }

  get(userId: string): string | null {
    return this.activeCharacters.get(userId) ?? null;
  }

  resolve(userId: string): string {
    return this.get(userId) ?? this.defaultCharacterNum;
  }

  set(userId: string, characterNum: string): void {
    this.activeCharacters.set(userId, characterNum);
    this.db
      .prepare(
        `INSERT INTO active_character_state (user_id, character_num, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           character_num = excluded.character_num,
           updated_at = excluded.updated_at`,
      )
      .run(userId, characterNum, Date.now());
  }

  getDefault(): string {
    return this.defaultCharacterNum;
  }

  setDefault(characterNum: string): void {
    this.defaultCharacterNum = characterNum;
    this.db
      .prepare(
        `INSERT INTO bot_settings (key, value, updated_at)
         VALUES ('default_character_num', ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`,
      )
      .run(characterNum, Date.now());
  }

  clear(userId: string): void {
    this.activeCharacters.delete(userId);
    this.db
      .prepare(`DELETE FROM active_character_state WHERE user_id = ?`)
      .run(userId);
  }

  close(): void {
    this.db.close();
  }
}
