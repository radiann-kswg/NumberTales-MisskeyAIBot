/**
 * メモリ内レートリミッター（Phase 1 用シンプル実装）
 *
 * - 同一ユーザーへの返信クールダウン（デフォルト 30 分）
 * - 全体の 1 時間あたり投稿上限（デフォルト 10 件）
 *
 * Note: 再起動でリセットされる。永続化は Phase 2 以降で SQLite に移行予定。
 */
export class RateLimiter {
  /** userId -> 最後に返信した UNIX タイムスタンプ(ms) */
  private readonly lastReply = new Map<string, number>();
  /** 直近 1 時間の投稿タイムスタンプ一覧 */
  private globalPostTimes: number[] = [];

  constructor(
    /** 同一ユーザーへの返信間隔 (ms) */
    private readonly cooldownMs: number,
    /** 全体の 1 時間あたり最大投稿数 */
    private readonly globalPerHour: number,
  ) {}

  /**
   * 指定ユーザーへの返信が可能かどうかを判定する
   */
  canReply(userId: string): boolean {
    const now = Date.now();

    // 1時間ウィンドウ外のエントリを掃除
    this.globalPostTimes = this.globalPostTimes.filter(
      (t) => now - t < 3_600_000,
    );

    // 全体の時間あたり上限チェック
    if (this.globalPostTimes.length >= this.globalPerHour) return false;

    // 同一ユーザーへのクールダウン
    const last = this.lastReply.get(userId);
    if (last !== undefined && now - last < this.cooldownMs) return false;

    return true;
  }

  /**
   * 返信を記録する（canReply() が true を返した後に呼ぶ）
   */
  recordReply(userId: string): void {
    const now = Date.now();
    this.lastReply.set(userId, now);
    this.globalPostTimes.push(now);
  }
}
