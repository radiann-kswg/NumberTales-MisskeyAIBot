# GitHub 未解決問題トリアージ（2026-08-22） — NumberTales-MisskeyAIBot

自動実行（毎朝のGitHub未解決問題トリアージ）による生成物。**実コードの修正・commit/push は行っていません**（読み取り専用調査）。

- 全体サマリ: `D:\VisualStudio Code Userfile\100BeautiesLab_CreationsDB\_work_in_progress\2026-08-22_github-triage.md`
- 保存先はこのリポジトリの規約どおり `_tasks/github-triage/`。前回ログ: `2026-08-15_github-triage.md`

調査手段: Gmail 通知 / GitHub 読み取り専用 API（`list_issues` / `list_pull_requests` / `pull_request_read` / `list_commits`）/
ローカル読み取り（`git log` / `git status --porcelain` / ソース閲覧）。GitHubコネクタは正常に利用できました。

---

## 本日の状態

| 項目 | 状態 |
| --- | --- |
| OPEN Issue | ✅ 0 件（`list_issues(OPEN)` で実測） |
| OPEN PR | ✅ 0 件（`list_pull_requests(open)` で実測） |
| CI 失敗通知 | ✅ なし（`Deploy to GCP VM` の最後の失敗は 07-26。以降 27 日間ゼロ） |
| Dependabot | ✅ PR #36（postcss 8.5.20 → 8.5.26）は `740de25` で 08-15 04:48 UTC にマージ済み |
| **PR #37 の Copilot 指摘** | 🔴 **4 件すべて未解決** |

---

## 🔴 PR #37 の Copilot レビュー指摘 4 件 — 未対応

PR #37「chore: creations-db 追従・F-16 計算問題チャレンジ・deploy 手動実行対応を master へ反映」

- マージ: **2026-08-19 23:16 UTC**（`c7b1a5d`）
- Copilot レビュー着弾: **2026-08-19 23:18 UTC**（＝マージの 2 分後）
- `pull_request_read(get_review_comments)` 実測: 未解決スレッド **4 件**（`is_resolved: false` / `is_outdated: false`）
- `list_commits` 実測: master 先端は `c7b1a5d` のまま。**以降コミットなし＝1 件も反映されていない**

> GeneratorsAI PR #17 と同じ「レビュー前マージ」パターンです。Copilot レビューは非同期で数分遅れて届くため、
> **マージ前に 5 分待つ**か、`develop → master` はレビュー完了を待つ運用にすると取りこぼしが減ります。

---

### 指摘 1 🔴 高 — 公開出題の回答者記録がロストアップデートする

**場所**: `src/bot/handlers/mention.ts:736-739`（`handlePublicCalcQuizAnswer`）

```ts
botState.setState(
  STATE_KEY_CALC_QUIZ_PUBLIC,
  JSON.stringify({ ...quiz, answeredUserIds: [...quiz.answeredUserIds, event.userId] }),
);
```

`quiz` はこのハンドラに入る前に読んだ**スナップショット**です。`mentionQueues` はユーザー単位の直列化なので、
**別ユーザーの回答は並行実行されます**。read → append → write の間に他ユーザーが書き込むと、後勝ちで先の回答者が消えます。

実害（ローカル実測で該当箇所を確認済み）:

- 消えたユーザーは重複チェック（`quiz.answeredUserIds.includes(event.userId)`）をすり抜け、**1ユーザー1回制限が破れる**
- `characterAffinityStore.addPoints()` が同一ユーザーに**重複加算**される（`AFFINITY_DAILY_CAP` はあるが、上限内なら二重取り）

**提案（未適用・ponytail 準拠で最小差分）**:

`BotStateStore` に `updateState(key, updater)` を 1 本足し、読み取り〜書き込みを同期的に閉じる。
JS は単一スレッドなので、`await` を挟まない同期クロージャなら CAS もロックも要りません（＝最小の修正で十分）。

```ts
// BotStateStore
updateState(key: string, updater: (prev: string | null) => string): void {
  this.setState(key, updater(this.getState(key)));   // 同期。間に await が無いので割り込まれない
}

// mention.ts — 重複チェックも updater の中へ寄せる
let alreadyAnswered = false;
botState.updateState(STATE_KEY_CALC_QUIZ_PUBLIC, (raw) => {
  const cur = JSON.parse(raw!) as PublicCalcQuiz;
  if (cur.answeredUserIds.includes(event.userId)) { alreadyAnswered = true; return raw!; }
  return JSON.stringify({ ...cur, answeredUserIds: [...cur.answeredUserIds, event.userId] });
});
if (alreadyAnswered) { /* 既存の「もう答えてくれたね」返信 */ }
```

Copilot は「noteId+userId を一意キーにした別テーブル」も挙げていますが、それはテーブル追加を伴う大きい方の案です。
**現状の 1 問 1 レコード運用なら上記の 3 行で十分**で、必要になってから別テーブルへ移せば足ります。

回帰の確認は「同一 quiz に対して 2 ユーザー分の `updateState` を連続で回し、`answeredUserIds` が 2 件になる」テスト 1 本で足ります。

---

### 指摘 2 🔴 高 — 連続正解時の返信で次問題の答えが LLM から漏れうる

**場所**: `src/bot/handlers/mention.ts:1173-1176`（`handleActiveCalcQuizTurn` 内の `postCalcQuizResult`）

```ts
const framing = await generateF06Framing(ai, activeCharacter, activeFormTarget, 'game-calc-quiz', result.text);
```

出題開始時は抑止されていますが、**連続正解／コンティニューの返信は `result.text` に「次の問題（式 = ?）」を含みます**。
それをそのまま `generateF06Framing()` に渡すと、LLM が式を解いて「お、次は 42 だね」のように**答えを先に言ってしまう**余地があります。

問題生成と採点をコード側に閉じ、出題時に LLM フレーミングを抑止した PR #37 の設計意図と矛盾する穴です。

**提案（未適用）**:

`F06Result` に `containsNewQuestion?: boolean`（または既存の抑止フラグの再利用）を持たせ、
`postCalcQuizResult` の先頭で早期に分岐する。1 行の条件追加で済みます。

```ts
const framing = result.containsNewQuestion
  ? null
  : await generateF06Framing(ai, activeCharacter, activeFormTarget, 'game-calc-quiz', result.text);
```

「新しい問題が含まれる返信ではフレーミングを生成しない」という不変条件を、
`result.containsNewQuestion === true` のときに `generateF06Framing` が呼ばれないアサートテスト 1 本で固定するのが安全です。

---

### 指摘 3 🟡 中 — 定期出題がクールダウンに食われて仕様どおり出ない

**場所**: `src/bot/scheduler/index.ts:271`（`tick()`）

```ts
const quizSlot = CALC_QUIZ_SLOTS.find((entry) => entry.hour === hour);
if (quizSlot && !this.isOnCooldown()) {
```

README / AGENTS.md の仕様は「毎日 8/12/16/20時(JST) に出題」ですが、`isOnCooldown()` に掛かると丸ごとスキップされます。
特に **月曜 7 時の就任挨拶（B-4）は直後に `lastPostedAt` を更新する**ため、**月曜 8 時の出題はほぼ確実に落ちます**。

重複防止は `STATE_KEY_CALC_QUIZ_LAST_SLOT` の `slotKey` 比較で既に成立しているので、
クールダウン判定は定期出題には不要です（クールダウンは「自発投稿が連続しない」ための仕組み）。

**提案（未適用）**: `&& !this.isOnCooldown()` を外すだけ。
出題後の `this.lastPostedAt = Date.now()` は残す（12 時が昼スロットと重なるため、昼の自発投稿抑止に必要）。

```ts
if (quizSlot) {                       // ← クールダウン判定をバイパス
  const slotKey = getCalcQuizSlotKey(hour);
  if (this.deps.botState.getState(STATE_KEY_CALC_QUIZ_LAST_SLOT) !== slotKey) { ... }
}
```

---

### 指摘 4 🟡 中 — `/calcquiz` のパターンが制御文字で丸ごと死んでいる

**場所**: `src/bot/classifier/intent.ts:117`（`CALC_QUIZ_PATTERNS`）

Copilot は「検索性が落ちる」と 🔵 低めに書いていますが、**実測すると機能バグです**。
当該行のコードポイントを取ると:

```
"  //calcquiz\b/i,"
32,32,47,47,99,97,108,99,113,117,105,122,8,47,105,44
                                          ^ U+0008 (BACKSPACE)
```

`\b` が**エスケープシーケンスではなく生のバックスペース文字（U+0008）**として混入しており、
行頭が `//` で始まるため **TypeScript はこの行全体を行コメントとして読み捨てます**。
つまり配列に要素が入っておらず、**スラッシュコマンド `/calcquiz` は 1 度もマッチしません**（無言で機能欠落）。

**提案（未適用）**: 意図した正規表現に書き直す。

```ts
/\/calcquiz\b/i,
```

`CALC_QUIZ_PATTERNS` の配列長、または `/calcquiz` が `game-calc-quiz` に分類されることを確認するテスト 1 本で固定できます。
同種の混入が他にないか、`intent.ts` 全体を U+0000-U+001F（改行・タブを除く）で 1 回 grep しておくと安心です。

---

## 対応順の提案

1. **指摘 4**（1 行・機能が丸ごと死んでいる。最小コストで最大の回復）
2. **指摘 2**（1 行・情報漏洩の穴を塞ぐ）
3. **指摘 3**（1 語削除・仕様どおりに戻す）
4. **指摘 1**（`updateState` 追加 ＋ 呼び出し側の書き換え。3 件より少しだけ大きい）

4 件すべて合わせても差分は小さく、テストは 3〜4 本で足ります。

---

## ローカル環境の状態（参考・書き込みなし）

- `D:\VisualStudio Code Userfile\NumberTales-MisskeyAIBot`（main 環境）: HEAD `1115e91`。作業ツリーはクリーン
  （未追跡は本ディレクトリ配下の過去トリアージログのみ）。
- `git fetch` / `pull` / `add` / `commit` / `stash` / `checkout` 等の書き込み系操作は一切実行していません。
- GitHub コネクタの書き込み系ツール（コメント投稿・スレッド解決等）も一切使用していません。

---

## 追記（2026-09-08）— 指摘 4 件すべて対応済み

本ログの提案どおりに 4 件を修正し、`npm run typecheck` ✅ / `npm test` ✅（7 ファイル・87 件）を確認した。

| 指摘 | 対応 | 変更箇所 |
| --- | --- | --- |
| 4 🔴 `/calcquiz` が制御文字で死んでいた | `//calcquiz<U+0008>/i,` → `/\/calcquiz\b/i,` に修正。`src/` 全体を制御文字（改行・タブ除く）でスキャンし、他に混入が無いことも確認 | `src/bot/classifier/intent.ts:117` |
| 2 🔴 次問題の答えが LLM から漏れうる | `F06Result.containsNewQuestion` を追加し、連続正解・コンティニュー受諾の返信に立てる。`postCalcQuizResult` はこのフラグが立つ返信でフレーミングを生成しない | `src/features/f06/index.ts` / `src/bot/handlers/mention.ts` |
| 3 🟡 定期出題がクールダウンに食われる | `&& !this.isOnCooldown()` を削除（重複防止は `slotKey` 比較で成立）。出題後の `lastPostedAt` 更新は残置 | `src/bot/scheduler/index.ts:279` |
| 1 🔴 公開出題の回答者記録がロストアップデート | `BotStateStore.updateState(key, updater)` を追加し、重複チェックと回答者追記を同期クロージャ内へ寄せた（別テーブル化はせず提案どおり最小差分） | `src/storage/bot-state.ts` / `src/bot/handlers/mention.ts` |

回帰ガード: `test/calc-quiz-handlers.test.ts` を新規追加（`updateState` の追記が 2 ユーザー分残ること・
`containsNewQuestion` が次問題を含む返信でのみ立つこと）、`test/intent.test.ts` に `/calcquiz` のケースを追加。

あわせて、本ログ §1（2026-07-26 のデプロイ失敗）以来 07-29・08-01 と持ち越されていた
**`deploy.yml` の `concurrency` 未設定**も解消した（`group: deploy-gcp-vm` / `cancel-in-progress: true`）。
