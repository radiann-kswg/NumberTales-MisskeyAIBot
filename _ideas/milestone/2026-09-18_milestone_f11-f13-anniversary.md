# マイルストーン: F-11 誕生日お祝い / F-13 季節・記念日イベント投稿

> 作成日: 2026-09-18
> ステータス: **実装済み 🔧**（typecheck・lint・vitest 通過。実機確認待ち）
> 昇進元アイデア: [`_ideas/future-plan/F-11-F-13-birthday-events.md`](../future-plan/F-11-F-13-birthday-events.md)
> 対象: **F-11-A（ユーザー誕生日）/ F-11-B（キャラクター誕生日）/ F-13（季節・記念日イベント）**
> 対象外: **F-11-C（他タイトルのキャラクター誕生日）** — creations-db のタイトル横断データ拡充待ちのため未昇進

---

## 概要

「日付ベースの自動発火」を 1 本のフックに統合する。毎朝の自発投稿スロットで今日の日付を照合し、

1. **ユーザーの誕生日**（登録済みのみ）→ 本人宛てにメンション投稿
2. **キャラクターの記念日**（`AnivDay`）→ 公開投稿でお祝い
3. **季節・記念日イベント**（静的定義）→ 公開投稿

を配信する。1〜3 は同じ朝の 1 回で処理し、**その日は通常の朝の自発投稿の代わりに**記念日投稿を出す（連投回避）。

---

## 設計判断（アイデアメモからの変更点）

| 項目 | アイデアメモの案 | 本 milestone での決定 | 理由 |
| --- | --- | --- | --- |
| カレンダーイベント | `calendar_events` テーブル＋起動時データ投入 | **`CALENDAR_EVENTS` const 配列**（`features/anniversary.ts`） | 静的データを DB に入れると「起動時シード」「重複投入防止」「マイグレーション」が要る。値が変わらないものにテーブルは要らない |
| イベントの動的追加 | クライアントが手動追加 | **見送り** | 追加要望が出たときに足す（YAGNI）。現状は定数配列を編集すれば済む |
| キャラ誕生日の情報源 | 「フィールド名は実装時に確認」 | **`AnivDay`**（`[{Day:{Month,DayOfMonth}, DayAbout_JP, DayAbout_EN}]`） | 実データで確認済み。既に `getReleasedCharacters()` がメモリに載せているので追加取得は不要 |
| 誕生日の数秘 | F-10 エンジェルナンバー連携 | **誕生数（月日の数字和を縮約）のみ** | F-10 は未実装。既存 `reduceToSingleDigit()` の再利用で自己完結させ、F-10 実装後に解釈文を足せるようにする |
| Bot の開発記念日 | 「クライアントが日付を指定」 | **5/25**（初コミット 2026-05-25） | `CALENDAR_EVENTS` の 1 行なので変更したければ書き換えるだけ |

---

## F-11-A: ユーザーの誕生日

### プライバシー方針（重要）

AGENTS.md の設計方針「**ユーザー個人情報の永続保存は行わない**」に対する明示的な例外として、
以下の条件を満たす範囲でのみ保存する。

- **年は保存しない**（月日のみ）。年齢の推測・言及も行わない
- **オプトイン**。ユーザーが自分から申告したときだけ保存する
- **いつでも削除できる**。「誕生日を忘れて」等で 1 コマンド削除（`birthday-forget` intent）
- 通知に必要な `username` / `user_host` のみ併せて保持する（F-12 `TaskStore` と同じ理由・同じ範囲）

### DB 設計

```sql
CREATE TABLE IF NOT EXISTS user_birthdays (
  user_id    TEXT PRIMARY KEY,
  month      INTEGER NOT NULL,   -- 1〜12
  day        INTEGER NOT NULL,   -- 1〜31
  username   TEXT,               -- 通知メンション用
  user_host  TEXT,               -- リモートユーザーのホスト（ローカルは null）
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_birthdays_date ON user_birthdays (month, day);
```

### 登録・削除フロー

```
ユーザー: 「私の誕生日は7月7日です」「誕生日登録したい、6/15生まれ」
→ parseBirthdayInput() が月日を抽出 → UserBirthdayStore.set()
→ 会話相手キャラが「覚えたよ。7月7日だね」と返す（誕生数も添える）

ユーザー: 「誕生日を忘れて」「誕生日の登録を削除して」
→ UserBirthdayStore.delete() → 「忘れたよ」と返す
```

**日付が読み取れなかった場合**は保存せず、「月日を教えて」と聞き返す（誤登録を作らない）。
**実在しない日付**（13月/2月30日等）は登録を拒否する。2/29 は登録を許可し、平年は 2/28 に前倒しで祝う。

### お祝いフロー

朝の記念日チェックで `listByDate(月, 日)` に該当したユーザーへ、
**会話相手キャラクター**（`ActiveCharacterStore.resolve`・F-12B のタスク通知と同じ解決）が
`postToUser()`（`visibility: home`）でメンション投稿する。

---

## F-11-B: キャラクターの記念日

### 情報源

`_creations-db` の `db_Primary.json` → `AnivDay`。`getReleasedCharacters()`（`Progress === 'released'`）
が対象なので、**未公開キャラは自動的に除外**される（非公開設定の考慮は済み）。`AnivDay` 自体が
無いキャラ（released 92 件中 1 件）は素通りする。

```jsonc
"AnivDay": [
  { "Day": { "Month": 1, "DayOfMonth": 1 }, "DayAbout_JP": "開発記念", "DayAbout_EN": "..." },
  { "Day": { "Month": 9, "DayOfMonth": 1 }, "DayAbout_JP": "第一リリース記念(劇中)", "DayAbout_EN": "..." }
]
```

### 実データの分布（2026-09-18 時点・released 92 件）

- 記念日を持つ日は **366 日中 97 日**（＝ 4 日に 1 日程度しか発火しない）
- 1 日あたり最大 **2 件**（`1/2` と `9/7`）。件数上限は設けない
- `DayAbout_JP` の内訳: `開発記念` 91 件／劇中記念日 8 件（第一リリース記念・加護観測記念 等）

**`開発記念` を「誕生日」として扱い**、それ以外の `DayAbout_JP` は「記念日」として文面を変える。

### 投稿フロー

`STATE_KEY_SCHEDULER_CHAR`（週次担当キャラ）が LLM でお祝い文を生成して公開投稿する。
**担当キャラ自身の記念日だった場合は、本人が「私の誕生日だよ」と自己申告する体**でプロンプトを切り替える。

---

## F-13: 季節・記念日イベント

`features/anniversary.ts` の `CALENDAR_EVENTS` 定数（`{month, day, name, hint}`）で定義する。

| 日付 | イベント名 | 投稿コンセプト |
| --- | --- | --- |
| 1/1 | お正月 | 新年の数字占い・今年のナンバーテールズ的一文字 |
| 2/3 | 節分 | 厄を払う数字・豆まき演出 |
| 2/14 | バレンタイン | フォロワーへのメッセージ |
| 3/14 | π の日 | 3.14… をネタにした数学トーク |
| 3/21 | 春分の日 | 季節の変わり目・サイクルの数字（9 や 1） |
| 4/1 | エイプリルフール | 数字にまつわる「嘘」ネタ（軽め） |
| 5/25 | Bot 開発記念日 | 「私が生まれた日」（担当キャラ視点） |
| 7/7 | 七夕 | 7 の意味「精神性・直観」と星に願う演出 |
| 11/11 | ポッキーの日 / エンジェルナンバーの日 | ゾロ目 1111 は特別なエンジェルナンバー |
| 12/25 | クリスマス | 2+5=7「完成の数字で締めくくる一年」 |
| 12/31 | 大晦日 | 9 のエネルギー「サイクルの完結・手放しと再生」 |

> 春分の日は年によって 3/20 になるが、**固定 3/21 で運用する**（毎年の暦計算を持ち込まない）。

---

## 共通スケジューラー

`PostScheduler.tick()` の**朝スロット（6〜8 時）**に分岐を 1 つ足す。

```
tick()
 ├ F-16 定期出題（8/12/16/20 時）           ← 既存
 ├ getActiveSlot() / クールダウン判定        ← 既存
 ├ 月曜 7 時: 就任挨拶                       ← 既存
 ├ 朝スロット: 記念日チェック（本 milestone）← 今日まだ実施していなければ
 └ 通常の時間帯自発投稿                      ← 既存
```

- 重複防止は `STATE_KEY_ANNIVERSARY_LAST_DATE`（`'YYYY-MM-DD'` JST）で行う。
  **投稿前に日付を記録**してから配信する（配信中に例外が出ても同日に再送しない）
- 該当が 1 件も無い日は日付キーだけ更新して `return` せず、**通常の朝投稿へフォールスルー**する
  （記念日が無い日＝ 4 日のうち 3 日は今まで通りの朝の自発投稿が出る）
- ⚠️ 月曜 7 時の就任挨拶と同じスロットに同居する。就任挨拶の分岐を**必ず先**に置くこと

---

## 変更・新規ファイル

| ファイル | 種別 | 内容 |
| --- | --- | --- |
| `src/features/anniversary.ts` | 新規 | `CALENDAR_EVENTS` 定数・日付照合・`parseBirthdayInput()`・`birthdayNumber()`（純関数のみ） |
| `src/storage/birthday.ts` | 新規 | `UserBirthdayStore`（`user_birthdays` テーブル） |
| `src/bot/scheduler/anniversary.ts` | 新規 | 朝の配信処理（LLM 生成・投稿）。`PostScheduler` から呼ぶ |
| `src/bot/character/loader.ts` | 変更 | `CharacterRecord` に `AnivDay` を追加 |
| `src/bot/classifier/intent.ts` | 変更 | `birthday-register` / `birthday-forget` を追加 |
| `src/bot/handlers/mention.ts` | 変更 | 登録・削除ハンドラ（`affinity-check` と同じ形） |
| `src/bot/scheduler/index.ts` | 変更 | 朝スロットの分岐・`birthdayStore` を deps に追加 |
| `src/storage/bot-state.ts` | 変更 | `STATE_KEY_ANNIVERSARY_LAST_DATE` |
| `src/index.ts` | 変更 | `UserBirthdayStore` の初期化・DI・close |
| `test/anniversary.test.ts` | 新規 | 日付パース・照合・誕生数・2/29 の回帰テスト |

---

## テスト観点

- `parseBirthdayInput()`: 「7月7日」「7/7」「07/07」「７月７日」（全角）／実在しない日付の棄却
- `findCharacterAnniversaries()`: `開発記念` と劇中記念日の区別・`AnivDay` 無しキャラの素通り
- `findCalendarEvents()`: 定義日でヒット・非定義日で空
- `birthdayNumber()`: 月日の数字和の縮約（マスターナンバー 11/22 は縮約しない）
- 2/29 登録 → 平年は 2/28 に発火

---

## 今後の拡張（本 milestone の対象外）

- **F-11-C**: 他タイトルのキャラクター誕生日（creations-db のタイトル横断データ拡充後）
- **F-10 連携**: エンジェルナンバーの解釈文を誕生日メッセージの CW に添える
- **F-14 連携**: 誕生日お祝いに反応したら親密度を加算する
- **イベントの動的追加**: クライアントが日付を指定して記念日を登録する（要望が出てから）
