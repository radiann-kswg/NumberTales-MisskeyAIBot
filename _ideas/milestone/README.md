# 実装マイルストーン — ナンバーテールズ Misskey AI Bot

このフォルダは、Botの実装・詳細設計のマイルストーン記録を管理するためのフォルダです。

## ファイル命名規則

```
YYYY-MM-DD_milestone_<フェーズ番号またはトピック>.md
```

## マイルストーン一覧

| ファイル                                                                                               | フェーズ | 概要                                         | ステータス |
| ------------------------------------------------------------------------------------------------------ | -------- | -------------------------------------------- | ---------- |
| [2026-05-25_milestone_phase0-kickoff.md](./2026-05-25_milestone_phase0-kickoff.md)                     | Phase 0  | キックオフ・技術スタック確定・環境準備       | 完了 ✅    |
| [2026-05-26_milestone_phase2-multicharacter.md](./2026-05-26_milestone_phase2-multicharacter.md)       | Phase 2  | マルチキャラクター切り替え・永続化・本番確認 | 完了 ✅    |
| [F-06_stage-a-spec.md](./F-06_stage-a-spec.md)                                                         | Phase 3  | F-06 Stage A（計算・占い・ダイス・うんちく） | 完了 ✅    |
| [2026-05-27_milestone_llm-responses-followback.md](./2026-05-27_milestone_llm-responses-followback.md) | 横断     | 返答 LLM 化・フォローバック機能追加          | 完了 ✅    |
| [2026-06-03_milestone_db-client-migration.md](./2026-06-03_milestone_db-client-migration.md)           | 改修     | DB参照を pkg/nodejs クライアントに移行       | 完了 ✅    |
| [2026-06-03_milestone_f04-llm-reaction.md](./2026-06-03_milestone_f04-llm-reaction.md)                 | F-04     | リアクション感情分類の LLM 駆動化            | 完了 ✅    |
| [2026-06-03_milestone_global-tl-tag-detection.md](./2026-06-03_milestone_global-tl-tag-detection.md)   | F-03実装 | ハッシュタグ監視 globalTimeline 対応         | 完了 ✅    |
| [2026-06-16_milestone_character-specialization-and-numerology-consultation.md](./2026-06-16_milestone_character-specialization-and-numerology-consultation.md) | Phase 3後続 | キャラプロンプト個性化（前提A）・ヌメロジー相談モード（機能①）・自発投稿ローテーション（機能②） | 完了 ✅ |
| [2026-06-23_milestone_f06-d1-slot-and-db-fallback.md](./2026-06-23_milestone_f06-d1-slot-and-db-fallback.md) | F-06D / 改修 | F-06 Stage D-1 数字スロット・CreationsDB HTTP フォールバック | 完了 ✅ |
| [2026-06-23_milestone_f10-angel-number-fortune.md](./2026-06-23_milestone_f10-angel-number-fortune.md) | F-10 | 今日のエンジェルナンバー占い（実装仕様） | 着手 🔧 |
| [2026-06-23_milestone_f12-reminder.md](./2026-06-23_milestone_f12-reminder.md) | F-12 | リマインダー機能（実装仕様） | 着手 🔧 |

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
| F-03 実装                  | ハッシュタグ監視 globalTimeline 対応                      | 完了 ✅   | [2026-06-03_milestone_global-tl-tag-detection.md](./2026-06-03_milestone_global-tl-tag-detection.md)   |
| F-04                       | リアクション・エモパシー                                  | 完了 ✅   | Phase 2 実装済み                                                                                       |
| F-04 改修                  | リアクション感情分類の LLM 駆動化（ハイブリッド方式）     | 完了 ✅   | [2026-06-03_milestone_f04-llm-reaction.md](./2026-06-03_milestone_f04-llm-reaction.md)                 |
| F-05                       | TL観測レポート                                            | 未着手 ⏳ | bot-spec 上は構想のみ                                                                                  |
| F-06 Stage A               | 数式計算・数秘術・ダイス・数字うんちく                    | 完了 ✅   | [F-06_stage-a-spec.md](./F-06_stage-a-spec.md)                                                         |
| マルチキャラクター Phase A | 個別切り替え・解除・管理者デフォルト変更・永続化          | 完了 ✅   | [2026-05-26_milestone_phase2-multicharacter.md](./2026-05-26_milestone_phase2-multicharacter.md)       |
| 返答 LLM 化                | 切替メッセージ・DB呈稱パース・挨拶LLM化・F-06フレーミング | 完了 ✅   | [2026-05-27_milestone_llm-responses-followback.md](./2026-05-27_milestone_llm-responses-followback.md) |
| フォローバック             | フォローされた際に自動フォローバック（5 分クールダウン）  | 完了 ✅   | [2026-05-27_milestone_llm-responses-followback.md](./2026-05-27_milestone_llm-responses-followback.md) |
| 前提機能 A                 | キャラプロンプト個性化（Hobby/SpecialSkill/NumerospecAbout 等） | 完了 ✅ | [2026-06-16_milestone_character-specialization-and-numerology-consultation.md](./2026-06-16_milestone_character-specialization-and-numerology-consultation.md) |
| 機能①（F-06 拡張）        | ヌメロジー相談モード（悩み＋ライフパス → LLM 解釈）       | 完了 ✅   | [2026-06-16_milestone_character-specialization-and-numerology-consultation.md](./2026-06-16_milestone_character-specialization-and-numerology-consultation.md) |
| 機能②（F-02 拡張）        | 自発投稿キャラローテーション（週次担当キャラで自発投稿）   | 完了 ✅   | [2026-06-16_milestone_character-specialization-and-numerology-consultation.md](./2026-06-16_milestone_character-specialization-and-numerology-consultation.md) |
| F-06 Stage B/C             | 名前ヌメロジー（デスティニー/ソウルナンバー）・月命星      | 未着手 ⏳ | [`future-plan/F-06_stage-b-c.md`](../future-plan/F-06_stage-b-c.md)                                   |
| F-06 Stage D-1             | 数字スロット（Secvier 数字絵文字 0〜9 対応）               | 完了 ✅   | [2026-06-23_milestone_f06-d1-slot-and-db-fallback.md](./2026-06-23_milestone_f06-d1-slot-and-db-fallback.md) |
| F-06 Stage D-2〜5          | ポーカー・ヨット・ヒット＆ブロウ・牌引き・ルーレット       | 未着手 ⏳ | [future-plan/F-06_stage-d-minigames.md](../future-plan/F-06_stage-d-minigames.md)                      |
| DB参照改修                 | CreationsDB pkg/nodejs クライアントへの移行               | 完了 ✅   | [2026-06-03_milestone_db-client-migration.md](./2026-06-03_milestone_db-client-migration.md)           |
| DB参照改修②               | CreationsDB Cloudflare API HTTP フォールバック追加         | 完了 ✅   | [2026-06-23_milestone_f06-d1-slot-and-db-fallback.md](./2026-06-23_milestone_f06-d1-slot-and-db-fallback.md) |
| F-10                       | 今日のエンジェルナンバー占い                               | 着手 🔧   | [2026-06-23_milestone_f10-angel-number-fortune.md](./2026-06-23_milestone_f10-angel-number-fortune.md) |
| F-12                       | リマインダー機能                                           | 着手 🔧   | [2026-06-23_milestone_f12-reminder.md](./2026-06-23_milestone_f12-reminder.md)                         |

## bot-spec 残タスク

| 区分               | 項目                                                         | 現状                                     |
| ------------------ | ------------------------------------------------------------ | ---------------------------------------- |
| F-04               | 明確判定の具体的スコアリング・閾値                           | 未定義。現状はルールベースで保守的に運用 |
| F-05               | TL観測レポート                                               | 未着手                                   |
| F-06               | NumerospecStats 連携（Stage B/C）                            | 未着手                                   |
| F-06               | AbilityStats / SpecialSkill に応じた演出差の本格実装         | 一部未着手                               |
| マルチキャラクター | 自然文トリガーの最終仕様と曖昧一致閾値                       | 継続調整                                 |
| マルチキャラクター | `ConversationPattern` 非保持個体で参照する追加フィールド範囲 | 継続調整                                 |
