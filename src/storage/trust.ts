/**
 * 信頼度システム 永続ストレージ（SQLite・F-12B Phase B 基礎）
 *
 * タスク完了・日々の会話を通じてユーザーごとの信頼度ポイントを蓄積し、
 * `buildCharacterSystemPrompt()` へ渡す `TrustContext`（レベル・ラベル）を算出する。
 * 時間減衰は今回のスコープに含めない。
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TaskPriority, TaskDifficulty } from './task.js';

export interface TrustContext {
  level: 0 | 1 | 2 | 3 | 4;
  label: string;
}

const LEVEL_LABELS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: '初対面',
  1: '顔見知り',
  2: '信頼',
  3: '盟友',
  4: '主従の契り',
};

/** タスク完了時の難易度ポイント */
const DIFFICULTY_POINTS: Record<TaskDifficulty, number> = { 1: 5, 2: 10, 3: 15 };
/** タスク完了時の優先度ボーナス */
const PRIORITY_BONUS: Record<TaskPriority, number> = { 1: 5, 2: 2, 3: 0 };
/** schedule タスクの自動完了通知時のポイント */
const SCHEDULE_NOTIFICATION_POINTS = 2;
/** 1日1回の会話ボーナス */
const DAILY_CHAT_BONUS_POINTS = 3;

interface TrustRow {
  user_id: string;
  trust_points: number;
  tasks_completed: number;
  chat_days: number;
  last_chat_date: string | null;
  last_updated: number;
}

export class TrustStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_trust (
        user_id         TEXT PRIMARY KEY,
        trust_points    INTEGER NOT NULL DEFAULT 0,
        tasks_completed INTEGER NOT NULL DEFAULT 0,
        chat_days       INTEGER NOT NULL DEFAULT 0,
        last_chat_date  TEXT,
        last_updated    INTEGER NOT NULL
      );
    `);
  }

  private getRow(userId: string): TrustRow | undefined {
    return this.db
      .prepare(`SELECT * FROM user_trust WHERE user_id = ?`)
      .get(userId) as TrustRow | undefined;
  }

  private ensureRow(userId: string): TrustRow {
    const existing = this.getRow(userId);
    if (existing) return existing;
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO user_trust (user_id, trust_points, tasks_completed, chat_days, last_chat_date, last_updated)
         VALUES (?, 0, 0, 0, NULL, ?)`,
      )
      .run(userId, now);
    return this.getRow(userId)!;
  }

  /** 現在の信頼度ポイントを返す（未登録なら0） */
  getPoints(userId: string): number {
    return this.getRow(userId)?.trust_points ?? 0;
  }

  /** ポイント数からレベル・ラベルを算出する（0/50/150/300/500 の閾値） */
  getLevel(points: number): TrustContext {
    const level: 0 | 1 | 2 | 3 | 4 =
      points >= 500 ? 4 : points >= 300 ? 3 : points >= 150 ? 2 : points >= 50 ? 1 : 0;
    return { level, label: LEVEL_LABELS[level] };
  }

  private addPoints(userId: string, points: number): void {
    this.ensureRow(userId);
    this.db
      .prepare(
        `UPDATE user_trust SET trust_points = trust_points + ?, last_updated = ? WHERE user_id = ?`,
      )
      .run(points, Date.now(), userId);
  }

  /** タスク完了時のポイントを加算する（難易度点＋優先度ボーナス） */
  recordTaskCompletion(userId: string, priority: TaskPriority, difficulty: TaskDifficulty): void {
    this.ensureRow(userId);
    const points = DIFFICULTY_POINTS[difficulty] + PRIORITY_BONUS[priority];
    this.db
      .prepare(
        `UPDATE user_trust
         SET trust_points = trust_points + ?, tasks_completed = tasks_completed + 1, last_updated = ?
         WHERE user_id = ?`,
      )
      .run(points, Date.now(), userId);
  }

  /** schedule タスクの自動完了通知時のポイントを加算する */
  recordScheduleNotification(userId: string): void {
    this.addPoints(userId, SCHEDULE_NOTIFICATION_POINTS);
  }

  /**
   * 1日1回の会話ボーナスを加算する。当日すでに加算済みなら何もしない。
   * @param todayJstDateStr 'YYYY-MM-DD'（JST）
   * @returns ボーナスを加算したかどうか
   */
  maybeAddDailyChatBonus(userId: string, todayJstDateStr: string): boolean {
    const row = this.ensureRow(userId);
    if (row.last_chat_date === todayJstDateStr) return false;
    this.db
      .prepare(
        `UPDATE user_trust
         SET trust_points = trust_points + ?, chat_days = chat_days + 1,
             last_chat_date = ?, last_updated = ?
         WHERE user_id = ?`,
      )
      .run(DAILY_CHAT_BONUS_POINTS, todayJstDateStr, Date.now(), userId);
    return true;
  }

  close(): void {
    this.db.close();
  }
}
