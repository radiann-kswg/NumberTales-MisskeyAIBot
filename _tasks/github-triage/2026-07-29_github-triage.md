# GitHub 未解決問題トリアージ（2026-07-29）

自動実行（毎朝のGitHub未解決問題トリアージ）による生成物。**実コードの修正・commit/push は行っていません**（読み取り専用調査）。

調査手段: Gmail通知（直近14日）＋ GitHub読み取り専用API（`list_pull_requests` / `list_issues` / `pull_request_read` / `list_commits`）＋ ローカル読み取り専用 git。
GitHubコネクタは**正常に利用できました**（認証エラー・アクセス拒否なし）。ただし **Actions の実行履歴/ログを読むツールはコネクタに無い**ため、ワークフロー失敗の判定はメール＋ローカルgitからの推論です。

## 1. Deploy to GCP VM 失敗（master, `34ea47b`, 2026-07-26 00:29:59 UTC, Failed in 1 minute）

- 状態: 🟠 **実害は無かった可能性が高いが、原因の再発防止は未対応**。
- 実測した事実:
  - `34ea47b` = PR #32（Dependabot js-yaml）のマージコミット、**master へ 00:28:28 に push**。
  - `5ba0dec` = PR #33（develop リリース）のマージコミット、**master へ 00:29:12 に push**（= 44 秒後）。
  - 失敗通知は `34ea47b` の run のみ。**`5ba0dec` の run に対する失敗通知は届いていません**（07-26 以降 07-29 現在まで、本リポジトリの `Run failed` メールはゼロ）。
  - `origin/master` は現在も `5ba0dec` のままで、以降 master への push はありません。

### 推定原因（未確定）

`.github/workflows/deploy.yml` は `on: push: branches: [master]` のみで、**`concurrency` グループが設定されていません**。
44 秒差で 2 本の run が起動すると、両方が同じ VM の同じディレクトリに SSH して

```
git reset --hard origin/master → git submodule update → npm install → npm run build → npm prune → pm2 reload
```

を**並走**します。`git reset --hard origin/master` は run 間で同じ最終状態（= `5ba0dec`）へ収束するため、先行 run（`34ea47b`）が `.git/index.lock` 競合・`node_modules` の同時書き換え・`npm install` の衝突あたりで落ちた、というのが素直な説明です。「1分で失敗」という短さとも整合します。

なお、後発 run（`5ba0dec`）が成功したのであれば **本番 VM のコードは最新（`5ba0dec`）に揃っている**はずで、実害はありません。ただし run の成否そのものは Actions ログ未接続のため確認できていません。

### 修正方針の提案（未適用・レビュー用）

1. **`concurrency` を追加する**（最小・最有効）。連続 push 時に古い run を捨て、常に最新コミットだけをデプロイする。

   ```yaml
   concurrency:
     group: deploy-gcp-vm
     cancel-in-progress: true
   ```

   `cancel-in-progress: true` は「デプロイの取りこぼし」を生みません。どの run も `git reset --hard origin/master` で最新へ揃えるため、最後の run さえ通れば結果は同じです。
2. （任意）リリース手順の運用側対処として、**Dependabot PR と release PR を同じ分で連続マージしない**。1 の設定を入れるなら不要。
3. （任意）`pm2 reload` 後に `pm2 jlist` で `status: online` を検証し、落ちていたら run を失敗にする。現状は `pm2 list` を表示するだけで、起動失敗を検知できません。

### 次のアクション（人手）

- Actions の run 詳細（`34ea47b` / `5ba0dec`）を目視し、**後発 run が緑だったか**と、先行 run の実際のエラー行を確認する。
- 上記が確認できたうえで、提案 1 を適用するか判断する。

> ⚠️ 本節は提案です。`deploy.yml` を含め、ワークフロー・設定ファイルは一切変更していません。

## 2. PR #33 / #34（リリース・README 追記）

- 状態: ✅ **対応不要**。`list_pull_requests(state=open)` で **本リポジトリの OPEN PR は 0 件**を実測（2026-07-29）。#33 は `5ba0dec` として master にマージ済み、#34 は `c47ebb6` として develop にマージ済み。Copilot レビューに未対応の指摘はありません。

## 3. Issue

- 状態: ✅ **なし**。`list_issues(state=OPEN)` で **OPEN Issue 0 件**を実測。
- ただし本リポジトリ側の機能 **F-06 Stage B/C は、CreationsDB Issue #13（OPEN 継続）待ち**です。DB 側にフィールドが入るまで Bot 側は数値＋定型フォールバックのまま。詳細は CreationsDB の `_work_in_progress/2026-07-29_github-triage.md` §1 を参照。

## 4. 前回（2026-07-25）の持ち越し

| 項目 | 前回の状態 | 今回 |
| --- | --- | --- |
| PR #32（js-yaml bump） | 未解決（open） | ✅ **マージ済み**（`34ea47b`）。追跡終了 |
| Deploy 失敗（`fc9fa60`, 07-19） | 対応済みの可能性が高い | ✅ **追跡終了**。以降 master は 2 回進み、うち最新 run に失敗通知なし。ただし 07-26 に**同種の失敗が再発**したため、原因は §1 として引き継ぎ |

## 5. ローカル環境の状態（参考・書き込みなし）

- `D:\VisualStudio Code Userfile\NumberTales-MisskeyAIBot` の `develop` は `56909f9`、`origin/develop` は `c47ebb6` で **2コミット分ローカルが遅れています**。
- 本タスクは読み取り専用のため `git fetch` / `pull` / `stash` 等は実行していません。次回作業時に手動で追従してください。

## まとめ

| 項目 | 状態 | 確認方法 |
| --- | --- | --- |
| Deploy to GCP VM 失敗（`34ea47b`） | 🟠 **要確認**（実害は薄いが再発防止未対応） | メール＋ローカルgit（Actionsログ未接続） |
| OPEN PR | ✅ 0 件 | コネクタで実測 |
| OPEN Issue | ✅ 0 件 | コネクタで実測 |
| F-06 Stage B/C | 🟡 CreationsDB Issue #13 待ち（本リポジトリ側の対応不要） | コネクタで実測 |

実コード・ワークフロー・設定ファイルの変更、および git の書き込み系操作は一切行っていません。
