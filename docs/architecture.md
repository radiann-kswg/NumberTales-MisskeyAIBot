# 技術アーキテクチャ — NumberTales Misskey AI Bot

> 最終更新: 2026-05-26
> 実装状況を反映したライブドキュメント（仕様案は [`_ideas/bot-spec/03_tech-architecture.md`](../_ideas/bot-spec/03_tech-architecture.md) を参照）

---

## システム構成図

```
Misskey インスタンス (radiann6631.net)
  │
  │  WebSocket Streaming
  ▼
[ Bot サーバー: GCP VM / PM2 ]
  │
  ├─ main チャンネル ──────────────────── mention イベント
  │    └─ handlers/mention.ts
  │         ├─ キャラクター状態解決 (bot/character/store.ts)
  │         │    ├─ ユーザー別アクティブ担当
  │         │    └─ 全体デフォルト担当
  │         ├─ 意図分類 (classifier/intent.ts)
  │         │    greeting / form-switch / creative-consultation / chat
  │         │    calculate / numerology / dice / trivia  (F-06)
  │         ├─ 切り替え系コマンド (bot/character/switch.ts)
  │         │    ├─ 個別担当切り替え
  │         │    ├─ 個別担当解除
  │         │    ├─ 管理者デフォルト変更
  │         │    └─ ヘルプ応答
  │         ├─ F-06 早期 return (features/f06/)
  │         │    ├─ calculate  → safeEvaluate (mathjs)
  │         │    ├─ numerology → ライフパス / 九星気学
  │         │    ├─ dice       → Math.random() ダイス・乱数
  │         │    └─ trivia     → LLM 委譲 (maxTokens 120)
  │         ├─ 応答生成 (F-06 以外)
  │         │    ├─ 定型返答テンプレート (responder/templates/)
  │         │    └─ LLM 呼び出し (ai/ 経由)
  │         ├─ 返信投稿 (misskeyClient.reply)
  │         └─ リアクション付与 (misskeyClient.react) ← F-04
  │
  ├─ homeTimeline チャンネル ────────── note イベント
  │    └─ handlers/timeline.ts
  │         ├─ フィルタリング (reactor/classify.ts)
  │         ├─ 感情分類 (reactor/classify.ts)
  │         └─ リアクション送信 (misskeyClient.react)
  │
  ├─ PostScheduler (bot/scheduler/) ── setInterval 10分
  │    └─ 時間帯判定 (JST) → LLM 生成 → misskeyClient.post
  │
  ├─ RateLimiter (bot/ratelimit/) ── メモリ内 Map
  │    ├─ 返信クールダウン (ユーザー別)
  │    └─ 全体投稿上限 (1時間ウィンドウ)
  │
  ├─ SessionStore (storage/session.ts) ── better-sqlite3
  │    └─ 会話履歴 TTL 30分・最大3往復6メッセージ
  │
  ├─ ActiveCharacterStore (bot/character/store.ts) ── better-sqlite3
  │    ├─ ユーザー別担当キャラクター
  │    └─ 全体デフォルト担当
  │
  └─ AIProvider (ai/) ── 抽象レイヤー
       ├─ OpenAI GPT-4o-mini (プライマリ)
       └─ Google Gemini 1.5 Flash (セカンダリ)
```

---

## ディレクトリ・ファイル詳細

### `src/index.ts`

エントリポイント。各モジュールを初期化し、WebSocket 購読・スケジューラーを起動する。
`SIGINT` / `SIGTERM` でグレースフルシャットダウン。

### `src/ai/`

AI プロバイダーの抽象レイヤー。`createAIProvider()` に `provider: 'openai' | 'gemini'` を渡すと
共通インターフェース `AIProvider` を返す。`ai.chat(messages, options)` で統一的に呼び出せる。

### `src/bot/classifier/intent.ts`

メンションテキストから意図を分類する。返り値は `ClassificationResult`。

```typescript
export type Intent =
  | 'greeting'
  | 'form-switch'
  | 'creative-consultation'
  | 'chat'
  | 'calculate'    // F-06: 数式計算
  | 'numerology'   // F-06: ライフパス・九星気学
  | 'dice'         // F-06: ダイスロール・乱数
  | 'trivia';      // F-06: 数字うんちく（LLM 委譲）

export interface ClassificationResult {
  intent: Intent;
  formTarget?: 'core-folder' | 'humanoid'; // form-switch のときのみ
  numerologyType?: 'life-path' | 'kyusei'; // numerology のときのみ
}
```

優先順: greeting → form-switch → creative-consultation → (life-path) → (kyusei) → dice → trivia → calculate → chat

### `src/bot/handlers/mention.ts`

メンション受信時のメインハンドラ。先頭でユーザー別のアクティブキャラクターと全体デフォルト担当を解決し、切り替え系コマンドを優先処理する。

- キャラクター切り替え: 番号指定・名前指定でユーザー単位に担当を変更
- キャラクター解除: 個別担当を消して全体デフォルト担当へ戻す
- 管理者デフォルト変更: `ADMIN_USER_IDS` に含まれるユーザーのみ全体デフォルトを変更
- キャラ切り替えヘルプ: 現在担当・標準担当・利用例を返信
- F-06 グループ（calculate / numerology / dice / trivia）は early return で `features/f06/` に委譲し、trivia のみ LLM を呼ぶ
- 上記以外は greeting・form-switch・creative-consultation・chat の 4 分岐

切り替え・解除時は `SessionStore.clearHistory(userId)` を呼んで、前のキャラクター文脈が会話履歴に残らないようにしている。返信後は `MENTION_REACTION_MAP` から絵文字を選んでリアクション（fire-and-forget）。

### `src/bot/character/`

マルチキャラクター機能の中核モジュール群。

| ファイル            | 役割 |
| ------------------- | ---- |
| `loader.ts`         | `_creations-db` の `db_Primary.json` から `Progress = released` の個体を読み込み、キャッシュする |
| `prompt-builder.ts` | `ConversationPattern` や `Character` / `Summary` / `Relation` から動的システムプロンプトを組み立てる |
| `switch.ts`         | 番号指定・名前指定・解除・管理者デフォルト変更・ヘルプ要求を解決し、応答文面を生成する |
| `store.ts`          | SQLite にユーザー別担当と全体デフォルト担当を永続化し、再起動後も復元する |

### `src/bot/handlers/timeline.ts`

homeTimeline ノートのリアクションハンドラ（クロージャーで生成）。
レートリミット状態（`Map<userId, number>`）をクロージャー内に保持。

### `src/bot/reactor/classify.ts`

TL ノートのフィルタリングと感情分類。

**フィルタリング条件（`shouldSkipReaction`）:**

- ファイル・画像添付あり
- 高度 MFM（`$[` / `?[`）を含む
- カスタム絵文字が 3 個以上
- クリーン後テキスト（メンション・URL・絵文字除去）が 50 文字超

**感情カテゴリ（`classifyNoteEmotion`）:**

| カテゴリ           | 代表パターン                     |
| ------------------ | -------------------------------- |
| `greeting_morning` | おはよう・おはようございます     |
| `greeting_night`   | おやすみ・就寝・そろそろ寝       |
| `greeting_return`  | ただいま・帰宅                   |
| `greeting_leave`   | いってきます                     |
| `achievement`      | 完成・できた・やった！・公開した |
| `tired`            | お疲れ様・疲れた・眠い           |
| `cheer`            | 頑張ります・やるぞ・作業開始     |
| `cute`             | かわいい・素敵・尊い             |
| `interesting`      | 面白い・発見・知見・閃いた       |

### `src/bot/reactor/emoji-reaction-map.ts`

感情カテゴリ → カスタム絵文字名のマッピング辞書。
全絵文字はインスタンス `radiann6631.net` のカテゴリ `10.挨拶・Misskeyスラング` から選定。

### `src/bot/scheduler/index.ts`

時間帯別自発投稿スケジューラー。`PostScheduler` クラス。
`setInterval` 10 分ごとに JST 時刻を判定し、対象スロット内かつクールダウン経過済みなら投稿。

### `src/features/f06/`

F-06 コマンド処理モジュール群。`mention.ts` の F-06 早期 return ブロックから呼ばれる。

| ファイル        | 役割                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------- |
| `calculator.ts` | `mathjs` ラッパー。`safeEvaluate()` で最大 200 文字の式を安全評価。禁止キーワードを弾く     |
| `numerology.ts` | `lifePathNumber()` / `honmeisei()` / `TAROT_MAP` を提供                                     |
| `responder.ts`  | 全 F-06 応答テンプレート + `TRIVIA_SYSTEM_PROMPT` / `buildTriviaUserPrompt()`              |
| `index.ts`      | `handleCalculate` / `handleLifePath` / `handleKyusei` / `handleDice` / `extractTriviaNumber` を公開 |

`F06Result` 型:

```typescript
export interface F06Result {
  text: string;      // 通常ノート本文（100 文字以内を推奨）
  cwBody?: string;   // CW 折りたたみ内テキスト
  cwLabel?: string;  // CW ラベル文字列
}
```

### `src/misskey/client.ts`

Misskey WebSocket クライアントのラッパー。公開メソッド:

| メソッド                     | 説明                                |
| ---------------------------- | ----------------------------------- |
| `onMention(cb)`              | `main` チャンネルのメンションを購読 |
| `onHomeTL(cb)`               | `homeTimeline` チャンネルを購読     |
| `reply(text, replyId, opts)` | ノートに返信（visibility: home）    |
| `post(text, opts)`           | 自発投稿（visibility: home）        |
| `react(noteId, emojiName)`   | カスタム絵文字リアクション送信      |
| `getMyUserId()`              | 自分のユーザー ID を取得            |
| `close()`                    | WebSocket 接続を閉じる              |

`react()` の絵文字名フォーマット: `:emojiName@.:` （ローカルインスタンス指定）

### `src/storage/session.ts`

`better-sqlite3` を使ったセッション会話履歴ストア。
保存パス: `.cache/session.db`（`.gitignore` 対象）。TTL 30 分・最大 3 往復。

### `src/bot/character/store.ts`

`better-sqlite3` を使ったアクティブキャラクター状態ストア。
同じ SQLite ファイル内に以下を保持する。

- `active_character_state`: ユーザー別の現在担当キャラクター
- `bot_settings`: 全体デフォルト担当などの Bot 設定

### `src/config/env.ts` / `src/config/constants.ts`

環境変数の読み込みと定数定義。`.env` ファイルから `dotenv` 経由で読み込む。

---

## 環境変数一覧

| 変数名                         | 必須 | 説明                                  | デフォルト          |
| ------------------------------ | ---- | ------------------------------------- | ------------------- |
| `MISSKEY_HOST`                 | ✅   | Misskey インスタンス URL              | —                   |
| `MISSKEY_TOKEN`                | ✅   | Bot アカウント API トークン           | —                   |
| `AI_PROVIDER`                  | —    | `openai` or `gemini`                  | `openai`            |
| `OPENAI_API_KEY`               | ✅   | OpenAI API キー                       | —                   |
| `GEMINI_API_KEY`               | —    | Gemini API キー                       | —                   |
| `NODE_ENV`                     | —    | `development` / `production`          | `development`       |
| `LOG_LEVEL`                    | —    | `debug` / `info` / `warn` / `error`   | `info`              |
| `DEFAULT_CHARACTER_NUM`        | —    | 個別指定がない場合の標準担当番号      | `000`               |
| `ADMIN_USER_IDS`               | —    | 管理者ユーザー ID のカンマ区切り一覧  | 空                  |
| `RATE_LIMIT_REPLY_COOLDOWN_MS` | —    | 同一ユーザーへの返信クールダウン (ms) | `0`（無制限）       |
| `RATE_LIMIT_GLOBAL_PER_HOUR`   | —    | 全体の 1 時間あたり最大投稿数         | `10`                |
| `DB_PATH`                      | —    | SQLite ファイルパス                   | `.cache/session.db` |

`DB_PATH` は会話履歴だけでなく、ユーザー別担当キャラクターと全体デフォルト担当の永続化にも使われる。

> ⚠️ `RATE_LIMIT_REPLY_COOLDOWN_MS` を明示的に設定する場合は `0`（無制限）が推奨。
> 過去に `1800000`（30 分）を設定したまま放置してリプライが届かなくなった事例あり。

---

## レートリミット設計

| 対象                          | 上限                                | 実装                                   |
| ----------------------------- | ----------------------------------- | -------------------------------------- |
| 同一ユーザーへの返信          | `RATE_LIMIT_REPLY_COOLDOWN_MS` (ms) | `RateLimiter.canReply/recordReply`     |
| 全体投稿（返信+自発）         | `RATE_LIMIT_GLOBAL_PER_HOUR` 件/時  | `RateLimiter`（1時間ウィンドウ）       |
| TL リアクション（ユーザー別） | 1 時間 1 回                         | `timeline.ts` 内 `Map<userId, number>` |
| TL リアクション（全体）       | 20 回/時                            | `timeline.ts` 内配列                   |
| 自発投稿クールダウン          | 1〜2 時間（ランダム）               | `scheduler/index.ts`                   |
