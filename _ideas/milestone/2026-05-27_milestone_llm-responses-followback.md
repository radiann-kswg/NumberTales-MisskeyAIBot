# 返答LLM化・フォローバック機能実装

> 作成日: 2026-05-27
> ステータス: **完了** ✅

---

## 概要

本セッションでは、キャラクター切り替えや挨拶などの定型的な返答をすべて LLM 生成に切り替え、
Bot の個性をより自然に表現できるよう改善した。
あわせて、フォローされた際に自動でフォローバックする機能を追加した。

---

## 完了項目

### 1. キャラクター切替メッセージの DB 値ベースパース ✅

- `_creations-db` の `FirstPersonCalling` / `SecondPersonCalling` フィールドを `parseCallingField()` でパース
- ハードコードされた「私」「君」を除去し、各個体の呼称をシステムプロンプトへ正確に反映
- `normalizeCalling()` で改行区切り1行目・`※` 以前・`[...]` 除外による主一人称の抽出
- 対象ファイル: `src/bot/character/prompt-builder.ts` / `src/bot/character/switch.ts`

### 2. 切替メッセージの LLM 化 ✅

- `generateSwitchReply()` を実装: 5 種類の切替シナリオ（初回登場・再登場・復帰・同一担当・解除後戻り）に応じた LLM 生成メッセージ
- エラー時はテンプレートフォールバックで安全に返答
- 対象ファイル: `src/bot/handlers/mention.ts`

### 3. 残り定型文の LLM 化 ✅

| 項目              | 変更内容                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 挨拶応答          | `generateGreetingReply()` を実装。JST 時間帯（朝/昼/夕方/深夜）をプロンプトに注入し、時間帯に合った挨拶を生成。失敗時は `pickGreetingResponse()` にフォールバック |
| F-06 フレーミング | `generateF06Framing()` を実装。計算・占い・ダイス結果の前置き一言（30 文字以内）を LLM 生成。失敗時はスキップして結果のみ返す                                     |
| ヘルプ応答        | 切り替え担当に関わらず常に 000(チトセ) 固定で返答するよう修正                                                                                                     |

### 4. フォローバック機能 ✅

- `src/bot/handlers/follow.ts` を新規作成
  - `createFollowBackHandler(deps)` ファクトリ関数
  - 自己フォロー除外（`user.id === myUserId` でスキップ）
  - 同一ユーザーへの重複フォローバックを 5 分クールダウンで防止（インメモリ `Map`）
  - `misskeyClient.follow(userId)` で `following/create` API を呼び出し
  - エラー時は `logger.warn` を記録して継続

- `src/misskey/client.ts` を更新
  - `mainCh` フィールドをコンストラクタで初期化（`useChannel('main')` の重複呼び出しを防止）
  - `onFollowed(callback)` メソッドを追加（`main` チャンネルの `followed` イベントを購読）
  - `follow(userId)` メソッドを追加

- `src/index.ts` を更新
  - `createFollowBackHandler` のインポートと配線を追加

---

## 関連コミット

| コミット  | 内容                                                 |
| --------- | ---------------------------------------------------- |
| `bd5dd9f` | feat: DB 値ベース呼称パース + 切替メッセージ LLM 化  |
| `8615c56` | feat: 挨拶/F-06/ヘルプの LLM 化・ヘルプ 000 固定     |
| `8ee9151` | feat(follow): add auto follow-back on followed event |

---

## 関連ファイル

| ファイル                              | 内容                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/bot/character/prompt-builder.ts` | `parseCallingField` / `formatCallingLines` 追加                                          |
| `src/bot/character/switch.ts`         | `normalizeCalling` 修正・`buildCharacterSwitchText` 修正                                 |
| `src/bot/handlers/mention.ts`         | `generateSwitchReply` / `generateGreetingReply` / `generateF06Framing` / ヘルプ 000 固定 |
| `src/bot/handlers/follow.ts`          | フォローバックハンドラ（新規）                                                           |
| `src/misskey/client.ts`               | `mainCh` フィールド・`onFollowed` / `follow` 追加                                        |
| `src/index.ts`                        | フォローバックハンドラの配線追加                                                         |
