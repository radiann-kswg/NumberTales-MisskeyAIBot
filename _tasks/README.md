# _tasks/ — 自動スケジュールタスクの作業ログ

このディレクトリには、**自動スケジュールタスクが生成した作業ログ**を種類別のサブフォルダに格納する。
リポジトリの恒久ドキュメント（設計・運用手順）は [`docs/`](../docs/) が担当し、
本ディレクトリは「いつ・何を根拠に・何をしたか」の**時系列の記録**を担当する。

## サブフォルダ構成

| サブフォルダ | 生成元タスク | 内容 |
| --- | --- | --- |
| [`creations-db-sync/`](./creations-db-sync/) | `creations-db-sync-optimize`（6時間ごと） | サブモジュール `_creations-db` の更新に追従し、既存機能を最適化した際の作業ログ |
| [`github-triage/`](./github-triage/) | GitHub 未解決問題トリアージ（毎朝） | オープン PR・CI 失敗などの調査結果と提案。**読み取り専用**の調査で、コード修正・push は行わない |

> **新しい種類のログを追加するときは、まず本 README にサブフォルダの行を追加する。**
> 置き場が未定のままログをリポジトリ直下や `docs/` へ退避すると、同じ種類のログが分散する
> （実際に 2026-07-22 のトリアージログが `docs/` へ退避され、2026-07-25 分と分かれていた）。

## ファイル命名規則

```
_tasks/creations-db-sync/YYYY-MM-DD-HHmm-creations-db-sync.md
_tasks/github-triage/YYYY-MM-DD_github-triage.md
```

例: `_tasks/creations-db-sync/2026-06-14-1800-creations-db-sync.md`

## ログ書式（creations-db-sync）

upstream の fetch は VM/ローカルのデプロイ側で実施し、本タスクはネットワーク非依存。
仕様は [docs/automation-creations-db-sync.md](../docs/automation-creations-db-sync.md) を参照。

各ログは以下のセクションを含む（Markdown）。

```markdown
# creations-db 同期最適化ログ — YYYY-MM-DD HH:mm

## サブモジュール更新
- 旧コミット: <sha8>
- 新コミット: <sha8>
- 前進/退行判定の根拠（`merge-base --is-ancestor` の結果）
- 取り込んだ変更点の要約（_creations-db の CHANGELOG / コミットログより）

## 影響範囲の分析
- 変更されたスキーマ/フィールド/データ
- それを参照しているリポジトリ側の箇所（例: src/bot/character/loader.ts）

## 実施した最適化
- 具体的な変更ファイルと内容
- 型定義・パーサ・マッピングの追従内容

## 検証
- npm run typecheck の結果
- （あれば）npm test / npm run lint / build の結果

## コミット
- コミットハッシュ・メッセージ
```

> NOTE: ログは追記式。更新が無かった回はログを生成しない。
