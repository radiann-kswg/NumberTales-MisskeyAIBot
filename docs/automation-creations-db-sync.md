# 自動化: creations-db 同期・最適化タスク

サブモジュール [`_creations-db`](../_creations-db)（百花繚乱研究所 創作DB / 参照専用）に
upstream 更新があった時、リポジトリ内の既存機能を自動で追従・最適化するための仕組み。

## 構成

| 要素 | 役割 |
| --- | --- |
| `tools/check-creations-db-update.sh` | サブモジュールの `origin/develop` を fetch し、更新有無を判定するゲートスクリプト |
| スケジュールタスク `creations-db-sync-optimize` | 6時間ごと（cron `0 */6 * * *`）に上記ゲートを実行し、更新がある時だけ本処理を走らせる |
| `_tasks/` | 最適化作業ログの出力先（[_tasks/README.md](../_tasks/README.md)） |

## ゲートスクリプトの戻り値

| exit code | 意味 |
| --- | --- |
| `0` | 更新あり → 本処理を実行 |
| `10` | 最新 → 何もしない |
| `1` | エラー（fetch 失敗等） |

手動確認:

```bash
bash tools/check-creations-db-update.sh
```

## 自動実行フロー

1. ゲートスクリプトで `_creations-db` の `origin/develop` と現在のコミットを比較。
2. 更新がある場合のみ以下を実行:
   1. サブモジュールを最新へ更新（`git submodule update --remote _creations-db`）。
   2. サブモジュールの差分（CHANGELOG・コミットログ・スキーマ/フィールド変更）を分析。
   3. 影響を受けるリポジトリ側の機能（例: `src/bot/character/loader.ts` のフィールドマッピング、
      `src/features/f06/` のヌメロジー参照など）を最適化。
   4. `npm run typecheck` で型整合を確認。
   5. `_tasks/YYYY-MM-DD-HHmm-creations-db-sync.md` に作業ログを生成。
   6. 関連ドキュメントを整理。
   7. `git add` → `git commit`（**push はしない**）。サブモジュールポインタの更新も含める。

## 注意

- サブモジュール `_creations-db` は **参照専用**。サブモジュール内のファイルは直接編集しない
  （更新はあくまで upstream の取り込みのみ）。
- 創作内容（未公開設定・台詞・ストーリー）の自動生成は行わない。最適化はあくまで
  既存データ構造への **コード側の追従** に限定する。
- スケジュールタスクはアプリ起動中に実行される。起動していなかった場合は次回起動時に実行される。

## スケジュール変更

頻度やプロンプトを変えたい場合は、スケジュールタスク `creations-db-sync-optimize` を更新する。
