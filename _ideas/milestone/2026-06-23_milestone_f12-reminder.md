# F-12: リマインダー機能 — 実装仕様

> 作成日: 2026-06-23
> ステータス: **着手** 🔧
> 元アイデア: [`future-plan/F-12-reminder.md`](../future-plan/F-12-reminder.md)
> 安全設計参照: [`bot-spec/05_bot-safety-design.md`](../bot-spec/05_bot-safety-design.md)

---

## 概要

ユーザーのメンションで「〇時間後に〇〇を教えて」と登録し、
時間になったら担当キャラクターがリマインドしに来る機能。
ナンバーテールズの「主人との主従契約」の世界観を体験できる差別化ポイント。

---

## 安全設計チェックリスト

| 項目 | 方針 |
|-----|-----|
| 公開範囲 | `home`（リマインド本文も `home`） |
| ランダム値生成 | 乱数不使用（時刻は LLM で解析・コード側で `Date` 計算） |
| 利用制限 | 1 ユーザー同時 3 件まで・最短 5 分後・最長 30 日以内 |
| 制限時の応答 | キャラクターの口調で自然に断る（ルール提示しない） |
| スケジューラー安全弁 | 1 回の実行で処理する件数を `MAX_PROCESS_PER_RUN = 5` で上限設定 |
| LLM にユーザーデータを委ねない | リマインダーの管理は SQLite で行い、LLM には内容のみ渡す |
| グローバルレートリミッタ | スケジューラーからの投稿は `RATE_LIMIT_GLOBAL_PER_HOUR` の対象 |

---

## 意図分類

`src/bot/classifier/intent.ts` に追加:

```typescript
// Intent 型に追加
'reminder-set' | 'reminder-list' | 'reminder-cancel'

const REMINDER_SET_PATTERNS: RegExp[] = [
  /(\d+)\s*(時間|分)後に.*(教えて|知らせて|言って|リマインド)/,
  /(明日|あさって|今日).*(に|の)\s*\d+時.*(教えて|知らせて|リマインド)/,
  /(.+)を.*(忘れそう|リマインド|覚えておいて)/,
  /(.+)のこと.*(時間|時|分)後に/,
  /\/remind\b/i,
];

const REMINDER_LIST_PATTERNS: RegExp[] = [
  /リマインダー(を?見せて|一覧|確認)/,
  /何を覚えてくれてる/,
  /登録(してる|済み)のリマインダー/,
];

const REMINDER_CANCEL_PATTERNS: RegExp[] = [
  /リマインダー.*(キャンセル|消して|削除)/,
  /(.+)のリマインダーを(消して|キャンセル)/,
  /\d+番のリマインダー/,
];
```

---

## セッション DB 拡張

`src/storage/session.ts` に `reminders` テーブルを追加:

```sql
CREATE TABLE IF NOT EXISTS reminders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  content     TEXT NOT NULL,
  remind_at   INTEGER NOT NULL,    -- Unix timestamp (UTC 秒)
  status      TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'done' | 'cancelled'
  created_at  INTEGER NOT NULL,
  note_id     TEXT                 -- 登録確認の返信ノートID（参照用）
);

CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders (user_id, status);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders (remind_at, status);
```

---

## 時間解析（LLM 委譲）

自然文のリマインド日時解析は LLM に委ねる（ルールベースでは相対指定が複雑なため）。

```typescript
// src/features/f12/time-parser.ts
interface ParsedReminder {
  content: string;       // リマインド内容（自然文）
  remind_at: number;     // Unix timestamp (UTC 秒)
  valid: boolean;        // 解析成功フラグ
  error?: string;        // エラー理由（invalid/too_short/too_far）
}

async function parseReminderText(text: string, now: Date): Promise<ParsedReminder> {
  // LLM に現在時刻（JST）と入力テキストを渡し、
  // JSON { content, remind_at_iso, valid, error } を返させる
}
```

LLM プロンプト:

```
現在の日時（JST）: {now_jst}
ユーザーの入力: {text}

リマインドの内容と日時を抽出して以下の JSON で返してください。
{
  "content": "リマインドする内容（短くまとめた自然文）",
  "remind_at_iso": "ISO 8601 形式（UTC）",
  "valid": true/false,
  "error": "too_short(5分未満) | too_far(30日超) | unparseable | null"
}
```

---

## バリデーション（コード側）

```typescript
const MIN_REMIND_OFFSET_SEC = 5 * 60;      // 5分
const MAX_REMIND_OFFSET_SEC = 30 * 24 * 3600; // 30日
const MAX_REMINDERS_PER_USER = 3;

function validateReminder(remind_at: number, now: number): 'ok' | 'too_short' | 'too_far' {
  const diff = remind_at - now;
  if (diff < MIN_REMIND_OFFSET_SEC) return 'too_short';
  if (diff > MAX_REMIND_OFFSET_SEC) return 'too_far';
  return 'ok';
}
```

---

## ゲームフロー

### 登録時（reminder-set）

```
[1] parseReminderText() で内容・日時を抽出

[2] バリデーション（5分未満・30日超・解析不能）
    → NG 時: キャラクターの口調でエラー理由を伝える

[3] 同時登録件数チェック（3件上限）
    → 超過時: キャラとして「今3つ覚えているから…」と断る

[4] SQLite に保存（status='pending'）

[5] LLM で登録確認メッセージ生成（30文字以内）
    → 例: 「了解、〇時〇分にちゃんと声かけるね。」

[6] 返信（home）
```

### リマインド時（スケジューラー）

```
[1] 5分間隔でスケジューラーが pending を確認（MAX_PROCESS_PER_RUN = 5 上限）

[2] remind_at <= now のものを抽出

[3] 担当キャラクター（activeCharacterStore の設定値 or デフォルト）の口調で
    リマインドメッセージを LLM 生成（40文字以内）

[4] `@{username}` 宛てに投稿（home 可視性）

[5] status を 'done' に更新
```

### 一覧確認時（reminder-list）

```
pending 件数と内容一覧をキャラクターの口調で返す
件数が 0 の場合も自然に伝える
```

### キャンセル時（reminder-cancel）

```
件名またはリスト番号で特定し、status を 'cancelled' に更新
キャラクターの口調で確認メッセージを返す
```

---

## LLM プロンプト設計

### 登録確認メッセージ

```
{キャラクターシステムプロンプト}
ユーザーへのリマインダー登録確認を30文字以内で返してください。
リマインド内容: {content}
リマインド時刻（JST）: {remind_at_jst}
キャラクターとして自然に「〇時〇分に声をかける」ことを伝えてください。
```

### リマインドメッセージ

```
{キャラクターシステムプロンプト}
リマインドの時間になりました。ユーザーへのリマインドを40文字以内で返してください。
リマインド内容: {content}
「主人/クライアント」への奉仕として、キャラクターらしく知らせてください。
```

---

## スケジューラー拡張

既存 `src/bot/scheduler/index.ts` にリマインダーチェックを追加:

```typescript
// 5 分間隔（既存スケジューラーのチェックサイクルに組み込む）
async function checkReminders(): Promise<void> {
  const MAX_PROCESS_PER_RUN = 5;
  const now = Math.floor(Date.now() / 1000);
  const dueReminders = db.prepare(
    "SELECT * FROM reminders WHERE status='pending' AND remind_at <= ? LIMIT ?"
  ).all(now, MAX_PROCESS_PER_RUN);

  for (const reminder of dueReminders) {
    // LLM メッセージ生成 → 投稿 → status='done' 更新
  }
}
```

---

## 実装ファイル構成

```
src/
  features/
    f12/
      time-parser.ts          # LLM 委譲の日時解析・バリデーション
      reminder-handler.ts     # set/list/cancel 各処理・LLM メッセージ生成
  storage/
    session.ts                # reminders テーブル追加
  bot/
    classifier/intent.ts      # reminder-set / reminder-list / reminder-cancel 追加
    handlers/mention.ts       # reminder ディスパッチ追加
    scheduler/index.ts        # checkReminders() 追加（5分間隔）
    reactor/emoji-reaction-map.ts  # reminder-set / reminder-list リアクション追加
```

---

## 実装ステップ

1. `src/storage/session.ts` — `reminders` テーブル追加・CRUD ヘルパー実装
2. `src/features/f12/time-parser.ts` — LLM 日時解析・バリデーション実装
3. `src/features/f12/reminder-handler.ts` — set/list/cancel・リマインドメッセージ生成
4. `src/bot/classifier/intent.ts` — 3 インテント追加
5. `src/bot/handlers/mention.ts` — ディスパッチ追加
6. `src/bot/scheduler/index.ts` — `checkReminders()` を既存ループに組み込み
7. `src/bot/reactor/emoji-reaction-map.ts` — リアクション追加
8. `npm run typecheck` で確認
