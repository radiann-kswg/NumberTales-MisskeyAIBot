/**
 * キャラ別親密度（アフィニティ）永続ストレージ（SQLite・F-14 Phase 1 基盤）
 *
 * ユーザーとキャラクター(番号)の組ごとに親密度ポイントを蓄積する。F-12B の信頼度
 * （ユーザー単位のグローバル値・trust.ts）とは別テーブルで、移行不要・低リスク。
 * F-15 Phase 3 のお供演出・スキンシップ反応、および将来の F-14 固有コマンドのティア解放が参照する。
 *
 * ※ 今回は「ストア基盤＋加算フック＋照会」までが対象。能力レジストリ本体（78タロット等）は後続。
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** アフィニティレベル（0=未接触, 1-3=段階）。お供演出は Lv.2 以上を対象にする */
export type AffinityLevel = 0 | 1 | 2 | 3;

/**
 * レベル閾値（暫定値・実運用で調整）。points がその min 以上で該当レベル。
 * 降順に並べ、先頭から最初に満たすレベルを採用する。
 */
const LEVEL_THRESHOLDS: readonly { level: AffinityLevel; min: number }[] = [
  { level: 3, min: 30 },
  { level: 2, min: 10 },
  { level: 1, min: 1 },
  { level: 0, min: 0 },
];

/** ポイント数からアフィニティレベルを算出する */
export function affinityLevel(points: number): AffinityLevel {
  for (const t of LEVEL_THRESHOLDS) {
    if (points >= t.min) return t.level;
  }
  return 0;
}

export interface AffinityEntry {
  charNum: string;
  points: number;
  level: AffinityLevel;
}

interface AffinityRow {
  user_id: string;
  char_num: string;
  points: number;
  points_today: number;
  today_date: string | null;
  updated_at: number;
}

export class CharacterAffinityStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS character_affinity (
        user_id      TEXT NOT NULL,
        char_num     TEXT NOT NULL,
        points       INTEGER NOT NULL DEFAULT 0,
        points_today INTEGER NOT NULL DEFAULT 0,
        today_date   TEXT,
        updated_at   INTEGER NOT NULL,
        PRIMARY KEY (user_id, char_num)
      );
      CREATE INDEX IF NOT EXISTS idx_affinity_user ON character_affinity (user_id, points DESC);
    `);
  }

  private getRow(userId: string, charNum: string): AffinityRow | undefined {
    return this.db
      .prepare(`SELECT * FROM character_affinity WHERE user_id = ? AND char_num = ?`)
      .get(userId, charNum) as AffinityRow | undefined;
  }

  /** 現在の親密度ポイントを返す（未登録なら0） */
  getPoints(userId: string, charNum: string): number {
    return this.getRow(userId, charNum)?.points ?? 0;
  }

  /** 親密度レベルを返す */
  getLevel(userId: string, charNum: string): AffinityLevel {
    return affinityLevel(this.getPoints(userId, charNum));
  }

  /**
   * 親密度ポイントを加算する（スパム防止の日次上限つき）。
   * @param delta 加算量（0以下は無視）
   * @param opts.dailyCap 当日(JST)にこのキャラへ加算できる上限。超過分は加算しない
   * @param opts.todayJstDateStr 'YYYY-MM-DD'（JST）。省略時は日次上限を適用しない
   * @returns 実際に加算されたポイント数
   */
  addPoints(
    userId: string,
    charNum: string,
    delta: number,
    opts?: { dailyCap?: number; todayJstDateStr?: string },
  ): number {
    if (delta <= 0) return 0;

    const row = this.getRow(userId, charNum);
    const today = opts?.todayJstDateStr ?? null;
    const cap = opts?.dailyCap;

    // 当日加算量（日付が変わっていれば0にリセット）
    const pointsTodayBase =
      row && today !== null && row.today_date === today ? row.points_today : 0;

    let actual = delta;
    if (cap !== undefined && today !== null) {
      const remaining = Math.max(0, cap - pointsTodayBase);
      actual = Math.min(delta, remaining);
    }
    if (actual <= 0) return 0;

    const now = Date.now();
    const newPoints = (row?.points ?? 0) + actual;
    const newPointsToday = today !== null ? pointsTodayBase + actual : row?.points_today ?? 0;
    const newTodayDate = today ?? row?.today_date ?? null;

    this.db
      .prepare(
        `INSERT INTO character_affinity (user_id, char_num, points, points_today, today_date, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, char_num) DO UPDATE SET
           points = excluded.points,
           points_today = excluded.points_today,
           today_date = excluded.today_date,
           updated_at = excluded.updated_at`,
      )
      .run(userId, charNum, newPoints, newPointsToday, newTodayDate, now);
    return actual;
  }

  /**
   * 最高親密度のキャラを返す（お供演出用）。excludeNum を除外できる（アクティブキャラ本人など）。
   * points 同点なら updated_at が新しい方。0点しか無ければ null。
   */
  getTopAffinity(userId: string, excludeNum?: string): AffinityEntry | null {
    const row = (
      excludeNum !== undefined
        ? this.db
            .prepare(
              `SELECT * FROM character_affinity
               WHERE user_id = ? AND points > 0 AND char_num != ?
               ORDER BY points DESC, updated_at DESC LIMIT 1`,
            )
            .get(userId, excludeNum)
        : this.db
            .prepare(
              `SELECT * FROM character_affinity
               WHERE user_id = ? AND points > 0
               ORDER BY points DESC, updated_at DESC LIMIT 1`,
            )
            .get(userId)
    ) as AffinityRow | undefined;
    if (!row) return null;
    return { charNum: row.char_num, points: row.points, level: affinityLevel(row.points) };
  }

  /** ユーザーの親密度一覧を points 降順で返す（照会コマンド用。0点は除外） */
  listByAffinity(userId: string): AffinityEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM character_affinity WHERE user_id = ? AND points > 0
         ORDER BY points DESC, updated_at DESC`,
      )
      .all(userId) as AffinityRow[];
    return rows.map((r) => ({ charNum: r.char_num, points: r.points, level: affinityLevel(r.points) }));
  }

  close(): void {
    this.db.close();
  }
}
