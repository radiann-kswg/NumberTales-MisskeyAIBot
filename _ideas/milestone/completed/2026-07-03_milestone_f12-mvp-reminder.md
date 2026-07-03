# F-12 MVP: シンプルリマインダー機能 — 実装仕様

> 作成日: 2026-07-03
> ステータス: **完了 ✅・その後 F-12/F-12B 本実装により置き換え済み 🔄**（実装確認日: 2026-07-03・
> `npm run typecheck` / `npm run lint` / `npm run build` 通過・モック AIProvider によるスモークテスト確認済み）
> 元アイデア: [`future-plan/confirmed-milestone/F-12-reminder.md`](../../future-plan/confirmed-milestone/F-12-reminder.md)（初版のシンプルな仕様）
>
> **2026-07-03 追記**: 本 MVP は同日中に [`2026-06-23_milestone_f12-reminder.md`](./2026-06-23_milestone_f12-reminder.md)
> （タスク＆スケジュール管理＋信頼度システム）の Phase A 実装により**完全に置き換えられた**。
> `reminders` テーブル・`storage/reminder.ts`・`features/reminder/index.ts`・`bot/scheduler/reminder-scheduler.ts`・
> `reminder-set/list/cancel` インテントはすべて削除済みで、リポジトリには存在しない。本ドキュメントは
> 実装当時の記録として保持する。

---

## 概要と経緯

`_ideas/milestone/2026-06-23_milestone_f12-reminder.md`（以下「拡張版ドキュメント」）は、当初のシンプルな
リマインダー案を「タスク＆スケジュール管理（優先度・難易度・進捗%・`remind_type`）＋ F-12B 信頼度システム」
へと大きく拡張したものだが、そのドキュメント自身が明記するとおり **まだ「設計中🔧（実装前の深堀り段階）」**
であり、実装には至っていない。

本 milestone は、拡張版ドキュメントとは別に、**元アイデア（`future-plan/confirmed-milestone/F-12-reminder.md`）
のシンプルな仕様のまま実装した MVP** を記録するものである。

- `reminders` テーブル（拡張版ドキュメントが「廃止・置き換え対象」とする旧テーブル名をそのまま使用）
- インテントは `reminder-set` / `reminder-list` / `reminder-cancel`（拡張版の `task-add/list/done/cancel` ではない）
- 優先度・難易度・`due_at`・`remind_type`・進捗% 計算・F-12B 信頼度システムは**含まない**

拡張版ドキュメント（タスク管理・信頼度システム）は今回のスコープ外。別途あらためて計画・実装する。
実装時は本 MVP の `reminders` テーブル・3インテントとの統合方針（置き換え or 共存）を要検討。

---

## 実装内容

### DB（`src/storage/reminder.ts` — `ReminderStore`）

```sql
CREATE TABLE IF NOT EXISTS reminders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  username    TEXT,
  user_host   TEXT,
  content     TEXT NOT NULL,
  remind_at   INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done','cancelled')),
  created_at  INTEGER NOT NULL,
  note_id     TEXT
);
```

- 上限: 1ユーザー同時3件まで、最短5分後・最長30日以内
- 完了・キャンセル済みレコードは7日経過で自動削除（`pruneOld()`）

### 自然文抽出（`src/features/reminder/index.ts`）

- `extractReminderRequest(text, ai, nowMs)`: 現在時刻（JST）をプロンプトに埋め込み、LLM に厳密 JSON
  （`{"content": "...", "remindAt": "..."}`）で内容・日時を抽出させる。パース不可・許容幅外はそれぞれ
  `unparseable` / `too-soon` / `too-far` として失敗を返す。
- `formatReminderList(reminders)`: 一覧表示用の整形（`1. 〇月〇日 〇時〇分 — 内容`）。
- `extractCancelTarget(text)`: 「○番」の番号指定を優先し、なければ内容部分一致で対象を特定する。

### 配信（`src/bot/scheduler/reminder-scheduler.ts` — `ReminderScheduler`）

- 5分間隔で `reminders.remind_at` 経過分を確認し、担当キャラクターの口調で LLM 生成したメッセージを配信。
- `MisskeyClient.remindUser()`（`visibility: 'specified'` + `visibleUserIds`）で本人にのみ届く個別ノートとして送信。
  ※ 拡張版ドキュメントは `visibility: 'home'` を想定しているが、個人的なリマインド内容が TL に流れないよう
  MVP では specified を採用した（差異点として記録）。
- `PostScheduler`（`scheduler/index.ts`）に子スケジューラーとして組み込み済み。

### 意図分類・ディスパッチ

- `src/bot/classifier/intent.ts`: `reminder-set` / `reminder-list` / `reminder-cancel` の3インテントとパターンを追加。
- `src/bot/handlers/mention.ts`: 3分岐（登録・一覧・キャンセル）を実装。LLM 呼び出し部分は try/catch で保護し、
  失敗時は定型フォールバック文言に倒す（D3-6/D3-7 実装時のクラッシュ教訓を踏まえた設計）。

---

## 実装ファイル一覧

```
src/
  storage/reminder.ts              # ReminderStore（新規）
  features/reminder/index.ts       # 抽出・整形関数（新規）
  bot/scheduler/reminder-scheduler.ts  # 配信スケジューラー（新規）
  bot/scheduler/index.ts           # PostScheduler に組み込み
  bot/classifier/intent.ts         # reminder-set/list/cancel 追加
  bot/handlers/mention.ts          # 3分岐・deps 追加
  bot/reactor/emoji-reaction-map.ts  # リアクション追加
  misskey/client.ts                # remindUser() 追加
  index.ts                         # ReminderStore 配線
```

## 検証方法

- `npm run typecheck` / `npm run lint`（既存ベースラインと同一、新規エラーなし）/ `npm run build`
- モック `AIProvider` を使った `.cache/debug-f12-reminder.mjs` で `extractReminderRequest`（正常系・too-soon・
  too-far・unparseable・コードブロック付き応答）・`ReminderStore` CRUD・`extractCancelTarget`・
  `formatReminderList` を実行確認。このスモークテストで `extractCancelTarget` の「の」除去漏れバグ
  （「薬のリマインダーをキャンセルして」→ クエリが「薬の」になり内容一致に失敗）を発見・修正した。
- 実機（VM上のPM2）でのリマインダー登録・配信確認はユーザー側で別途実施。
