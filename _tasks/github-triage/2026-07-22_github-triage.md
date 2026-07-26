# GitHub 未解決問題トリアージ（2026-07-22）

自動スケジュールタスクによる調査ログ。コード変更・commit・push・GitHub書き込み系操作は一切行っていません（読み取りと調査のみ）。

保存先について: 本リポジトリの CLAUDE.md / AGENTS.md には汎用の「調査・提案ログ置き場」の明記が無いため（`_tasks/` は creations-db-sync-optimize 専用ログ置き場）、既存の `docs/deploy-incident-2026-05_investigation.md` の前例に倣い `docs/` 配下に保存しています。

## 1. Dependabot PR #31（OPEN・要対応）

**タイトル**: chore(deps-dev): bump brace-expansion from 1.1.14 to 1.1.16 (npm_and_yarn group)
**状態**: GitHub API `list_pull_requests` で OPEN を実測確認（2026-07-22時点）／作成: 2026-07-21

`brace-expansion` の CVE-2026-13149 修正パッチ（v1系バックポート）。開発依存（`devDependencies`）のセキュリティ修正であり、Dependabotが自動生成した標準的な更新PR。

### 提案

- 内容はDependabot標準の依存バンプで、コンフリクトも無し（`dependabot will resolve any conflicts` 表記あり）。動作影響は開発時ツールチェーンのみと想定されるため、`npm test` のCI（vitest導入済み: PR#29で追加）を確認のうえマージを推奨。
- 本タスクは書き込み権限を持たないため、実際のマージ操作はUser側で実施してください。

## 2. CI失敗: Deploy to GCP VM（master, fc9fa60 / 2026-07-19）→ 解消済みと推測、要最終確認

**内容**: `SSH deploy` ジョブが9秒で失敗（`appleboy/ssh-action` によるSSH接続確立の失敗と推測。npm install/build等のスクリプト本体に到達する前の失敗速度）。

### 調査結果

- ローカル `origin/master` は既に `70ea94c`（PR#26, 2026-07-21マージ）まで進んでおり、fc9fa60 より新しい commit が push 済み。push時に同ワークフローが再実行されているはずだが、それ以降の「Run failed: Deploy to GCP VM」通知はGmail検索（直近14日）で確認できませんでした。
- `docs/vm-upgrade-2026-07_worklog.md` に Ubuntu 24.04 移行の作業記録があり（commit `82ed62f docs(vm): 24.04 移行完了と旧Misskey撤去を記録`）、fc9fa60時点のデプロイ失敗はVM移行作業中の一時的な疎通断（VM再起動・SSH鍵/ポート変更途中等）だった可能性が高いです。
- 既存の `docs/deploy-incident-2026-05_investigation.md` を踏まえると、本リポジトリではVM側の一時的な障害がこの種の即時失敗（数秒）の形で現れる前例があります。

### 提案

- コード・ワークフロー自体に修正は不要と考えられます（`deploy.yml` の記述に問題は見当たりません）。
- **確認事項（User向け）**: 直近（70ea94c 以降）のpushでデプロイが成功しているか、GitHub Actions の実行履歴を直接確認してください。本タスクはGitHub Actionsの実行ログ・履歴を取得するツールを持たないため、Actions画面での目視確認をお願いします。
- 継続して失敗する場合は、`secrets.GCP_SSH_HOST` / `GCP_SSH_PORT` / `GCP_SSH_PRIVATE_KEY` がVM移行後も最新の値になっているかを優先的に確認してください。

## 3. マージ済みPR（対応不要）

以下はGmail通知で「Copilotがレビューコメント」として検出しましたが、GitHub API `list_pull_requests`（state=open）で確認した結果、2026-07-22時点で該当PRはすべてOPENリストに存在せず（=マージ済み）、対応不要です。

- PR #24〜#30（f14/f15/vitestテストランナー/復旧通知/タスク意図分類修正/sparse-checkout release 等）

## まとめ

| 項目 | 状態 | 対応 |
| --- | --- | --- |
| Dependabot PR #31 | OPEN | マージ推奨（User操作） |
| Deploy to GCP VM 失敗（fc9fa60） | 解消済みと推測 | Actions画面での最終確認をUserに依頼 |
| PR #24〜#30 | マージ済み | 対応不要 |
