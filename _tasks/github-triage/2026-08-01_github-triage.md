# GitHub 未解決問題トリアージ（2026-08-01）

自動実行（毎朝のGitHub未解決問題トリアージ）による生成物。**実コードの修正・commit/push は行っていません**（読み取り専用調査）。

調査手段: Gmail通知（直近14日）＋ GitHub読み取り専用API（`get_me` / `list_pull_requests` / `search_issues` / `list_commits`）＋ ローカル読み取り専用参照。
GitHubコネクタは**正常に利用できました**（認証エラー・アクセス拒否なし）。ただし **Actions の実行履歴/ログを読むツールはコネクタに存在しない**ため、ワークフロー失敗の判定はメール＋ローカル情報からの推論です。

保存先は AGENTS.md / `_tasks/README.md` の規約どおり `_tasks/github-triage/`。

---

## 1. Deploy to GCP VM 失敗（`34ea47b`, 2026-07-26）— 前回からの持ち越し

- 状態: 🟠 **再発なし。ただし原因の再発防止（`concurrency` 未設定）は未対応のまま**。
- 今回の実測:
  - 直近14日の Gmail 通知に **本リポジトリの新たな `Run failed` メールはありません**（最後の失敗は 07-26 00:29:59 UTC の `34ea47b`）。
  - `list_commits(sha=master)` の先頭は依然 `5ba0dec`（PR #33 のマージコミット、07-26 00:29:12）。
    **07-26 以降 master への push は 0 回**なので、そもそもデプロイ run が走る機会がありませんでした。
  - よって「再発なし」は**安全性が確認できたのではなく、まだ試行されていないだけ**です。次に master へ 2 本続けて push した瞬間に同じ競合が起きます。
- 原因の推定（前回 07-29 の分析から変更なし）: `.github/workflows/deploy.yml` が `on: push: branches: [master]` のみで
  **`concurrency` グループ未設定**のため、44 秒差の 2 run が同じ VM の同じディレクトリへ並走し、
  `.git/index.lock` 競合・`node_modules` の同時書き換え・`npm install` の衝突で先行 run が落ちた、という説明が最も素直です。

### 修正方針の提案（未適用・レビュー用 / 前回と同一）

1. **`concurrency` を追加する**（最小・最有効）。

   ```yaml
   concurrency:
     group: deploy-gcp-vm
     cancel-in-progress: true
   ```

   `cancel-in-progress: true` でデプロイの取りこぼしは生じません。どの run も `git reset --hard origin/master` で最新へ揃えるため、最後の run さえ通れば結果は同じです。
2. （任意）運用側対処として、**Dependabot PR と release PR を同じ分内で連続マージしない**。1 を入れるなら不要。
3. （任意）`pm2 reload` 後に `pm2 jlist` で `status: online` を検証し、落ちていたら run を失敗にする。現状は `pm2 list` を表示するだけで起動失敗を検知できません。

### 次のアクション（人手）

- Actions の run 詳細（`34ea47b` / `5ba0dec`）を目視し、**後発 run が緑だったか**と先行 run の実エラー行を確認する。
- 次回 master へリリースする**前に**提案 1 を入れておくと、同じ検証を繰り返さずに済みます。

> ⚠️ 本節は提案です。`deploy.yml` を含め、ワークフロー・設定ファイルは一切変更していません。

---

## 2. ✅ OPEN PR / OPEN Issue

- OPEN PR: ✅ **0 件**（`list_pull_requests(state=open)` で実測、2026-08-01）。
- OPEN Issue: ✅ **0 件**（`search_issues(is:open owner:radiann-kswg)` で実測。組織全体でも CreationsDB #13 の 1 件のみ）。
- PR #34（README 技術構成追記）は `c47ebb6` として develop にマージ済み。Copilot レビューに未対応の指摘はありません。

## 3. F-06 Stage B/C — CreationsDB Issue #13 待ち（本リポジトリ側の対応不要）

- 状態: 🟡 **ブロック継続**。CreationsDB Issue #13 は 2026-08-01 時点でも **OPEN**、コメント 0 件、
  ローカル `data/` 全文走査でも `NumerologyExamples` / `SkinshipReactions` は**ヒット 0 件**（器すら未追加）。
- 起票（07-21）から 11 日間動きがありません。Bot 側は「フィールド未存在でもフォールバック」を実装済みなので**壊れてはいません**が、
  監修済み解説文を出せない状態が続いています。
- 詳細は CreationsDB の `_work_in_progress/2026-08-01_github-triage.md` §1 を参照。
  DB 側の意思決定（命名・配置の確定）だけでも先に進めてもらえると、Bot 側の実装待ちが解けます。

## 4. ローカル環境の状態（参考・書き込みなし）

- `D:\VisualStudio Code Userfile\NumberTales-MisskeyAIBot` の `develop` は `56909f9`、GitHub 側 `develop` は `c47ebb6` で
  **2コミット分ローカルが遅れています**（前回 07-29 から変化なし）。次回作業時に手動で追従してください。
- 本タスクは読み取り専用のため `git fetch` / `pull` / `stash` 等は実行していません。

---

## 5. 参考: 他リポジトリの本日の要対応（Bot 運用と関連）

- **APHRNTs_100**: PR #36（Anthropic 空応答の診断ログ / `max_tokens` 引き上げ）が **develop 止まりで master 未反映**＝本番未デプロイ。
  同リポジトリの本番は systemd タイマーが `origin/master` を追う方式のため、develop へのマージだけでは反映されません。
  詳細は `C:\Visual Studio Code UserFile\APHRNTs_100\docs\2026-08-01_github-triage.md` §1。
  （本リポジトリの Bot とは別個体ですが、同種の「マージ済みなのに本番に載っていない」パターンとして共有します。）

---

## まとめ

| 項目 | 優先度 | 状態 | 確認方法 |
| --- | --- | --- | --- |
| Deploy to GCP VM の `concurrency` 未設定 | 中 | 🟠 **未対応**（再発なし＝未試行） | Gmail（新規失敗なし）＋ `list_commits`（master 進展なし） |
| OPEN PR | — | ✅ 0 件 | コネクタで実測 |
| OPEN Issue | — | ✅ 0 件 | コネクタで実測 |
| F-06 Stage B/C | 中 | 🟡 CreationsDB Issue #13 待ち（本リポジトリ側は対応不要） | コネクタ実測＋ローカル全文走査 |

実コード・ワークフロー・設定ファイルの変更、および git の書き込み系操作は一切行っていません。
