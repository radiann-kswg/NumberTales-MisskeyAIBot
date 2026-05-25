// スケジューラー（自発投稿制御・時間帯ピーク管理）（スケルトン）
// Phase 2 で本実装（F-02: 深夜雑談モード）

/** 時間帯スロット（F-02 仕様に対応） */
export type TimeSlot = 'morning' | 'afternoon' | 'night' | 'latenight';

/**
 * 現在時刻から時間帯スロットを判定する
 *
 * | スロット  | 時間帯      | 浮上頻度 | トーン                 |
 * |-----------|-------------|----------|------------------------|
 * | morning   | 06:00-11:59 | 通常     | 元気・テキパキ         |
 * | afternoon | 12:00-17:59 | 低め     | 事務的・落ち着き       |
 * | night     | 18:00-22:59 | 通常     | 元気・テキパキ         |
 * | latenight | 23:00-05:59 | 控えめ   | ほっこり・哲学的・眠そう |
 */
export function getCurrentTimeSlot(): TimeSlot {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'night';
  return 'latenight';
}

/**
 * 時間帯スロットに応じた自発投稿インターバル（ミリ秒）を返す
 *
 * 仕様（F-02 / 00_overview.md）:
 *   - ピークタイム（朝・夜）: 1〜2時間に1回 → 中間値 1.5時間
 *   - オフタイム（昼・深夜）: 3〜4時間に1回 → 中間値 3.5時間
 */
export function getPostIntervalMs(slot: TimeSlot): number {
  switch (slot) {
    case 'morning':
    case 'night':
      return 90 * 60 * 1000; // 1.5時間
    case 'afternoon':
    case 'latenight':
      return 210 * 60 * 1000; // 3.5時間
  }
}

/**
 * 自発投稿スケジューラーの起動
 *
 * Phase 2 実装予定:
 *   1. 時間帯スロットに応じたインターバルで定期実行
 *   2. アクティブキャラクターのプロンプトで投稿文生成
 *   3. 公開範囲: visibility=home（仕様 F-02）
 *   4. 投稿後に次のスロットを再判定してインターバルを更新
 */
export function startScheduler(): void {
  // TODO: Phase 2 で実装
}
