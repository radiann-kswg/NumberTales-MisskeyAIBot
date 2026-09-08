# GitHub 未解決問題トリアージ（2026-08-15）— NumberTales-MisskeyAIBot

自動実行（毎朝のGitHub未解決問題トリアージ）による調査ログ。**読み取りのみ。コード・依存・設定は一切変更していません。**

調査手段: Gmail 通知（GitHub 発）／GitHub 読み取り専用コネクタ（`search_pull_requests` / `pull_request_read` / `list_commits`）／ローカル読み取り専用参照（`git log` / `git status --porcelain` / `npm audit`）。
GitHubコネクタは**正常に利用できました**（`get_me` → `radiann-kswg`。認証エラー・アクセス拒否なし）。
ただし **Actions のジョブログと Dependabot / Code scanning のアラート一覧を読むツールはコネクタに存在しません**。

> 前回ログ: `2026-08-01_github-triage.md`。

---

## 1. 🟡 OPEN な Dependabot PR #36 が 4 日間放置

- PR: [#36 `chore(deps-dev): bump postcss from 8.5.20 to 8.5.26`](https://github.com/radiann-kswg/NumberTales-MisskeyAIBot/pull/36)
- 作成: 2026-08-11 21:35 UTC / `updated_at` も同時刻＝**起票以降ノーアクション**
- ラベル: `dependencies` / `javascript`
- `pull_request_read(method=get_check_runs)` → **check_runs 0 件**。CI 待ちではなく、**マージを妨げているものは何も無い**。

### ローカル `npm audit` の実測（本リポジトリ / 書き込みなし）

| パッケージ | 深刻度 | 内容 |
| --- | --- | --- |
| `brace-expansion` | high | DoS（指数時間展開 / OOM / 中間配列。GHSA-3jxr-9vmj-r5cp ほか） |
| `js-yaml` (4.0.0 - 4.3.0) | high | Quadratic CPU consumption in `!!omap` resolution（GHSA-5p4m-2wfm-xmqj） |
| `nanoid` (<3.3.18) | high | custom generators can loop indefinitely when size is zero（GHSA-2v37-7h3g-55p8） |
| `postcss` (<=8.5.22) | moderate | `from` 未設定時に attacker-controlled `sourceMappingURL` が任意 `.map` を読む（GHSA-fxqj-rqcc-2cmp） |

合計 **4 件（high 3 / moderate 1）**。

**`npm audit --omit=dev` → `found 0 vulnerabilities`。**
本番稼働中の Bot（共用 Spot VM `misskey-bots-unified` 上）には**一切載りません**。すべて devDependencies 経由です。

### 提案（未適用）

1. **PR #36 はそのままマージして構いません。** devDeps の patch 更新で、`postcss` の moderate（GHSA-fxqj-rqcc-2cmp）を直接潰します。
   check_runs が 0 件なので、マージ後に `npm test`（vitest）をローカルで 1 回回して緑を確認すれば十分です。
2. 残る 3 件（`brace-expansion` / `js-yaml` / `nanoid`）は #36 では解消しません。
   次に依存を触るタイミングで `npm audit fix` を当てるか、Dependabot の後続 PR を待つのが低コストです。
   **急ぎではありません**（本番 0 件）。
3. `js-yaml` は eslint / vitest 系の推移的依存です。直接 `package.json` を書き換えるより
   `npm audit fix` に任せるほうが lockfile が素直になります。

---

## 2. ✅ CI — 追跡終了

- 直近14日の Gmail に、本リポジトリの `Run failed` 通知は **1 件もありません**。
- 最後の失敗は 07-26 の `Deploy to GCP VM / SSH deploy`。08-05 の PR #35（共用 Spot VM 移設追従）マージ以降、通知は途絶しています。
- ローカル HEAD は `53cb253 feat(deploy): deploy.yml を workflow_dispatch 対応にする`。

> ⚠️ Actions の実行履歴をコネクタから読めないため、「通知が来ていない」以上のことは言えません。

---

## 3. ✅ OPEN Issue — 0 件

`search_issues(is:open owner:radiann-kswg)` の実測で、アカウント全体の OPEN Issue は
**CreationsDB #13 の 1 件のみ**。本リポジトリには 0 件です。

なお CreationsDB #13 は**本 Bot の F-06 Stage B/C（数秘解説）と F-15 Phase 3（スキンシップ反応）が
待っている依頼 Issue** で、起票から **25 日**動いていません。
Bot 側はフィールド未存在でもフォールバックする実装なので**ブロッカーではありません**が、
監修済み文面の供給は始まっていない状態が続いています。

---

## 4. ローカル環境の状態（参考・書き込みなし）

- `D:\VisualStudio Code Userfile\NumberTales-MisskeyAIBot`（**main 環境**）。
- 未追跡ファイル: `_tasks/github-triage/2026-07-29_github-triage.md` / `2026-08-01_github-triage.md`（本ログ追加で 3 件）。
  過去のトリアージログが未コミットのまま溜まっています。commit するかは User 判断。
- `git fetch` / `pull` / `add` / `commit` / `stash` / `checkout` 等の書き込み系操作は一切実行していません
  （Windows マウント上の `.git/index` 破損回避）。`npm audit` は lockfile を読むだけで書き込みません。

---

## まとめ

| 項目 | 優先度 | 状態 |
| --- | --- | --- |
| Dependabot PR #36（postcss 8.5.20 → 8.5.26 / devDeps） | 🔵 低 | 🟡 4日間 OPEN・マージ阻害要因なし |
| npm 脆弱性 4 件（high 3 / moderate 1・すべて devDeps） | 🔵 低 | 🔵 未対応（本番 0 件） |
| CI | — | ✅ 20日間失敗なし |
| OPEN Issue | — | ✅ 0 件（依頼先の CreationsDB #13 は 25日据え置き） |

**要対応**: PR #36 のマージ判断のみ。それ以外に本リポジトリ起因の未解決項目はありません。
