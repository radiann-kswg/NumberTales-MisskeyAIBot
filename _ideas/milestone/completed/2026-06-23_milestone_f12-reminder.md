# F-12 / F-12B: タスク＆スケジュール管理 + 信頼度システム — 設計仕様

> 作成日: 2026-06-23
> 更新日: 2026-07-03（bot-spec側の記述を本ドキュメントに合わせて更新・前提機能Aとの整合確認を追記）
> ステータス: **完了 ✅**（実装確認日: 2026-07-03・Phase A・B とも実装済み。`npm run typecheck`/`lint`/`build`
> 通過・モック AIProvider によるスモークテスト確認済み。Phase C は仕様書自身が「実装時期未定」としており対象外）
> 元アイデア: [`future-plan/confirmed-milestone/F-12-reminder.md`](../../future-plan/confirmed-milestone/F-12-reminder.md)
> 安全設計参照: [`bot-spec/05_bot-safety-design.md`](../../bot-spec/05_bot-safety-design.md)
> **正式仕様**: 2026-07-03、`_ideas/bot-spec/01_feature-specs.md` のF-12節を本ドキュメント（拡張版）に合わせて更新済み。
>
> **2026-07-03 追記**: 本ドキュメント策定前に実装していた F-12 MVP（`reminders` テーブル・
> `reminder-set/list/cancel`）は、本ドキュメントの Phase A 実装により**完全に置き換えられ、削除済み**。
> `reminders` テーブル・関連コードはリポジトリに残っていない（MVP は develop ブランチにのみ存在し
> 本番未デプロイだったため、データ移行は不要だった）。

---

## 既存機能との整合確認（2026-07-03）

- **前提機能A（キャラクタープロンプト個性化強化）**: 下記 F-12B「将来の機能アンロック」で参照している
  `Numerospec.Kabbalah`・趣味/特技フィールドは、既に実装済みの `CharacterRecord`（`Hobby`/`SpecialSkill`/`NumerospecAbout`等、
  [`2026-06-16_milestone_character-specialization-and-numerology-consultation.md`](./2026-06-16_milestone_character-specialization-and-numerology-consultation.md) 参照）と整合している。
  Phase C（将来拡張）着手時にあらためてフィールド名を突き合わせる。
- Phase B の `TrustContext` を `buildCharacterSystemPrompt()` に注入する設計は、前提機能Aの専門性セクションと
  並列で機能する想定（互いに競合しない）。

---

## 概要

### F-12: タスク＆スケジュール管理

ユーザーが ToDoリスト・スケジュール・リマインダーをメンション経由で登録・管理できる機能。
単純な「〇時間後に教えて」だけでなく、期日・優先度・難易度を持つタスクとして管理する。
ナンバーテールズの「主従契約」世界観のもと、担当キャラクターが主人のタスクを管理・進捗報告する。

### F-12B: 信頼度システム

タスク完了・日々の会話を通じてユーザーごとの「信頼度」が蓄積するシステム。
信頼度に応じてキャラクターの口調・演出が変化する（`ConversationPattern` ベース）。
藍ちゃんの好感度システムに相当する機能。

---

## F-12: 安全設計チェックリスト

| 項目 | 方針 |
|-----|-----|
| 公開範囲 | `home`（タスク通知・リマインド本文も `home`） |
| ランダム値生成 | 不使用（時刻は LLM で解析・コード側で `Date` 計算） |
| 利用制限 | 1 ユーザー同時 10 件まで・最短 1 分後・最長 365 日以内 |
| 制限時の応答 | キャラクターの口調で自然に断る（ルール提示しない） |
| スケジューラー安全弁 | 1 回の実行で処理する件数を `MAX_PROCESS_PER_RUN = 5` で上限設定 |
| LLM にユーザーデータを委ねない | タスク管理は SQLite で行い、LLM には内容・文脈のみ渡す |
| グローバルレートリミッタ | スケジューラーからの投稿は `RATE_LIMIT_GLOBAL_PER_HOUR` の対象 |

---

## F-12: タスク種別とライフサイクル

### タスク種別（remind_type）

| 種別 | 説明 | 完了トリガー |
|-----|------|------------|
| `todo` | 期日なし純粋 ToDo | ユーザーの明示完了のみ |
| `alert` | 通知あり（時刻/期日指定）、通知後もタスクは残る | ユーザーの明示完了のみ |
| `schedule` | 予定・スケジュール（通知 = イベント発生）、通知が完了トリガーになる | 通知送信時に自動完了 |

**判定基準（LLM が分類）**:
- 「〇〇をやるのを忘れないようにして」「〇時に〇〇を教えて」→ `alert`
- 「〇〇がある」「〇〇の日」「打ち合わせ/会議/イベント」→ `schedule`
- 期日・時刻指定なし → `todo`

### タスクのステータス遷移

```
todo ──[ユーザー完了 / schedule 通知]──> done
todo ──[ユーザーキャンセル]──────────── cancelled
(done / cancelled からの復活は対応外)
```

---

## F-12: DB 設計

### tasks テーブル（reminders を廃止・置き換え）

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT    NOT NULL,
  title        TEXT    NOT NULL,            -- タスク名・内容（自然文）
  due_at       INTEGER,                     -- 期日 Unix timestamp (UTC 秒)。任意
  remind_at    INTEGER,                     -- 通知日時 Unix timestamp (UTC 秒)。任意
  remind_type  TEXT    NOT NULL DEFAULT 'todo',  -- 'todo' | 'alert' | 'schedule'
  status       TEXT    NOT NULL DEFAULT 'todo',  -- 'todo' | 'done' | 'cancelled'
  priority     INTEGER NOT NULL DEFAULT 2,  -- 1=高 2=中 3=低
  difficulty   INTEGER NOT NULL DEFAULT 2,  -- 1=易 2=普通 3=難
  created_at   INTEGER NOT NULL,
  completed_at INTEGER,                     -- 完了日時（明示 or schedule 自動）
  note_id      TEXT                         -- 登録確認の返信ノートID
);

CREATE INDEX IF NOT EXISTS idx_tasks_user    ON tasks (user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_remind  ON tasks (remind_at, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due     ON tasks (due_at, status);
```

---

## F-12: 意図分類

`src/bot/classifier/intent.ts` に追加:

```typescript
// Intent 型に追加
'task-add' | 'task-list' | 'task-done' | 'task-cancel'

const TASK_ADD_PATTERNS: RegExp[] = [
  /(\d+)\s*(時間|分|日)後に.*(教えて|知らせて|リマインド|やること)/,
  /(明日|あさって|今日).*(に|の)\s*\d+時.*(教えて|リマインド|予定|がある)/,
  /(.+)を?(やらないと|忘れ(そう|ないで)|タスクに?追加|登録して|覚えておいて)/,
  /(.+)(の?予定|がある|打ち合わせ|会議|イベント).*(登録|追加|覚えて)/,
  /\/task\s+add\b/i,
  /\/remind\b/i,
];

const TASK_LIST_PATTERNS: RegExp[] = [
  /タスク(を?見せて|一覧|確認|リスト)/,
  /残り(のタスク|やること|どれくらい)/,
  /進捗(は?|を教えて|確認)/,
  /(何%|何割|どのくらい)?(終わ|完了|でき)(た|てる)/,
  /\/task\s+list\b/i,
];

const TASK_DONE_PATTERNS: RegExp[] = [
  /(.+)(が?|を?)(終わ|完了|でき|やり終え)(った|た|ました)/,
  /タスク?\s*(\d+)\s*(番)?を?(完了|done|終わり|終わった)/,
  /\/task\s+done\b/i,
];

const TASK_CANCEL_PATTERNS: RegExp[] = [
  /タスク?.*(キャンセル|消して|削除|なくして)/,
  /(.+)のタスクを?(消して|キャンセル|削除)/,
  /タスク?\s*(\d+)\s*(番)?を?(消して|キャンセル|削除)/,
  /\/task\s+cancel\b/i,
];
```

---

## F-12: 優先度・難易度パラメータ

### 指定方法

ユーザーが自然文で指定するか、未指定なら LLM が内容から推定（デフォルト: 中/普通）。

```
優先度キーワード: 「急ぎ」「緊急」「重要」→ 高(1)
                「普通」「通常」→ 中(2)
                「後でいい」「余裕あり」「気が向いたら」→ 低(3)

難易度キーワード: 「大変」「難しい」「複雑」「時間かかる」→ 難(3)
                「普通」→ 普(2)
                「簡単」「すぐできる」「ちょっと」→ 易(1)
```

### 進捗 % の計算（重み付き）

```
priority_weight = { 1: 3, 2: 2, 3: 1 }   # 高=3点 中=2点 低=1点
difficulty_weight = { 1: 1, 2: 2, 3: 3 }  # 易=1点 普=2点 難=3点

task_weight(t) = priority_weight[t.priority] × difficulty_weight[t.difficulty]

weighted_total = Σ task_weight(non-cancelled tasks)
weighted_done  = Σ task_weight(done tasks)
progress%      = floor(weighted_done / weighted_total × 100)
```

- タスクがすべてキャンセル or 0件 → 「タスクなし」表示
- 重み付きのため「簡単な低優先タスクを大量に完了」しても % は上がりにくい

---

## F-12: ゲームフロー

### タスク追加時（task-add）

```
[1] LLM でタイトル・日時・remind_type・優先度・難易度を抽出
    （未指定項目はデフォルト値またはコンテキストから推定）

[2] バリデーション
    - remind_at / due_at が設定されている場合: 最短 1 分後・最長 365 日
    - 同時 10 件上限チェック

[3] SQLite に保存（status='todo'）

[4] LLM で登録確認メッセージ生成（40文字以内）
    → 例: 「了解、設計書のタスクを追加したよ。優先度: 高・難易度: 難だね」

[5] 返信（home）
```

### 通知時（スケジューラー）

```
[1] 5分間隔で remind_at <= now AND status='todo' を確認
    （MAX_PROCESS_PER_RUN = 5）

[2] remind_type == 'schedule' の場合:
    → status を 'done'・completed_at を now に更新
    → F-12B 信頼度に +2 pt 付与

    remind_type == 'alert' の場合:
    → status は 'todo' のまま維持

[3] LLM でリマインドメッセージ生成（40文字以内）
    → schedule: 「〇〇の時間だよ！うまくいくといいね」
    → alert:    「〇〇のリマインドだよ。まだ終わってない？」

[4] @{username} 宛てに投稿（home）
```

### 期日超過通知（スケジューラー・alert/todo のみ）

```
[1] due_at <= now AND status='todo' を確認（remind_at とは別で1回だけ）
[2] LLM で期日超過メッセージ生成（40文字以内）
    → 「〇〇の期日が過ぎているよ。まだ終わってない？」
[3] remind_at を null に更新（重複通知防止）して投稿
```

### タスク完了時（task-done）

```
[1] LLM または番号でタスク特定
    → 一意に特定できない場合: 候補リスト提示
[2] status を 'done'・completed_at を now に更新
[3] F-12B 信頼度にポイント付与:
    +difficulty_pts × priority_bonus（詳細は F-12B 参照）
[4] LLM で完了メッセージ生成
    → 「設計書、おつかれ！ちゃんと終わったんだね」
```

### タスク一覧・進捗照会時（task-list）

```
[1] status='todo' のタスクを priority ASC, due_at ASC でソートして取得
[2] 重み付き進捗% を計算
[3] 本文: 進捗% + 件数サマリー（キャラの口調で）
[4] CW 内: 番号付きリスト（件数が多い場合は期日近い順上位 5 件）
    例:
    ① [高・難] 設計書を書く（期日: 6/25）
    ② [中・普] メール返信（6/24 まで）
    ③ [低・易] 本棚の整理
    （全 7 件中 3 件 / 進捗 38%）
```

### タスクキャンセル時（task-cancel）

```
[1] タスク特定（番号または件名）
[2] status を 'cancelled' に更新
[3] LLM でキャンセル確認メッセージ生成
```

---

## F-12: LLM プロンプト設計

### タスク解析（登録時）

```
現在の日時（JST）: {now_jst}
ユーザーの入力: {text}

以下の JSON で返してください:
{
  "title": "タスク名（短くまとめた自然文・30文字以内）",
  "remind_at_iso": "通知日時 ISO 8601 UTC（不要なら null）",
  "due_at_iso":    "期日 ISO 8601 UTC（不要なら null）",
  "remind_type":   "todo | alert | schedule",
  "priority":      1 | 2 | 3,   // 1=高 2=中 3=低
  "difficulty":    1 | 2 | 3,   // 1=易 2=普通 3=難
  "valid":         true | false,
  "error":         "too_short | too_far | unparseable | null"
}
```

### 登録確認メッセージ

```
{キャラクターシステムプロンプト}
タスク登録の確認メッセージを40文字以内で返してください。
タスク: {title}、優先度: {priority}、難易度: {difficulty}
期日: {due_jst or "なし"}、通知: {remind_jst or "なし"}
```

### リマインドメッセージ

```
{キャラクターシステムプロンプト}
タスクの通知・リマインドメッセージを40文字以内で返してください。
タスク: {title}（種別: {remind_type}）
schedule の場合: イベント発生・達成を祝う or 激励
alert の場合: まだ残っていることを思い出させる
```

---

## F-12B: 信頼度システム

> **実装優先度**:
> - **即実装**: `ConversationPattern` を使った口調・演出変化
> - **将来対応**: Numerospec カバラ加護・趣味特技に応じた機能アンロック

### DB 設計

```sql
CREATE TABLE IF NOT EXISTS user_trust (
  user_id          TEXT PRIMARY KEY,
  trust_points     INTEGER NOT NULL DEFAULT 0,
  tasks_completed  INTEGER NOT NULL DEFAULT 0,  -- 完了タスク数累計
  chat_days        INTEGER NOT NULL DEFAULT 0,  -- 会話した日数（重複なし）
  last_chat_date   TEXT,     -- 'YYYY-MM-DD' JST（1日1回ボーナス防止）
  last_updated     INTEGER NOT NULL
);
```

### 信頼度ポイントの加算

| イベント | ポイント |
|---------|---------|
| タスク完了（易） | +5 |
| タスク完了（普通） | +10 |
| タスク完了（難） | +15 |
| 優先度ボーナス（高） | +5 追加 |
| 優先度ボーナス（中） | +2 追加 |
| スケジュール通知受理完了 | +2 |
| 1日1回会話ボーナス | +3 |

### 信頼度レベル

| レベル | 名称 | ポイント目安 | 備考 |
|------|------|------------|------|
| Lv.0 | 初対面 | 0〜49 | デフォルト |
| Lv.1 | 顔見知り | 50〜149 | |
| Lv.2 | 信頼 | 150〜299 | |
| Lv.3 | 盟友 | 300〜499 | |
| Lv.4 | 主従の契り | 500〜 | |

### 演出変化（ConversationPattern ベース）【即実装対象】

`CharacterRecord.ConversationPattern` に定義された会話パターンを信頼度に応じて選択する。
信頼度レベルをシステムプロンプトに渡し、LLM が「信頼関係の深さ」を演出に反映させる。

```typescript
// buildCharacterSystemPrompt() への追加パラメータ案
interface TrustContext {
  level: 0 | 1 | 2 | 3 | 4;
  label: string;  // 'initial' | 'acquaintance' | 'trusted' | 'ally' | 'contract'
}

// システムプロンプトへの組み込み文言（案）
// 「このユーザーとの信頼度は「{label}」です。
//   ConversationPattern を参照しながら、関係の深さに応じた自然な口調で接してください。」
```

### 将来の機能アンロック（ロードマップ）

信頼度と以下のキャラクター属性を組み合わせた機能拡張（実装時期未定）:

| 条件 | 解放機能案 |
|-----|----------|
| Lv.2 以上 + `Numerospec.Kabbalah` を持つキャラ | カバラ数字診断の詳細版 |
| Lv.3 以上 + 趣味/特技が一致するタスク | タスクへの「得意分野コメント」付与 |
| Lv.4 | キャラクター固有の特別演出（設定依存・未公開） |

> ※ キャラクター属性の詳細は `_creations-db/data/Works_NumberTales/` を参照

---

## 実装ファイル構成

```
src/
  features/
    f12/
      task-parser.ts       # LLM 委譲の日時・パラメータ解析
      task-handler.ts      # add/list/done/cancel 各処理・LLM メッセージ生成
      trust-store.ts       # 信頼度ポイント加算・レベル判定
  storage/
    session.ts             # tasks テーブル追加・CRUD ヘルパー
                           # user_trust テーブル追加
  bot/
    classifier/intent.ts   # task-add / task-list / task-done / task-cancel 追加
    handlers/mention.ts    # task ディスパッチ追加・trust context 注入
    character/prompt-builder.ts  # TrustContext 対応（F-12B 実装時）
    scheduler/index.ts     # checkTaskReminders() 追加（5分間隔）
    reactor/emoji-reaction-map.ts  # task-* リアクション追加
```

---

## 実装ステップ（フェーズ分け）

### Phase A: 基本タスク管理（F-12 コア）

1. `src/storage/session.ts` — `tasks` テーブル追加・CRUD ヘルパー
2. `src/features/f12/task-parser.ts` — LLM 日時・パラメータ解析
3. `src/features/f12/task-handler.ts` — add/list/done/cancel ロジック
4. `src/bot/classifier/intent.ts` — 4 インテント追加
5. `src/bot/handlers/mention.ts` — ディスパッチ追加
6. `src/bot/scheduler/index.ts` — `checkTaskReminders()` 追加
7. `src/bot/reactor/emoji-reaction-map.ts` — リアクション追加
8. `npm run typecheck` で確認

### Phase B: 信頼度演出（F-12B 基礎）

1. `src/storage/session.ts` — `user_trust` テーブル追加
2. `src/features/f12/trust-store.ts` — ポイント加算・レベル判定
3. `src/bot/character/prompt-builder.ts` — `TrustContext` パラメータ追加
4. `src/bot/handlers/mention.ts` — trust context の取得・プロンプト注入
5. タスク完了・会話ボーナス時に信頼度更新を連動

### Phase C: 将来拡張（未定）

- Numerospec カバラ加護による機能アンロック
- キャラクター趣味特技連携
- Lv.4 固有演出

---

## 設計検討事項（解消済み・2026-07-03 実装時に決定）

| 項目 | 決定内容 |
|-----|-----|
| タスク特定の曖昧一致 | 複数件ヒット時は番号付きで候補提示し、再指定を促す（`findCandidatesByTitle`/`formatCandidateList`）。 |
| 期日超過の重複通知防止 | `remind_at` を流用せず、専用の `due_notified` フラグ列を新設（`remind_at` 本来の意味を破壊しないための安全側の逸脱）。 |
| 会話ボーナスのカウント対象 | 意味のある交流（雑談・創作相談・ヌメロジー相談・F-06計算/ダイス/占い/うんちく・ミニゲーム全種・タスク操作）に限定。挨拶・フォーム切替・ハラスメント対応・キャラ切替は対象外。 |
| 信頼度の時間減衰 | 今回は含めない（Phase B は基礎のみ）。将来検討。 |
| タスク一覧の上限表示 | 仕様書どおり CW 内 5 件（期日近い順）で確定。 |

## 実装時の逸脱事項

- **ファイル配置**: 仕様書案の `features/f12/`・`storage/session.ts` 追記ではなく、リポジトリの既存流儀
  （`storage/` に関心事ごとの専用ストアクラス、`features/<機能名>/` に抽出・整形ロジック）に合わせて
  `storage/task.ts`（`TaskStore`）・`storage/trust.ts`（`TrustStore`）・`features/task/index.ts` として実装。
- **時刻の単位**: 仕様書は Unix 秒だが、コードベース全体の慣習（`Date.now()`）に合わせ**ミリ秒**で統一。
- **公開範囲**: `MisskeyClient.postToUser()`（旧 `remindUser`）で `visibility: 'home'` を実装（仕様書どおり）。
- **信頼度言及の抑制**: `buildCharacterSystemPrompt()` の信頼度注入文言に「信頼度について直接言及したり
  数値を口にしたりしないこと」という制約を追加（仕様書案には無いが、没入感を保つための安全側の追加）。
