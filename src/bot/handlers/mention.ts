// メンション受信ハンドラ（スケルトン）
// Phase 1 で本実装（F-01: ゆる会話）

import type { AIProvider } from '../../ai/index.js';

export interface MentionEvent {
  /** メンションが付いたノートのID */
  noteId: string;
  /** 送信者のユーザーID */
  userId: string;
  /** メンションを除いたノート本文 */
  text: string;
  /** 返信先ノートID（リプライの場合） */
  replyId?: string;
}

export interface MentionHandlerDeps {
  ai: AIProvider;
}

/**
 * メンション受信時の処理エントリポイント
 *
 * Phase 1 実装予定:
 *   1. 意図分類（挨拶 / 雑談 / 創作相談 / コマンド）
 *   2. フォーム判定（ヒューマノイド形態 / コアフォルダ形態）
 *   3. アクティブキャラクターのプロンプト動的生成
 *   4. ルールベース or LLM で応答生成（100文字以内 / CW折りたたみ）
 *   5. レートリミット確認（同一ユーザー30分に1回）
 *   6. Misskey API で返信投稿
 */
export async function handleMention(
  _event: MentionEvent,
  _deps: MentionHandlerDeps,
): Promise<void> {
  // TODO: Phase 1 で実装
}
