# 技術アーキテクチャ — NumberTales Misskey AI Bot

> 最終更新: 2026-06-14
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
  │         │    harassment  (F-07: L1/L2/L3 レベル判定付き)
  │         ├─ 切り替え系コマンド (bot/character/switch.ts)
  │         │    ├─ 個別担当切り替え（LLM生成メッセージ付き）
  │         │    ├─ 個別担当解除
  │         │    ├─ 管理者デフォルト変更
  │         │    ├─ 管理者自発投稿担当変更（スケジューラーキャラクター直接変更）
  │         │    └─ ヘルプ応答
  │         ├─ F-06 早期 return (features/f06/)
  │         │    ├─ calculate  → safeEvaluate (mathjs)
  │         │    ├─ numerology → ライフパス / 九星気学
  │         │    ├─ dice       → Math.random() ダイス・乱数
  │         │    └─ trivia     → LLM 委譲 (maxTokens 120)
  │         ├─ 応答生成 (F-06 以外)
  │         │    ├─ greeting   → LLM 生成（時間帯プロンプト注入）
  │         │    ├─ chat       → LLM 生成
  │         │    ├─ form-switch → LLM 生成（5シナリオ切り替えメッセージ）
  │         │    └─ harassment  → L1: 担当キャラで受け流し
  │         │                     L2: 000(チトセ) が設計上の制約として介入
  │         │                     L3: 10(ミツル) が毅然と制止
  │         │                         IncidentLogger でファイルに記録
  │         ├─ 返信投稿 (misskeyClient.reply)
  │         └─ リアクション付与 (misskeyClient.react) ← F-04
  │
  │              ──────────────────────── followed イベント
  │    └─ handlers/follow.ts
  │         ├─ 自己フォロー除外
  │         ├─ 重複フォローバック防止（5 分クールダウン）
  │         └─ misskeyClient.follow(userId) でフォローバック実行
  │
  ├─ homeTimeline チャンネル ────────── note イベント
  │    └─ handlers/timeline.ts
  │         ├─ フィルタリング (reactor/classify.ts)
  │         ├─ 感情分類 (reactor/classify.ts)
  │         └─ リアクション送信 (misskeyClient.react)
  │
  ├─ PostScheduler (bot/scheduler/index.ts) ── setInterval 10分
  │    └─ 時間帯判定 (JST) → LLM 生成 → misskeyClient.post
  │
  ├─ WeeklyPollScheduler (bot/scheduler/weekly-poll.ts) ── setInterval 10分
  │    ├─ 土曜 0:00 → Tier 重み付き 3 名候補選出 → Poll 投稿（48 時間投票期間）
  │    ├─ 土日 7〜23 時 毎時 → 投票ノートのセルフリノート（リマインド）
  │    ├─ 月曜 0:00 → 票数集計 → 最多票キャラクターを当週担当に確定・結果投稿
  │    └─ 月曜 7:00 → 就任挨拶（LLM 生成）を投稿
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
  ├─ IncidentLogger (utils/incident-logger.ts) ── NDJSON ファイル追記
  │    └─ ハラスメント検知時に投稿情報を .cache/incident.log に記録
  │
  ├─ Logger (utils/logger.ts) ── コンソール + NDJSON ファイル追記
  │    ├─ error / warn → コンソール + .cache/error.log に NDJSON で追記
  │    └─ info / debug → コンソールのみ
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
  | 'calculate' // F-06: 数式計算
  | 'numerology' // F-06: ライフパス・九星気学
  | 'dice' // F-06: ダイスロール・乱数
  | 'trivia' // F-06: 数字うんちく（LLM 委譲）
  | 'harassment'; // F-07: ハラスメント仲介

export interface ClassificationResult {
  intent: Intent;
  formTarget?: 'core-folder' | 'humanoid'; // form-switch のときのみ
  numerologyType?: 'life-path' | 'kyusei'; // numerology のときのみ
  harassmentLevel?: 1 | 2 | 3; // harassment のときのみ
}
```

優先順: greeting → form-switch → creative-consultation → **harassment** → (life-path) → (kyusei) → dice → trivia → calculate → chat

`detectHarassmentLevel(text)` でルールベース判定（L3 → L2 → L1 の優先順で正規表現マッチ）。

- **L1**: 軽度の不躾な要求・軽い挑発（プライベート情報要求など）
- **L2**: 不適切な性的要求・個人情報要求・エスカレートした言動
- **L3**: 明確な暴言・威圧・脅迫レベルの言動

### `src/bot/handlers/mention.ts`

メンション受信時のメインハンドラ。先頭でユーザー別のアクティブキャラクターと全体デフォルト担当を解決し、切り替え系コマンドを優先処理する。

- キャラクター切り替え: 番号指定・名前指定でユーザー単位に担当を変更。切り替えメッセージは **LLM 生成**（5 シナリオ: 初回登場・再登場・復帰・同一担当・解除後戻り）
- キャラクター解除: 個別担当を消して全体デフォルト担当へ戻す
- 管理者デフォルト変更: `ADMIN_USER_IDS` に含まれるユーザーのみ全体デフォルトを変更
- 管理者スケジューラー担当変更: `BotStateStore` の `STATE_KEY_SCHEDULER_CHAR` を直接更新。切り替え時は 000(チトセ) 書式で返信 + 投票結果告知と同形式の公開投稿を自動発行
- キャラ切り替えヘルプ: 現在担当・標準担当・利用例を返信（常に 000(チトセ) 固定）。管理者にはスケジューラー担当変更コマンドのヒントも表示
- F-06 グループ（calculate / numerology / dice / trivia）は early return で `features/f06/` に委譲し、trivia のみ LLM を呼ぶ
- **greeting**: LLM 生成。JST 時間帯（朝/昼/夕/深夜）をプロンプトに注入し、時間帯に合った挨拶を返す
- **form-switch / chat / creative-consultation**: LLM 生成
- **F-06（trivia 以外）**: LLM なしで確定応答 + 結果への前置き一言（30 文字以内）のみ LLM 生成
- **harassment（F-07）**: `detectHarassmentLevel()` で L1/L2/L3 を判定し `generateHarassmentReply()` を呼ぶ。L3 の場合は `IncidentLogger.log()` で投稿者情報をファイルに記録する
  - `MentionEvent` に `username?` / `userHost?` / `noteCreatedAt?` フィールドを追加して投稿者 ID・ホスト・日時をハンドラに渡す
  - userHandle は `@username`（ローカル）または `@username@host`（リモート）形式で記録

切り替え・解除時は `SessionStore.clearHistory(userId)` を呼んで、前のキャラクター文脈が会話履歴に残らないようにしている。返信後は `MENTION_REACTION_MAP` から絵文字を選んでリアクション（fire-and-forget）。

### `src/bot/handlers/follow.ts`

`main` チャンネルの `followed` イベントハンドラ（クロージャーで生成）。
`createFollowBackHandler(deps)` ファクトリ関数を通じて依存注入する。

- 自己フォロー除外（`user.id === myUserId` の場合はスキップ）
- 同一ユーザーへの重複フォローバックを 5 分クールダウンで防止（インメモリ `Map`）
- `misskeyClient.follow(userId)` → Misskey API `following/create` を呼び出し

### `src/bot/character/`

マルチキャラクター機能の中核モジュール群。

| ファイル            | 役割                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `loader.ts`         | `_creations-db` の `CreationsDBClient` 経由で `Progress = released` の個体を読み込み、キャッシュする。`DB_Hidden` フラグを自動尊重（旧: `db_Primary.json` 直接 import） |
| `prompt-builder.ts` | `ConversationPattern` や `Character` / `Summary` / `Relation` から動的システムプロンプトを組み立てる |
| `switch.ts`         | 番号指定・名前指定・解除・管理者デフォルト変更・ヘルプ要求を解決し、応答文面を生成する               |
| `store.ts`          | SQLite にユーザー別担当と全体デフォルト担当を永続化し、再起動後も復元する                            |

### `src/bot/handlers/timeline.ts`

homeTimeline ノートのリアクションハンドラ（クロージャーで生成）。
レートリミット状態（`Map<userId, number>`）をクロージャー内に保持。

### `src/bot/reactor/classify.ts`

TL ノートのフィルタリングと感情分類。**LLM ハイブリッド方式**を採用（2026-06-13 改修）。

**フィルタリング条件（`shouldSkipReaction`）:**

- ファイル・画像添付あり
- 高度 MFM（`$[` / `?[`）を含む
- カスタム絵文字が 3 個以上
- クリーン後テキスト（メンション・URL・絵文字除去）が 50 文字超

**感情分類の処理フロー（`classifyNoteEmotion` は async）:**

```
cleanText() → classifyGreeting()（挨拶系を正規表現で先行判定・LLM 不使用）
           → null の場合 → classifyEmotionByLLM()（LLM に委譲）
                          → 'skip' または失敗 → null（リアクションなし）
```

- **挨拶先行判定の背景**: 否定的な文脈（「知見が低すぎて打ちのめされてる」等）でも `interesting` にマッチしていた問題を解消するため、感情カテゴリのみ LLM に委譲する方式へ変更

**感情カテゴリ（`ReactionCategory`）:**

| カテゴリ           | 判定方式 | 代表パターン                     |
| ------------------ | -------- | -------------------------------- |
| `greeting_morning` | 正規表現 | おはよう・おはようございます     |
| `greeting_night`   | 正規表現 | おやすみ・就寝・そろそろ寝       |
| `greeting_return`  | 正規表現 | ただいま・帰宅                   |
| `greeting_leave`   | 正規表現 | いってきます                     |
| `achievement`      | LLM      | 完成・できた・やった！・公開した |
| `tired`            | LLM      | お疲れ様・疲れた・眠い           |
| `agree`            | LLM      | わかる・同意・共感               |
| `cheer`            | LLM      | 頑張ります・やるぞ・作業開始     |
| `cute`             | LLM      | かわいい・素敵・尊い             |
| `interesting`      | LLM      | 面白い・発見・閃いた（ポジティブ文脈のみ） |
| `sympathy`         | LLM      | 悲しい・落ち込んでいる・辛い状況 |

### `src/bot/reactor/emoji-reaction-map.ts`

感情カテゴリ → カスタム絵文字名のマッピング辞書。
全絵文字はインスタンス `radiann6631.net` のカテゴリ `10.挨拶・Misskeyスラング` から選定。

### `src/bot/scheduler/index.ts`

時間帯別自発投稿スケジューラー。`PostScheduler` クラス。
`setInterval` 10 分ごとに JST 時刻を判定し、対象スロット内かつクールダウン経過済みなら投稿。

### `src/bot/scheduler/weekly-poll.ts`

週次担当選出スケジューラー。`WeeklyPollScheduler` クラス。起動時に `fetchEmojis()` で絵文字キャッシュを取得し、`setInterval` 1 分ごとに以下を実行する。

| タイミング               | 処理                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 土曜 0:00                | 候補 3 名を Tier 重み付き抽選（前週候補・固定除外を除く）→ Poll ノートを投稿（48 時間投票）                           |
| 土曜・日曜 7〜23 時 毎時 | `STATE_KEY_POLL_NOTE_ID` が存在する場合、投票ノートをセルフリノートしてリマインド                                     |
| 月曜 0:00                | 票数を集計し最多票キャラクターを `STATE_KEY_SCHEDULER_CHAR` に書き込み、000(チトセ)書式で結果投稿                     |
| 月曜 7:00                | 就任挨拶（LLM 生成・50 文字以内）を担当キャラ発言書式で投稿し `STATE_KEY_POLL_NOTE_ID` をクリア                      |

**Tier 重み（候補選出）:**

| Tier | 条件                                             | 重み |
| ---- | ------------------------------------------------ | ---- |
| 1    | `ConversationPattern` が創作 DB に収録されている | 15   |
| 2    | `Character` / `Summary` / `Relation.Commented`   | 3    |
| 3    | 上記以外                                         | 1    |

- 固定除外: `000` / `0` / `00` / `1` / `10`、ハイフン含む特殊番号
- コアフォルダー絵文字は `resolveCoreFolderEmoji()` で解決。優先度: ①標準エイリアス完全一致 → ②同プレフィックス + tags/category に `corefolder` → ③同プレフィックス先頭一件 → ④null（候補除外）。Poll 候補選出時と `formatSpeech()` で共通利用
- `STATE_KEY_PREV_POLL_CANDIDATES` に前週候補番号を保存し、翌週の選出から除外（連続選出防止）
- 二重発火防止のため `processedKeys: Set<string>` でタイムスタンプキーを管理

### `src/features/f06/`

F-06 コマンド処理モジュール群。`mention.ts` の F-06 早期 return ブロックから呼ばれる。

| ファイル        | 役割                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------- |
| `calculator.ts` | `mathjs` ラッパー。`safeEvaluate()` で最大 200 文字の式を安全評価。禁止キーワードを弾く             |
| `numerology.ts` | `lifePathNumber()` / `honmeisei()` / `TAROT_MAP` を提供                                             |
| `responder.ts`  | 全 F-06 応答テンプレート + `TRIVIA_SYSTEM_PROMPT` / `buildTriviaUserPrompt()`                       |
| `index.ts`      | `handleCalculate` / `handleLifePath` / `handleKyusei` / `handleDice` / `extractTriviaNumber` を公開 |

`F06Result` 型:

```typescript
export interface F06Result {
  text: string; // 通常ノート本文（100 文字以内を推奨）
  cwBody?: string; // CW 折りたたみ内テキスト
  cwLabel?: string; // CW ラベル文字列
}
```

### `src/misskey/client.ts`

Misskey WebSocket クライアントのラッパー。公開メソッド:

| メソッド                      | 説明                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `onMention(cb)`               | `main` チャンネルのメンションを購読                                                    |
| `onFollowed(cb)`              | `main` チャンネルのフォローイベントを購読                                              |
| `onHomeTL(cb)`                | `homeTimeline` チャンネルを購読                                                        |
| `reply(text, replyId, opts)`  | ノートに返信（visibility: home）                                                       |
| `post(text, opts)`            | 自発投稿（visibility: public）                                                         |
| `follow(userId)`              | 指定ユーザーをフォロー（`following/create`）                                           |
| `react(noteId, emojiName)`    | カスタム絵文字リアクション送信                                                         |
| `postPoll(text, choices, ms)` | 投票（Poll）付きノートを投稿し、作成された noteId を返す                               |
| `getPollChoices(noteId)`      | Poll の選択肢と票数を取得（`{ text, votes }[]`）                                       |
| `fetchEmojis()`               | サーバーのカスタム絵文字一覧を取得（`EmojiInfo[]`。name/aliases/category/tags を保持） |
| `renote(noteId)`              | 指定ノートをリノート（週次 Poll のセルフリノート用、visibility: public）             |
| `getMyUserId()`               | 自分のユーザー ID を取得                                                               |
| `close()`                     | WebSocket 接続を閉じる                                                                 |

`react()` の絵文字名フォーマット: `:emojiName@.:` （ローカルインスタンス指定）

### `src/storage/session.ts`

`better-sqlite3` を使ったセッション会話履歴ストア。
保存パス: `.cache/session.db`（`.gitignore` 対象）。TTL 30 分・最大 3 往復。

### `src/storage/bot-state.ts`

`BotStateStore` クラス（`better-sqlite3`）。キーバリュー形式で Bot の永続状態を `.cache/session.db` に保持する。

| 定数                             | キー文字列             | 用途                                          |
| -------------------------------- | ---------------------- | --------------------------------------------- |
| `STATE_KEY_SCHEDULER_CHAR`       | `scheduler_character`  | 週次担当に選ばれたキャラクター番号            |
| `STATE_KEY_POLL_NOTE_ID`         | `poll_note_id`         | 投票中の Poll ノート ID（リノート・集計用）   |
| `STATE_KEY_POLL_CANDIDATES`      | `poll_candidates`      | 現在の Poll 候補キャラクター番号（JSON 配列） |
| `STATE_KEY_PREV_POLL_CANDIDATES` | `prev_poll_candidates` | 前週の Poll 候補番号（連続選出防止用）        |

### `src/bot/character/store.ts`

`better-sqlite3` を使ったアクティブキャラクター状態ストア。
同じ SQLite ファイル内に以下を保持する。

- `active_character_state`: ユーザー別の現在担当キャラクター
- `bot_settings`: 全体デフォルト担当などの Bot 設定

### `src/utils/incident-logger.ts`

ハラスメント検知時に投稿情報を NDJSON 形式でファイルに追記するクラス。
`IncidentRecord` インターフェース: `timestamp` / `level` / `noteId` / `userId` / `userHandle` / `noteCreatedAt` / `text`。
`logger.warn()` でも同時出力されるため PM2 ログからも確認可能。

### `src/utils/logger.ts`

ログ出力クラス。`enableFileOutput(filePath)` を呼ぶと `error` / `warn` レベルのログを
NDJSON 形式でファイルに追記するようになる（`info` / `debug` はコンソールのみ）。
`index.ts` の起動時に一度だけ呼び出す。

### `src/config/env.ts` / `src/config/constants.ts`

環境変数の読み込みと定数定義。`.env` ファイルから `dotenv` 経由で読み込む。
`constants.ts` の `BOT_CONSTANTS` に `CHITOSE_NUM: '000'` と `MITSURU_NUM: '10'`（F-07 L3 担当）を定義。

---

## 環境変数一覧

| 変数名                         | 必須 | 説明                                  | デフォルト            |
| ------------------------------ | ---- | ------------------------------------- | --------------------- |
| `MISSKEY_HOST`                 | ✅   | Misskey インスタンス URL              | —                     |
| `MISSKEY_TOKEN`                | ✅   | Bot アカウント API トークン           | —                     |
| `AI_PROVIDER`                  | —    | `openai` or `gemini`                  | `openai`              |
| `OPENAI_API_KEY`               | ✅   | OpenAI API キー                       | —                     |
| `GEMINI_API_KEY`               | —    | Gemini API キー                       | —                     |
| `NODE_ENV`                     | —    | `development` / `production`          | `development`         |
| `LOG_LEVEL`                    | —    | `debug` / `info` / `warn` / `error`   | `info`                |
| `DEFAULT_CHARACTER_NUM`        | —    | 個別指定がない場合の標準担当番号      | `000`                 |
| `ADMIN_USER_IDS`               | —    | 管理者ユーザー ID のカンマ区切り一覧  | 空                    |
| `RATE_LIMIT_REPLY_COOLDOWN_MS` | —    | 同一ユーザーへの返信クールダウン (ms) | `0`（無制限）         |
| `RATE_LIMIT_GLOBAL_PER_HOUR`   | —    | 全体の 1 時間あたり最大投稿数         | `10`                  |
| `DB_PATH`                      | —    | SQLite ファイルパス                   | `.cache/session.db`   |
| `INCIDENT_LOG_PATH`            | —    | ハラスメント検知ログ出力先            | `.cache/incident.log` |
| `ERROR_LOG_PATH`               | —    | エラー・警告ログ出力先                | `.cache/error.log`    |

`DB_PATH` は会話履歴だけでなく、ユーザー別担当キャラクターと全体デフォルト担当の永続化にも使われる。

`INCIDENT_LOG_PATH` / `ERROR_LOG_PATH` はいずれも `.gitignore` 対象の `.cache/` 配下がデフォルト。
VM 上で直接確認するには `tail` / `grep` を使用すること（後述）。

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

---

## ログファイル管理

Bot は PM2 のコンソールログに加え、2 種類のファイルログを `.cache/` 配下に出力する。

### インシデントログ（`.cache/incident.log`）

ハラスメント検知（F-07）時に投稿者情報を記録する NDJSON ファイル。
1 行 1 レコード形式:

```json
{
  "timestamp": "2026-05-29T10:00:00.000Z",
  "level": 3,
  "noteId": "abc123",
  "userId": "xyz",
  "userHandle": "@baduser@misskey.example",
  "noteCreatedAt": "2026-05-29T09:59:59.000Z",
  "text": "..."
}
```

| フィールド      | 内容                                             |
| --------------- | ------------------------------------------------ |
| `timestamp`     | ログ記録日時（ISO 8601）                         |
| `level`         | ハラスメントレベル（1 / 2 / 3）                  |
| `noteId`        | Misskey ノート ID                                |
| `userId`        | 投稿者の Misskey ユーザー ID                     |
| `userHandle`    | `@username` / `@username@host`（リモートの場合） |
| `noteCreatedAt` | 元ノートの投稿日時                               |
| `text`          | 投稿テキスト（メンション除去済み）               |

### エラーログ（`.cache/error.log`）

`logger.error()` / `logger.warn()` レベルのログを記録する NDJSON ファイル。
PM2 ログと同内容だが、ファイルとして永続化・フィルタリングできる。

```json
{
  "timestamp": "2026-05-29T10:00:00.000Z",
  "level": "error",
  "message": "WebSocket接続エラー",
  "detail": "ECONNREFUSED"
}
```

### VM 上でのログ確認コマンド

```bash
# インシデントログ（直近20件）
tail -n 20 .cache/incident.log

# L3（暴言・脅迫）だけ抽出
grep '"level":3' .cache/incident.log

# エラーログ（直近20件）
tail -n 20 .cache/error.log

# エラーのみ抽出
grep '"level":"error"' .cache/error.log

# リアルタイム監視
tail -f .cache/incident.log
tail -f .cache/error.log
```

---

## デバッグツール

### `tools/fetch-misskey-notes.mjs`

Bot の直近投稿を Misskey API から取得してコンソールに表示するスタンドアロンスクリプト。
`dotenv` 非依存で `.env` を手動パースするため、ビルド不要・Node.js のみで実行可能。

```bash
# 直近10件（デフォルト）
node tools/fetch-misskey-notes.mjs

# 件数指定
node tools/fetch-misskey-notes.mjs --limit 20
```

**出力内容:** 投稿日時（JST）・可視性・CW ラベル・本文・リノート先 ID
