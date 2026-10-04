# 技術アーキテクチャ — NumberTales Misskey AI Bot

> 最終更新: 2026-10-04（`develop` の実装に合わせて全面更新）
> 実装状況を反映したライブドキュメント。ディレクトリ構成と実装済み機能の一覧は [AGENTS.md](../AGENTS.md) が正典で、
> ここでは**処理の流れ・判定順・保存するもの・外部との境界**だけを書く。仕様案は [`_ideas/bot-spec/03_tech-architecture.md`](../_ideas/bot-spec/03_tech-architecture.md)。

---

## システム構成図

```
Misskey インスタンス (radiann6631.net)
  │  WebSocket Streaming（misskey-js・自動再接続）
  ▼
[ Bot: GCP 共用 Spot VM / pm2 / Node v22 ]
  │
  ├─ main チャンネル
  │    ├─ mention  → handlers/mention.ts（ユーザー単位で直列化: MisskeyClient.mentionQueues）
  │    └─ followed → handlers/follow.ts（フォローバック・5 分重複防止）
  │
  ├─ homeTimeline チャンネル → handlers/timeline.ts
  │    フィルタ（画像・高度 MFM・絵文字 3 個以上・50 字超はスキップ）→ 挨拶は正規表現、他は LLM で感情分類 → リアクション
  │    （ユーザー 1 時間 1 回・全体 20 回/時）
  │
  ├─ globalTimeline チャンネル → handlers/global-tl.ts   ※ ENABLE_GLOBAL_TL=true のときだけ購読
  │    #ナンバーテールズ 等のタグ → ブロックリスト → LLM で関連性判定 → 感情分類 → リアクション（ユーザー 1 時間 1 回）
  │
  ├─ PostScheduler (scheduler/index.ts) ── setInterval 10 分
  │    ├─ F-16 定期出題 8/12/16/20 時（public。答えは出題ノートへのリプライで受理）
  │    ├─ 月曜 7 時: weeklyPoll.postInaugurationGreeting()（就任挨拶。この日は通常スロットをスキップ）
  │    ├─ 朝スロットで 1 日 1 回: scheduler/anniversary.ts（ユーザー誕生日→本人宛て home、キャラ記念日/季節イベント→public）
  │    └─ 時間帯スロット 朝 6-8 / 昼 12-13 / 夕 17-19 / 深夜 23-5（深夜はコアフォルダ形態）→ LLM → post(public)
  │         クールダウン 1〜2 時間（ランダム・スロット横断）
  │    内包:
  │    ├─ WeeklyPollScheduler (scheduler/weekly-poll.ts) ── setInterval 10 分
  │    │    土 0:00 Poll 投稿（Tier 重み付き 3 名・48 時間）→ 土日 7〜23 時 毎時セルフリノート → 月 0:00 集計・結果投稿
  │    └─ TaskScheduler (scheduler/task-scheduler.ts) ── 5 分（1 回最大 5 件・期日超過 1 回・12 時間ごとの催促・home で本人宛て）
  │
  ├─ HeartbeatWriter (utils/heartbeat.ts) ── 30 秒ごと .cache/heartbeat.json（VM 内ウォッチドッグが監視）
  ├─ features/recovery-notice.ts ── 起動時に前回ハートビートから停止時間を算出し、30 分超なら home に 1 回だけ復旧通知
  │
  ├─ 永続化（better-sqlite3・.cache/session.db・WAL）
  │    SessionStore（会話履歴 TTL 30 分・6 件）/ GameSessionStore（TTL 60 分・recent_games・repeat_log）
  │    BotStateStore（KV）/ ActiveCharacterStore（担当・形態・全体デフォルト）/ TaskStore（tasks・pending_task_drafts）
  │    TrustStore / CharacterAffinityStore / UserBirthdayStore
  │
  ├─ ファイルログ: IncidentLogger（ハラスメント検知・NDJSON）/ Logger（error・warn を NDJSON・info 以下は pm2 のみ）
  │
  ├─ 数式画像 (features/typeset.ts) ── _calcimage-pipeline/（Python）を execFile・3 秒・sha1 キャッシュ → Drive に 1 回だけ upload
  │
  └─ AIProvider (ai/) ── openai: gpt-4o-mini（既定）/ gemini: gemini-2.5-flash。AI_PROVIDER で切替。モデル名は環境変数化していない
```

---

## メンション 1 件の処理フロー（`handlers/mention.ts`）

上から順に評価し、処理したら return する。番号はソース中のコメントに対応。

1. 担当キャラ・形態・信頼度を解決し、chat 用と創作相談用のシステムプロンプトを組む（`prompt-builder.ts`）
2. 自己メンション・空本文は無視
3. 切り替え系（レートリミットより前）: ヘルプ「誰と話せる？」→ リセット「通常担当に戻して」→ 管理者の全体デフォルト変更 → 管理者の自発投稿担当変更（公開告知つき）
4. レートリミット。**進行中のゲームの手番は全体上限（`RATE_LIMIT_GLOBAL_PER_HOUR`）の対象外**（同一ユーザーのクールダウンは適用）
5. キャラ切り替え「◯◯と話したい」（形態指定を伴う場合は同時に適用。同じ形態への再指定は通常会話へ流す）
6. ヒット＆ブロウ開始前の「色ヒント」確認待ち（y/n）
7. **F-16 定期出題への回答**（リプライ先が現在の出題ノートなら最優先。1 ユーザー 1 回・正解で出題キャラの親密度 +1）
8. 進行中のゲームセッション: ヨット → ポーカー → 麻雀 → ヒット＆ブロウ → 手役クイズ → 計算問題（「やめ」で中断。手番として解釈できなければ下へ）
9. タスクの難易度確認ドラフト待ち（優先度・難易度の返答をキーワードで回収。10 分 TTL）
10. 意図分類（`classifyIntent`）。`game-repeat` は直近 10 分のゲームへ写像（3 回まで）
11. 1 日 1 回の会話ボーナス（信頼度 +3・親密度 +1）
12. ハラスメント（L1 担当キャラが受け流す / L2 000 が制約として介入 / L3 10(ミツル) が制止）。**全レベルで** `IncidentLogger.log()`
13. F-06 グループ（計算・占い・ダイス・うんちく・全ミニゲーム）は `features/f06/` へ早期 return。結果への一言だけ LLM（出題時は抑止）。
    計算で縦構造の式なら `renderMathPng` → `ensureDriveFile` → `reply(fileIds)`（失敗時は本文だけで再送）
14. ヌメロジー相談 → タスク（追加・一覧・完了・キャンセル・進捗%）→ 親密度照会 → 誕生日の登録・解除
15. 残り: greeting（時間帯つき LLM）/ form-switch / creative-consultation（履歴なし）/ chat（履歴あり・履歴へ記録）
16. 100 字超は CW `<担当番号>の返信`。返信後に intent 別の絵文字でリアクション（fire-and-forget）

### 意図分類の判定順（`classifier/intent.ts`）

greeting → form-switch → creative-consultation → birthday-forget → birthday-register → numerology-consultation →
numerology(life-path) → numerology(moon-star) → numerology(kyusei) → game-slot → game-poker → game-yacht → game-hitblow →
game-mahjong-quiz → game-mahjong → game-tile-fortune → game-roulette → game-calc-quiz → game-repeat →
task-progress-update → task-add → task-list → task-done → task-cancel → dice → trivia → calculate → affinity-check →
**harassment** → chat

順序に意味がある箇所（ソースのコメント参照）: 誕生日はタスク追加の「覚えておいて」より先、手役クイズは麻雀より先、
進捗%は一覧より先、タスク追加は一覧・完了より先。ハラスメントは**最後の手前**で、他の意図に当たらなかった本文だけを見る。

---

## システムプロンプトの二層構成（`character/prompt-builder.ts`）

- **基盤層**: creations-db が生成コミットしたキャラカード（`RoleplayPrompts/DB_*/roleplay-prompt-<Num>.md` の「あなたが演じる…」節。`roleplay-prompt-loader.ts` が抽出・遅延キャッシュ）。無いキャラは DB フィールド（呼称 DSL・性格・関係・会話パターン）から組み立てる fallback
- **Bot 実行層**: 口調厳守ブロック（盛らない・主人呼称を守る・「/」区切り呼称は 1 つだけ選ぶ）、身体性（コアフォルダ 55cm / 人型はキャラ個別の `Height_cm`）、応答方針（80 字 or 創作相談 200 字）、専門性（趣味・特技・Numerospec）、制約（CC BY-NC・未公開設定を作らない）、信頼度ラベル
- 計測系フィールドは `resolveMeasureField()` で `{value, about_JP}`・配列・`{hideText}` を吸収する（非公開は出さない）

---

## 永続化するもの（`.cache/session.db`）

| ストア | テーブル | 中身 | 消え方 |
| --- | --- | --- | --- |
| SessionStore | `session_messages` | userId・role・本文 | TTL 30 分・切り替え時にクリア |
| GameSessionStore | `game_sessions` / `recent_games` / `game_repeat_log` | ゲーム状態 JSON | TTL 60 分 / 10 分 |
| BotStateStore | `bot_state` | KV（下表） | 上書き |
| ActiveCharacterStore | `active_character_state` / `active_form_state` / `bot_settings` | ユーザー別担当・形態、全体デフォルト | リセット要求 |
| TaskStore | `tasks` / `pending_task_drafts` | 題名・期日・通知先（username/host）・進捗% | 完了・キャンセル／ドラフトは 10 分 |
| TrustStore | `user_trust` | ポイント・完了数・会話日数 | 減衰なし |
| CharacterAffinityStore | `character_affinity` | (userId, charNum) → ポイント・日次加算 | 減衰なし |
| UserBirthdayStore | `user_birthdays` | 月日・username/host（**年は持たない**） | 「誕生日を忘れて」 |

`bot_state` のキー（`storage/bot-state.ts`）:

| 定数 | キー | 用途 |
| --- | --- | --- |
| `STATE_KEY_SCHEDULER_CHAR` | `current_scheduler_char` | 週次担当（自発投稿・定期出題・記念日投稿の発言者） |
| `STATE_KEY_POLL_NOTE_ID` | `current_poll_note_id` | 投票中の Poll ノート |
| `STATE_KEY_POLL_CANDIDATES` | `current_poll_candidates` | 今週の候補番号（JSON） |
| `STATE_KEY_PREV_POLL_CANDIDATES` | `prev_poll_candidates` | 前週候補（連続選出防止） |
| `STATE_KEY_CALC_QUIZ_LAST_SLOT` | `calc_quiz_last_slot` | 定期出題の重複防止（`YYYY-MM-DD:HH`） |
| `STATE_KEY_CALC_QUIZ_PUBLIC` | `calc_quiz_public_question` | 現在の公開問題と回答済みユーザー（JSON） |
| `STATE_KEY_ANNIVERSARY_LAST_DATE` | `anniversary_last_date` | 記念日チェックの 1 日 1 回 |
| （recovery-notice 内） | `last_downtime_notice_at` | 復旧通知のクールダウン |
| （typeset 経由） | `driveimg:<sha1>` | 数式画像の Drive ファイル ID |

プライバシーの取り扱いは [rights-and-privacy-review.md](./rights-and-privacy-review.md) を参照。

---

## 外部との境界

### Misskey（`misskey/client.ts`）

| メソッド | 用途・可視性 |
| --- | --- |
| `onMention` / `onFollowed` / `onHomeTL` / `onGlobalTL` | チャンネル購読。メンションはユーザー単位で直列化 |
| `reply(text, replyId, {cw, fileIds})` | 返信・`home`。添付で失敗したら本文だけで再送 |
| `post(text, {cw, visibility, fileIds})` | 自発投稿・既定 `public`（復旧通知だけ `home`） |
| `postToUser(text, userId, {cw})` | タスク通知・誕生日メンション・`home`（宛先は本文の `@username@host`） |
| `postPoll` / `getPollChoices` / `renote` | 週次 Poll（`public`） |
| `react(noteId, emoji)` | `:name@.:` 形式でローカル絵文字リアクション |
| `uploadFile(buf, name, comment)` | Drive へ multipart（Node 標準 fetch・10 秒タイムアウト）。comment は alt |
| `fetchEmojis` / `getMyUserId` / `follow` / `isConnected` / `close` | 補助 |

### LLM（`ai/`）

`ai.chat(messages, {maxTokens, temperature})` だけを使う。送るものは **(a)** メンション本文（切り替え・ハラスメント時は先頭 80〜100 字）と会話履歴、
**(b)** フォロイー／グローバル TL の短文（分類のみ・保存しない）、**(c)** タスク登録文（日時抽出）。
問題生成・採点・停止時間・親密度などの**事実はコード側で確定**し、LLM には口調と前置きだけを任せる。

### Python（`features/typeset.ts`・ADR 0001）

`TYPESET_PYTHON` が空なら呼ばない。失敗・3 秒超過は null を返し、本文は PM 絵文字＋プレーン式で成立させる。

---

## 環境変数一覧（`config/env.ts`）

| 変数名 | 必須 | 既定 | 説明 |
| --- | --- | --- | --- |
| `MISSKEY_HOST` / `MISSKEY_TOKEN` | ✅ | — | 接続先と Bot アカウントのトークン |
| `AI_PROVIDER` | — | `openai` | `openai` / `gemini` |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | 選んだ側のみ ✅ | — | |
| `DB_PATH` | — | `.cache/session.db` | 全ストア共通の SQLite |
| `INCIDENT_LOG_PATH` / `ERROR_LOG_PATH` | — | `.cache/incident.log` / `.cache/error.log` | NDJSON |
| `HEARTBEAT_PATH` / `HEARTBEAT_INTERVAL_MS` | — | `.cache/heartbeat.json` / `30000` | ウォッチドッグ用 |
| `NODE_ENV` / `LOG_LEVEL` | — | `development` / `info` | |
| `DEFAULT_CHARACTER_NUM` | — | `000` | 標準担当 |
| `ADMIN_USER_IDS` | — | 空 | 管理者コマンド（カンマ区切り） |
| `RATE_LIMIT_REPLY_COOLDOWN_MS` | — | `0`（無制限） | 同一ユーザーへの返信間隔。`1800000` のまま運用して返信が止まった事故あり |
| `RATE_LIMIT_GLOBAL_PER_HOUR` | — | `30` | 返信の全体上限。自発投稿とゲームの手番は対象外 |
| `ENABLE_GLOBAL_TL` | — | `false` | グローバル TL のハッシュタグ検出 |
| `TYPESET_PYTHON` | — | 空 | 数式画像の Python（空なら画像なし） |
| `DOWNTIME_NOTICE_THRESHOLD_MS` / `_COOLDOWN_MS` / `_MAX_MS` | — | 30 分 / 6 時間 / 7 日 | 復旧通知 |

---

## レートリミット設計

| 対象 | 上限 | 実装 |
| --- | --- | --- |
| 同一ユーザーへの返信 | `RATE_LIMIT_REPLY_COOLDOWN_MS` | `RateLimiter.canReply` |
| 返信の全体上限 | `RATE_LIMIT_GLOBAL_PER_HOUR` 件/時 | `RateLimiter`（1 時間ウィンドウ）。ゲームの手番は `countsTowardGlobalCap:false` |
| 自発投稿・定期出題・記念日投稿 | RateLimiter を通らない | スケジューラのクールダウン 1〜2 時間とスロットキーで抑制 |
| TL リアクション | ユーザー 1 時間 1 回・全体 20 回/時 | `timeline.ts` 内の Map／配列 |
| グローバル TL リアクション | ユーザー 1 時間 1 回 | `global-tl.ts` 内の Map |
| タスク通知 | 5 分ごと最大 5 件 | `task-scheduler.ts` |
| フォローバック | 同一ユーザー 5 分 | `follow.ts` |

---

## ログファイル

| ファイル | 中身 |
| --- | --- |
| `.cache/incident.log` | ハラスメント検知（全レベル）: `timestamp` / `level` / `noteId` / `userId` / `userHandle` / `noteCreatedAt` / `text`。保持期間は運用で決める（[rights-and-privacy-review.md](./rights-and-privacy-review.md)） |
| `.cache/error.log` | `error` / `warn` レベル |
| `.cache/heartbeat.json` | `{ ts, wsConnected, lastConnectedAt, uptimeSec }` |
| `.cache/watchdog.log` | VM 内ウォッチドッグの再起動記録 |
| `.cache/typeset/<sha1>.png` | 数式画像のキャッシュ |

```bash
tail -n 20 .cache/incident.log
grep '"level":3' .cache/incident.log        # L3 だけ
grep '"level":"error"' .cache/error.log
```

---

## デバッグツール（`tools/`）

| スクリプト | 用途 |
| --- | --- |
| `fetch-misskey-notes.mjs --limit 20` | Bot の直近投稿（`.env` の MISSKEY_HOST/TOKEN。dotenv 非依存） |
| `fetch-misskey-emojis.mjs --filter Secvier` | インスタンスのカスタム絵文字一覧（`--category` も可） |
| `fetch-vm-logs.mjs --target all --lines 100` | VM の pm2/error/incident ログを SSH 取得（`.env` の GCP_SSH_HOST/USER、鍵 `~/.ssh/deploy_key_gha`） |
| `vm-watchdog.mjs --dry-run` | ウォッチドッグの判定だけ実行 |
| `check-ctrl.mjs` | 生の制御文字の混入検出（`npm test` の先頭） |
| `sanitize-chat-archive.mjs --dry-run` | 対話アーカイブの伏字化 |

テストは `npm test`（check:ctrl → build → vitest run。コンパイル済み `dist` を対象）。2026-10-04 時点 11 ファイル / 191 件。
