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

進行中・未着手のマイルストーンは [`_ideas/milestone/README.md`](../README.md) を参照してください。
