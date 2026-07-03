# グローバルTL ナンバーテールズ関連タグ検出

> 作成日: 2026-06-03
> ステータス: **完了** ✅（2026-06-16 実装確認済み）
> 依存: [2026-06-03_milestone_f04-llm-reaction.md](./2026-06-03_milestone_f04-llm-reaction.md)（先行完了推奨）

---

## 概要

Misskey の `globalTimeline` チャンネルを購読し、ナンバーテールズ関連ハッシュタグを含む投稿を検出して
カスタム絵文字リアクションを送る機能。フォロー外ユーザーによる言及にも Bot が反応できるようにし、
創作コミュニティへの存在感を高める。

bot-spec の F-03「ハッシュタグ監視」の実体的な実装にあたる（`01_feature-specs.md` 参照）。

## 仕様

### 検出対象

- `globalTimeline` チャンネル経由で流れる全ノートのうち、以下の関連タグを含む投稿:
  - `#ナンバーテールズ` / `#ナンバーテールズの主人より`（`NT_RELATED_HASHTAGS` 定数で管理）
  - タグの追加・変更は定数のみ変えれば対応できる設計にする

### 除外条件

| 条件                     | 説明                                                                 |
| ------------------------ | -------------------------------------------------------------------- |
| Bot 自身の投稿           | `userId === botUserId` のノードはスキップ                            |
| リノート                 | `renoteId` ありかつ `text` が実質空（自動リノート系投稿）            |
| 禁止ワード含む           | `NT_BLOCKLIST` 定数の単語を含む投稿はスキップ                        |
| LLM 二次判定: disrespect | リスペクトのない投稿（中傷・無関係流用等）と判定されたものはスキップ |

### Bot のリアクション

1. D1 改修後の `classifyNoteEmotion()` を流用して感情カテゴリを判定
2. カテゴリに対応するカスタム絵文字リアクションを送信
3. 同一ユーザーへのリアクションは **最低 1 時間のクールダウン**（F-04 の `RateLimiter` を共用）

## タスク詳細

### M-D2-1: `globalTimeline` チャンネル購読の追加

- `misskey/client.ts` に `onGlobalTL(cb: (note: Note) => void): void` メソッドを追加
- 購読失敗時（インスタンスが `globalTimeline` を無効化している場合）は
  エラーをグレースフルに処理し、`warn` レベルでログを出してスキップする

### M-D2-2: 関連タグ・ブロックリスト定数の追加

- `src/config/constants.ts` に以下を追加:
  ```typescript
  NT_RELATED_HASHTAGS: ['ナンバーテールズ', 'NumberTales', '百花繚乱研究所'],
  NT_BLOCKLIST: ['...'] // 差別語・暴力表現等（実装時に定義）
  ```

### M-D2-3: グローバルTL ハンドラの新規実装

- 新規ファイル `src/bot/handlers/global-tl.ts` を作成
- `createGlobalTLHandler(deps)` クロージャー形式（`timeline.ts` / `mention.ts` の設計に準じる）
- 処理フロー:
  1. `NT_RELATED_HASHTAGS` のいずれかが `note.tags` または `note.text` に含まれるか確認
  2. 除外条件チェック（Bot自身・リノート・ブロックリスト）
  3. LLM 二次フィルタリング（respect / neutral / disrespect の 3 分類）
  4. `disrespect` → スキップ、それ以外 → `classifyNoteEmotion()` でカテゴリ判定 → リアクション送信

### M-D2-4: LLM 二次フィルタリングの実装

- 対象: ブロックリスト非該当の投稿
- LLM に投稿テキストを渡し、「ナンバーテールズへのリスペクトの有無」を 1 単語で返させる
  - 出力: `respect` / `neutral` / `disrespect`
- `disrespect` のみスキップし、`respect` / `neutral` はリアクション処理を続行する
- LLM 呼び出し失敗時は `neutral` として扱う（安全側に倒す）

### M-D2-5: `index.ts` への組み込み

- `startGlobalTLHandler()` を `main()` に追加
- 環境変数 `ENABLE_GLOBAL_TL` が `'true'` の場合のみ有効化する（デフォルト無効）
  - `.env.example` に `ENABLE_GLOBAL_TL=false` を追記する

### M-D2-6: 動作確認

- `#ナンバーテールズ` を含む通常投稿でリアクションが送られることを確認
- Bot 自身の投稿・リノート・ブロックリスト含む投稿でスキップされることを確認
- `ENABLE_GLOBAL_TL=false` のときに `globalTimeline` を購読しないことを確認

## 依存関係

- **D1 完了推奨**: `classifyNoteEmotion()` が LLM 化された後に着手すること
  （未完了の場合でも、旧 regex 版でひとまず実装してから D1 完了後に差し替えることは可）
- F-04 の `RateLimiter` を共用するため、`timeline.ts` の RateLimiter 実装を参照すること

## 注意事項

- **グローバルTLは大量ノートが流れる**: フィルタリングを先行させ LLM 呼び出しを最小化すること
  → ステップ 1〜3 で件数を絞り、LLM（ステップ 3・4）は確実に通過した投稿のみに使用する
- `globalTimeline` はインスタンス設定で無効化されている場合がある → グレースフルな購読失敗処理が必須
- 外部インスタンスのユーザーへのリアクションを含む可能性があるため、
  誤反応（disrespect 投稿への反応）が起きないよう LLM フィルタリングを丁寧に設計すること
