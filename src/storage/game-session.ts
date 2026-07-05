/**
 * ゲームセッション一時ストレージ（SQLite）
 *
 * ターン制ミニゲーム（ヨット・ヒット＆ブロウ・ポーカー・麻雀配牌チャレンジ）の状態を TTL 付きで保持する。
 * 個人情報は保存しない — userId を識別子として使用するのみ。
 * 同一ユーザーのゲームセッションは 1 つまで（並行ゲーム禁止）。
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type GameType = 'yacht' | 'hitblow' | 'hitblow-pending' | 'poker' | 'mahjong';

/** 「もう一回」継続コマンド（D3-7）の対象となる5ゲーム */
export type RecentGameType = 'yacht' | 'hitblow' | 'slot' | 'poker' | 'mahjong';

/** ゲームセッションの有効期間（60分） */
const GAME_SESSION_TTL_MS = 60 * 60 * 1000;

/** 直近プレイしたゲームを「もう一回」の対象とみなす時間窓（10分） */
const RECENT_GAME_TTL_MS = 10 * 60 * 1000;

/** 継続コマンド自体のレート制限: 時間窓（10分） */
const REPEAT_WINDOW_MS = 10 * 60 * 1000;

/** 継続コマンド自体のレート制限: 時間窓内の最大許可回数（3回） */
const REPEAT_MAX_COUNT = 3;

export class GameSessionStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_sessions (
        user_id    TEXT NOT NULL,
        game_type  TEXT NOT NULL,
        state      TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, game_type)
      );
      CREATE INDEX IF NOT EXISTS idx_game_sessions_updated
        ON game_sessions (updated_at);

      CREATE TABLE IF NOT EXISTS recent_games (
        user_id    TEXT PRIMARY KEY,
        game_type  TEXT NOT NULL,
        played_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS game_repeat_log (
        user_id      TEXT NOT NULL,
        triggered_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_game_repeat_log_user
        ON game_repeat_log (user_id, triggered_at);
    `);
  }

  /**
   * アクティブなゲームセッションを取得する（TTL 切れは null として扱う）。
   */
  getSession<T>(userId: string, gameType: GameType): T | null {
    const cutoff = Date.now() - GAME_SESSION_TTL_MS;
    const row = this.db
      .prepare(
        `SELECT state FROM game_sessions
         WHERE user_id = ? AND game_type = ? AND updated_at > ?`,
      )
      .get(userId, gameType, cutoff) as { state: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.state) as T;
    } catch {
      return null;
    }
  }

  /**
   * ユーザーにいずれかのアクティブなゲームセッションがあれば、そのゲームタイプを返す。
   */
  getAnyActiveSession(userId: string): GameType | null {
    const cutoff = Date.now() - GAME_SESSION_TTL_MS;
    const row = this.db
      .prepare(
        `SELECT game_type FROM game_sessions
         WHERE user_id = ? AND updated_at > ?
         LIMIT 1`,
      )
      .get(userId, cutoff) as { game_type: string } | undefined;
    if (!row) return null;
    return row.game_type as GameType;
  }

  /**
   * ゲームセッションを保存（upsert）する。
   */
  setSession(userId: string, gameType: GameType, state: unknown): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO game_sessions (user_id, game_type, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, game_type) DO UPDATE SET
           state = excluded.state,
           updated_at = excluded.updated_at`,
      )
      .run(userId, gameType, JSON.stringify(state), now, now);
  }

  /**
   * ゲームセッションを削除する（ゲーム終了時）。
   */
  deleteSession(userId: string, gameType: GameType): void {
    this.db
      .prepare(`DELETE FROM game_sessions WHERE user_id = ? AND game_type = ?`)
      .run(userId, gameType);
  }

  /**
   * ユーザーの全ゲームセッションを削除する。
   */
  deleteAllSessions(userId: string): void {
    this.db
      .prepare(`DELETE FROM game_sessions WHERE user_id = ?`)
      .run(userId);
  }

  /**
   * TTL 切れのセッションを一括削除する（起動時・定期クリーン用）。
   */
  pruneExpired(): void {
    const cutoff = Date.now() - GAME_SESSION_TTL_MS;
    this.db
      .prepare(`DELETE FROM game_sessions WHERE updated_at <= ?`)
      .run(cutoff);

    const recentCutoff = Date.now() - RECENT_GAME_TTL_MS;
    this.db
      .prepare(`DELETE FROM recent_games WHERE played_at <= ?`)
      .run(recentCutoff);

    const repeatCutoff = Date.now() - REPEAT_WINDOW_MS;
    this.db
      .prepare(`DELETE FROM game_repeat_log WHERE triggered_at <= ?`)
      .run(repeatCutoff);
  }

  /**
   * 5ゲームいずれかの開始時に「直近プレイしたゲーム」を上書き記録する（D3-7）。
   */
  recordPlayed(userId: string, gameType: RecentGameType): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO recent_games (user_id, game_type, played_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           game_type = excluded.game_type,
           played_at = excluded.played_at`,
      )
      .run(userId, gameType, now);
  }

  /**
   * 「もう一回」の対象ゲームを返す。直近プレイが時間窓（10分）を過ぎていれば null。
   */
  getRepeatTarget(userId: string): RecentGameType | null {
    const cutoff = Date.now() - RECENT_GAME_TTL_MS;
    const row = this.db
      .prepare(
        `SELECT game_type FROM recent_games WHERE user_id = ? AND played_at > ?`,
      )
      .get(userId, cutoff) as { game_type: string } | undefined;
    return row ? (row.game_type as RecentGameType) : null;
  }

  /**
   * 継続コマンド自体のレート制限判定（10分間に3回まで）。
   */
  canRepeat(userId: string): boolean {
    const cutoff = Date.now() - REPEAT_WINDOW_MS;
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM game_repeat_log WHERE user_id = ? AND triggered_at > ?`,
      )
      .get(userId, cutoff) as { count: number };
    return row.count < REPEAT_MAX_COUNT;
  }

  /**
   * 継続コマンドの発火を記録する（`canRepeat()` が true を返した後に呼ぶ）。
   */
  recordRepeatTrigger(userId: string): void {
    this.db
      .prepare(`INSERT INTO game_repeat_log (user_id, triggered_at) VALUES (?, ?)`)
      .run(userId, Date.now());
  }

  close(): void {
    this.db.close();
  }
}
