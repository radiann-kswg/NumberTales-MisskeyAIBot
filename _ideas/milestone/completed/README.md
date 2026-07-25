# 完了マイルストーン一覧 — ナンバーテールズ Misskey AI Bot

このフォルダは、[`_ideas/milestone/`](../README.md) 配下のマイルストーンのうち
**実装が完了したもの**を棚卸し・格納するためのフォルダです。

各ファイルの詳細な完了根拠（typecheck・実装確認日等）は、ファイル冒頭の
`> ステータス: 完了 ✅` 行を参照してください。

## 一覧

| ファイル                                                                                                                        | フェーズ         | 概要                                                     |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------- |
| [2026-05-25_milestone_phase0-kickoff.md](./2026-05-25_milestone_phase0-kickoff.md)                                               | Phase 0           | キックオフ・技術スタック確定・環境準備                     |
| [2026-05-26_milestone_phase2-multicharacter.md](./2026-05-26_milestone_phase2-multicharacter.md)                                 | Phase 2           | マルチキャラクター切り替え・永続化・本番確認               |
| [2026-05-27_milestone_phase3-prerequisites-harassment.md](./2026-05-27_milestone_phase3-prerequisites-harassment.md)             | Phase 3 前提       | 前提機能A/B（キャラ個性化・週次担当）・ハラスメント仲介(F-07) |
| [2026-05-27_milestone_llm-responses-followback.md](./2026-05-27_milestone_llm-responses-followback.md)                           | 横断              | 返答 LLM 化・フォローバック機能追加                        |
| [F-06_stage-a-spec.md](./F-06_stage-a-spec.md)                                                                                    | Phase 3           | F-06 Stage A（計算・占い・ダイス・うんちく）               |
| [2026-06-03_milestone_db-client-migration.md](./2026-06-03_milestone_db-client-migration.md)                                     | 改修              | DB参照を pkg/nodejs クライアントに移行                     |
| [2026-06-03_milestone_f04-llm-reaction.md](./2026-06-03_milestone_f04-llm-reaction.md)                                           | F-04              | リアクション感情分類の LLM 駆動化                          |
| [2026-06-03_milestone_global-tl-tag-detection.md](./2026-06-03_milestone_global-tl-tag-detection.md)                             | F-03実装          | ハッシュタグ監視 globalTimeline 対応                       |
| [2026-06-16_milestone_character-specialization-and-numerology-consultation.md](./2026-06-16_milestone_character-specialization-and-numerology-consultation.md) | Phase 3後続       | キャラプロンプト個性化・ヌメロジー相談モード・自発投稿ローテーション |
| [2026-06-23_milestone_f06-d1-slot-and-db-fallback.md](./2026-06-23_milestone_f06-d1-slot-and-db-fallback.md)                     | F-06D / 改修      | F-06 Stage D-1 数字スロット・CreationsDB HTTP フォールバック |
| [2026-06-23_milestone_f06-d2-d3-games.md](./2026-06-23_milestone_f06-d2-d3-games.md)                                             | F-06 Stage D-2/D-3 | ポーカー・ヨット・ヒット＆ブロウ                            |
| [2026-06-29_milestone_f06-d3-2c-mahjong.md](./2026-06-29_milestone_f06-d3-2c-mahjong.md)                                         | F-06 Stage D3-2c   | 麻雀配牌チャレンジ                                          |
| [2026-07-03_milestone_f06-d3-6-emoji-ux.md](./2026-07-03_milestone_f06-d3-6-emoji-ux.md)                                         | F-06 Stage D3-6    | ミニゲーム Secvier 絵文字活用強化（ヒット＆ブロウ・ヨット・汎用ダイスロール） |
| [2026-07-03_milestone_f06-d3-7-repeat-command.md](./2026-07-03_milestone_f06-d3-7-repeat-command.md)                             | F-06 Stage D3-7    | ゲーム終了後の継続コマンド対応「もう一回」                  |
| [2026-07-09_milestone_f06-d3-4a-4b-tile-fortune-quiz.md](./2026-07-09_milestone_f06-d3-4a-4b-tile-fortune-quiz.md)               | F-06 Stage D3-4a/D3-4b | 牌引き占い・手役クイズ                                  |
| [2026-07-03_milestone_f12-mvp-reminder.md](./2026-07-03_milestone_f12-mvp-reminder.md)                                           | F-12 MVP           | シンプルリマインダー機能（後日 F-12/F-12B 本実装により置き換え・削除済み） |
| [2026-06-23_milestone_f12-reminder.md](./2026-06-23_milestone_f12-reminder.md)                                                   | F-12 / F-12B        | タスク＆スケジュール管理（優先度/難易度/進捗%）＋信頼度システム（F-12 MVP を置き換え） |
| [2026-07-05_milestone_bug-task-add-roleplay.md](./2026-07-05_milestone_bug-task-add-roleplay.md)                                 | F-12・F-12B / ロールプレイ | バグ報告: タスク追加の失敗／タスク追加時のロールプレイ劣化（対応済み・実機ログ突き合わせ未実施） |
| [2026-07-04_milestone_operational-feedback-hitblow-task-dialogue.md](./2026-07-04_milestone_operational-feedback-hitblow-task-dialogue.md) | F-06 D3 / F-12・F-12B / 会話 | 実運用フィードバック改修（ヒット＆ブロウ／タスク管理／会話パターン。難易度確認ワークフロー・メンション直列化を含め全対応済み） |
| [2026-07-04_milestone_auto-recovery.md](./2026-07-04_milestone_auto-recovery.md)                                                 | 運用               | Bot 自動復旧機能（3層ウォッチドッグ: PM2 / VM内 / GCE外部）。レイヤー1〜3 すべて本番稼働中 |
| [2026-07-20_milestone_downtime-recovery-notice.md](./2026-07-20_milestone_downtime-recovery-notice.md)                           | 運用               | 復旧通知（ダウンタイム明けに 000(チトセ) が停止時間を添えて自発投稿）           |
| [2026-07-21_milestone_bug-roleplay-quality-task-ops.md](./2026-07-21_milestone_bug-roleplay-quality-task-ops.md)                 | バグ / F-12・F-12B  | ロールプレイ品質の低下・タスク登録/一覧の不具合・タスク登録時のキャラ特有感の欠如（実機報告） |

進行中・未着手のマイルストーンは [`_ideas/milestone/README.md`](../README.md) を参照してください。
