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

    // 同一ユーザーへのクールダウン（0 の場合は無効）
    if (this.cooldownMs > 0) {
      const last = this.lastReply.get(userId);
      if (last !== undefined && now - last < this.cooldownMs) return false;
    }

    return true;
  }

  /**
   * 同一ユーザーへのクールダウンのみを見る（全体の時間あたり上限は見ない）。
   * ヒット＆ブロウ・ヨットなど、既にアクティブなゲームセッションの手番継続は
   * 新規の呼びかけではなく既に許可された1:1のやり取りの続きなので、
   * 他ユーザーへの応答枠を圧迫する全体上限のカウント対象からは外すために使う。
   */
  canReplyIgnoringGlobalCap(userId: string): boolean {
    if (this.cooldownMs > 0) {
      const now = Date.now();
      const last = this.lastReply.get(userId);
      if (last !== undefined && now - last < this.cooldownMs) return false;
    }
    return true;
  }

  /**
   * 返信を記録する（canReply() / canReplyIgnoringGlobalCap() が true を返した後に呼ぶ）。
   * countsTowardGlobalCap を false にすると、同一ユーザーへのクールダウン用の
   * タイムスタンプだけ更新し、全体の時間あたり上限のカウントには加算しない。
   */
  recordReply(userId: string, opts: { countsTowardGlobalCap?: boolean } = {}): void {
    const now = Date.now();
    this.lastReply.set(userId, now);
    if (opts.countsTowardGlobalCap ?? true) {
      this.globalPostTimes.push(now);
    }
  }
}
