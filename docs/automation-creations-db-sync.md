# 自動化: creations-db 同期・最適化タスク（分業型）

サブモジュール [`_creations-db`](../_creations-db)（百花繚乱研究所 創作DB / 参照専用）に
upstream 更新があった時、リポジトリ内の既存機能を自動で追従・最適化するための仕組み。

Cowork の実行サンドボックスは外部ネットワークがブロックされているため、
**ネットワークが必要な fetch 系は VM/ローカルのデプロイ側**で行い、
**ネットワーク不要な最適化・ログ・コミットは Cowork のスケジュールタスク**が行う、という分業型で構成している。

## 役割分担

| 担当 | 処理 | ネットワーク |
| --- | --- | --- |
| VM/ローカル（デプロイ手順の一部） | `git submodule update --remote _creations-db` で作業ツリーを最新化 | 必要 |
| Cowork スケジュールタスク `creations-db-sync-optimize` | 追従待ち更新の検知 → 既存機能の最適化 → ログ生成 → コミット（push 無し） | 不要 |

## 構成要素

| 要素 | 役割 |
| --- | --- |
| `tools/check-creations-db-update.sh` | サブモジュール作業ツリー HEAD と、スーパープロジェクトが記録済みの gitlink を比較する**ネットワーク非依存**のゲート |
| スケジュールタスク `creations-db-sync-optimize` | 6時間ごと（cron `0 */6 * * *`）にゲートを実行し、追従待ち更新がある時だけ本処理を走らせる |
| `_tasks/` | 最適化作業ログの出力先（[_tasks/README.md](../_tasks/README.md)） |

## ゲートスクリプトの判定（ネットワーク非依存）

`tools/check-creations-db-update.sh` は fetch を行わず、以下を比較するだけ。

- 作業ツリー HEAD: `git -C _creations-db rev-parse HEAD`
- 記録済み gitlink: `git rev-parse HEAD:_creations-db`

| exit code | stdout | 意味 |
| --- | --- | --- |
| `0` | `UPDATE_AVAILABLE <recorded>..<working>` | 追従すべき更新あり → 本処理を実行 |
| `10` | `UP_TO_DATE <sha>` | 記録済みと一致 → 何もしない |
| `1` | `ERROR: ...` | エラー（サブモジュール未初期化等） |

手動確認:

```bash
bash tools/check-creations-db-update.sh
```

最適化コミットで gitlink が作業 HEAD に追いつくため、コミット後は `UP_TO_DATE` に戻る。

## 自動実行フロー（Cowork タスク側）

1. ゲートスクリプトで「作業ツリー HEAD ≠ 記録済み gitlink」を判定。
2. 追従すべき更新がある場合のみ以下を実行（いずれもネットワーク不要・ローカル完結）:
   1. 差分を把握: `git -C _creations-db log --oneline <recorded>..<working>` / `diff --stat` / `CHANGELOG.md`。
   2. 影響を受けるリポジトリ側の機能（例: `src/bot/character/loader.ts` のフィールドマッピング、
      `src/features/f06/` のヌメロジー参照など）を最適化。
   3. `npm run typecheck` で型整合を確認。
   4. `_tasks/YYYY-MM-DD-HHmm-creations-db-sync.md` に作業ログを生成。
   5. 関連ドキュメントを整理。
   6. コード・ドキュメント・ログ・`_creations-db` のポインタ更新をステージして `git commit`（**push しない**）。

## VM/ローカル側のデプロイ手順への組み込み

サブモジュールの最新化（fetch 相当）はデプロイ時に実行する。CLAUDE.md のデプロイ手順に含まれる
`git submodule update --init --recursive` を、最新追従する場合は次のように行う:

```bash
git fetch origin master
git reset --hard origin/master
git submodule update --remote _creations-db   # ← 作業ツリーを upstream develop の最新へ進める
npm install --omit=dev
npm run build
pm2 reload ecosystem.config.cjs
```

これで作業ツリー HEAD が進み、次回（最大6時間後）の Cowork タスクが追従コミットを生成する。

## 注意

- サブモジュール `_creations-db` は **参照専用**。サブモジュール内のファイルは直接編集しない。
- 創作内容（未公開設定・台詞・ストーリー）の自動生成は行わない。最適化はコード側の追従に限定する。
- スケジュールタスクはアプリ起動中に実行される。起動していなかった場合は次回起動時に実行される。
- ゲートはネットワークを使わないため、サンドボックスの許可リスト設定に依存しない。

## スケジュール変更

頻度やプロンプトを変えたい場合は、スケジュールタスク `creations-db-sync-optimize` を更新する。
