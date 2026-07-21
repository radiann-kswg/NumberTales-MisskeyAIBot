# 実装マイルストーン — ナンバーテールズ Misskey AI Bot

このフォルダは、Botの実装・詳細設計のマイルストーン記録を管理するためのフォルダです。

## ファイル命名規則

```
YYYY-MM-DD_milestone_<フェーズ番号またはトピック>.md
```

## マイルストーン一覧（進行中・未着手）

完了したマイルストーンは [`completed/`](./completed/README.md) に棚卸し済みです。

| ファイル                                                                                                | フェーズ         | 概要                                                                                        | ステータス |
| --------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------- | ---------- |
| [2026-06-23_milestone_f10-angel-number-fortune.md](./2026-06-23_milestone_f10-angel-number-fortune.md)    | F-10             | 今日のエンジェルナンバー占い（実装仕様）                                                      | 着手 🔧    |
| [2026-07-04_milestone_auto-recovery.md](./2026-07-04_milestone_auto-recovery.md)                          | 運用            | Bot 自動復旧機能（3層ウォッチドッグ: PM2 / VM内 / GCE外部）                                  | レイヤー1・2本番稼働中・GCE外部はgcloud要（クライアント側作業） 🔧 |
| [2026-07-20_milestone_f06-stage-bc-name-numerology.md](./2026-07-20_milestone_f06-stage-bc-name-numerology.md) | F-06 Stage B/C | 名前ヌメロジー（枡本つづり式）・月命星・宿曜・姓名判断                                        | 着手待ち 📋 |
| [2026-07-20_milestone_f15-corefolder-form-enhancement.md](./2026-07-20_milestone_f15-corefolder-form-enhancement.md) | F-15           | コアフォルダ形態の機能強化（身体性コンテキスト・変形演出・スキンシップ・お供演出）             | Phase 1+2 実装済み 🔧 |
| [2026-07-20_milestone_downtime-recovery-notice.md](./2026-07-20_milestone_downtime-recovery-notice.md)    | 運用            | 復旧通知（ダウンタイム明けに 000(チトセ) が「寝てました」投稿）                               | 着手待ち 📋 |
| [2026-07-21_milestone_bug-roleplay-quality-task-ops.md](./2026-07-21_milestone_bug-roleplay-quality-task-ops.md) | バグ            | ロールプレイ品質の低下 / タスク登録・一覧の不具合 / タスク登録時のキャラ特有感の欠如（実機報告） | 対応済み ✅（②③修正・①緩和／実機検証待ち） |

## フェーズ概要

| フェーズ | 内容                                                                     |
| -------- | ------------------------------------------------------------------------ |
| Phase 0  | 技術スタック確定・開発環境セットアップ・リポジトリ構成設計               |
| Phase 1  | 基盤構築（WebSocket接続・定型返答・LLM応答・投稿制御）                   |
| Phase 2  | キャラクター演出（フォーム切替・絵文字・時間帯制御・マルチキャラクター） |
| Phase 3  | 創作支援・TL観測（壁打ちモード・TL観測レポート）                         |

## 機能進捗表

| 機能 ID                    | 機能名                                                    | 実装状況  | milestone / 参照                                                                                       |
| -------------------------- | --------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| F-01                       | ゆる会話（メンション応答）                                | 完了 ✅   | Phase 1 実装済み                                                                                       |
| F-02                       | 深夜雑談モード                                            | 完了 ✅   | Phase 2 実装済み                                                                                       |
| F-03                       | 創作支援（壁打ちモード）                                  | 完了 ✅   | Phase 3 実装済み                                                                                       |
| F-03 実装                  | ハッシュタグ監視 globalTimeline 対応                      | 完了 ✅   | [completed/2026-06-03_milestone_global-tl-tag-detection.md](./completed/2026-06-03_milestone_global-tl-tag-detection.md)   |
| F-04                       | リアクション・エモパシー                                  | 完了 ✅   | Phase 2 実装済み                                                                                       |
| F-04 改修                  | リアクション感情分類の LLM 駆動化（ハイブリッド方式）     | 完了 ✅   | [completed/2026-06-03_milestone_f04-llm-reaction.md](./completed/2026-06-03_milestone_f04-llm-reaction.md)                 |
| F-05                       | TL観測レポート                                            | 未着手 ⏳ | bot-spec 上は構想のみ                                                                                  |
| F-06 Stage A               | 数式計算・数秘術・ダイス・数字うんちく                    | 完了 ✅   | [completed/F-06_stage-a-spec.md](./completed/F-06_stage-a-spec.md)                                                         |
| マルチキャラクター Phase A | 個別切り替え・解除・管理者デフォルト変更・永続化          | 完了 ✅   | [completed/2026-05-26_milestone_phase2-multicharacter.md](./completed/2026-05-26_milestone_phase2-multicharacter.md)       |
| 返答 LLM 化                | 切替メッセージ・DB呈稱パース・挨拶LLM化・F-06フレーミング | 完了 ✅   | [completed/2026-05-27_milestone_llm-responses-followback.md](./completed/2026-05-27_milestone_llm-responses-followback.md) |
| フォローバック             | フォローされた際に自動フォローバック（5 分クールダウン）  | 完了 ✅   | [completed/2026-05-27_milestone_llm-responses-followback.md](./completed/2026-05-27_milestone_llm-responses-followback.md) |
| 前提機能 A                 | キャラプロンプト個性化（Hobby/SpecialSkill/NumerospecAbout 等） | 完了 ✅ | [completed/2026-06-16_milestone_character-specialization-and-numerology-consultation.md](./completed/2026-06-16_milestone_character-specialization-and-numerology-consultation.md) |
| 機能①（F-06 拡張）        | ヌメロジー相談モード（悩み＋ライフパス → LLM 解釈）       | 完了 ✅   | [completed/2026-06-16_milestone_character-specialization-and-numerology-consultation.md](./completed/2026-06-16_milestone_character-specialization-and-numerology-consultation.md) |
| 機能②（F-02 拡張）        | 自発投稿キャラローテーション（週次担当キャラで自発投稿）   | 完了 ✅   | [completed/2026-06-16_milestone_character-specialization-and-numerology-consultation.md](./completed/2026-06-16_milestone_character-specialization-and-numerology-consultation.md) |
| F-06 Stage B/C             | 名前ヌメロジー（枡本つづり式）・月命星・宿曜・姓名判断      | 着手待ち 📋 | [2026-07-20_milestone_f06-stage-bc-name-numerology.md](./2026-07-20_milestone_f06-stage-bc-name-numerology.md) |
| F-06 Stage D-1             | 数字スロット（Secvier 数字絵文字 0〜9 対応）               | 完了 ✅   | [completed/2026-06-23_milestone_f06-d1-slot-and-db-fallback.md](./completed/2026-06-23_milestone_f06-d1-slot-and-db-fallback.md) |
| F-06 Stage D-2a/2b/3       | ポーカー・ヨット・ヒット＆ブロウ                           | 完了 ✅   | [completed/2026-06-23_milestone_f06-d2-d3-games.md](./completed/2026-06-23_milestone_f06-d2-d3-games.md)                  |
| F-06 Stage D-2c            | 麻雀配牌チャレンジ                                         | 完了 ✅   | [completed/2026-06-29_milestone_f06-d3-2c-mahjong.md](./completed/2026-06-29_milestone_f06-d3-2c-mahjong.md)              |
| F-06 Stage D-5              | キャラ番号ルーレット                                       | 完了 ✅   | [future-plan/F-06_stage-d-minigames.md](../future-plan/F-06_stage-d-minigames.md#d3-5-キャラ番号ルーレット実装済み-2026-07-08) |
| F-06 Stage D-4a/D-4b        | 牌引き占い・手役クイズ                                     | 完了 ✅ | [completed/2026-07-09_milestone_f06-d3-4a-4b-tile-fortune-quiz.md](./completed/2026-07-09_milestone_f06-d3-4a-4b-tile-fortune-quiz.md)                      |
| F-06 Stage D3-6            | ミニゲーム絵文字活用強化（ヒット＆ブロウ/ヨット/ダイスロール） | 完了 ✅   | [completed/2026-07-03_milestone_f06-d3-6-emoji-ux.md](./completed/2026-07-03_milestone_f06-d3-6-emoji-ux.md) |
| F-06 Stage D3-7            | ゲーム終了後の継続コマンド対応（「もう一回」）              | 完了 ✅   | [completed/2026-07-03_milestone_f06-d3-7-repeat-command.md](./completed/2026-07-03_milestone_f06-d3-7-repeat-command.md) |
| DB参照改修                 | CreationsDB pkg/nodejs クライアントへの移行               | 完了 ✅   | [completed/2026-06-03_milestone_db-client-migration.md](./completed/2026-06-03_milestone_db-client-migration.md)           |
| DB参照改修②               | CreationsDB Cloudflare API HTTP フォールバック追加         | 完了 ✅   | [completed/2026-06-23_milestone_f06-d1-slot-and-db-fallback.md](./completed/2026-06-23_milestone_f06-d1-slot-and-db-fallback.md) |
| F-10                       | 今日のエンジェルナンバー占い                               | 着手 🔧   | [2026-06-23_milestone_f10-angel-number-fortune.md](./2026-06-23_milestone_f10-angel-number-fortune.md) |
| F-12 MVP                   | シンプルリマインダー（後日 F-12/F-12B 本実装により置き換え・削除済み） | 完了 ✅ | [completed/2026-07-03_milestone_f12-mvp-reminder.md](./completed/2026-07-03_milestone_f12-mvp-reminder.md) |
| F-12 / F-12B               | タスク＆スケジュール管理（優先度/難易度/進捗%）＋信頼度システム   | 完了 ✅   | [completed/2026-06-23_milestone_f12-reminder.md](./completed/2026-06-23_milestone_f12-reminder.md)     |
| 運用: 自動復旧             | 3層ウォッチドッグ（ハートビート・VM内監視・GCE外部復旧）          | 着手 🔧   | [2026-07-04_milestone_auto-recovery.md](./2026-07-04_milestone_auto-recovery.md)                       |
| F-15                       | コアフォルダ形態の機能強化（身体性コンテキスト・変形演出・スキンシップ・お供演出） | Phase 1+2 実装済み 🔧 | [2026-07-20_milestone_f15-corefolder-form-enhancement.md](./2026-07-20_milestone_f15-corefolder-form-enhancement.md) |
| 運用: 復旧通知             | ダウンタイム明けに 000(チトセ) が復旧通知を自発投稿（ハートビート流用・閾値30分）  | 着手待ち 📋 | [2026-07-20_milestone_downtime-recovery-notice.md](./2026-07-20_milestone_downtime-recovery-notice.md) |

## bot-spec 残タスク

| 区分               | 項目                                                         | 現状                                     |
| ------------------ | ------------------------------------------------------------ | ---------------------------------------- |
| F-04               | 明確判定の具体的スコアリング・閾値                           | 未定義。現状はルールベースで保守的に運用 |
| F-05               | TL観測レポート                                               | 未着手                                   |
| F-06               | NumerospecStats 連携（Stage B/C）                            | 未着手                                   |
| F-06               | AbilityStats / SpecialSkill に応じた演出差の本格実装         | 一部未着手                               |
| マルチキャラクター | 自然文トリガーの最終仕様と曖昧一致閾値                       | 継続調整                                 |
| マルチキャラクター | `ConversationPattern` 非保持個体で参照する追加フィールド範囲 | 継続調整                                 |
