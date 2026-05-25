// TL観測ハンドラ（スケルトン）
// Phase 2 で本実装（F-04: リアクション・エモパシー）

export interface TimelineNote {
  /** ノートのID */
  noteId: string;
  /** 投稿者のユーザーID */
  userId: string;
  /** ノート本文 */
  text: string;
}

/**
 * TLノート受信時の処理エントリポイント
 *
 * Phase 2 実装予定:
 *   1. 感情カテゴリ分類（喜 / 疲 / 悲 / 驚 / 創作中）（ルールベース）
 *   2. リアクション適切性の判定（明確な投稿のみ対象、不明確はスキップ）
 *   3. レートリミット確認（同一ユーザー1時間に1回）
 *   4. Misskey API でカスタム絵文字リアクション
 */
export async function handleTimelineNote(_note: TimelineNote): Promise<void> {
  // TODO: Phase 2 で実装
}
