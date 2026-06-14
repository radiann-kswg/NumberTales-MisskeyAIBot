# _tasks/ — 自動最適化ログ

このディレクトリには、サブモジュール `_creations-db` の更新に追従して
リポジトリ内の既存機能を最適化した際の **作業ログ** が自動生成される。

ログの生成・更新は、スケジュールタスク `creations-db-sync-optimize`
（6時間ごとに「追従待ち更新」を検知する分業型タスク）によって行われる。
upstream の fetch は VM/ローカルのデプロイ側で実施し、本タスクはネットワーク非依存。
仕様は [docs/automation-creations-db-sync.md](../docs/automation-creations-db-sync.md) を参照。

## ファイル命名規則

```
_tasks/YYYY-MM-DD-HHmm-creations-db-sync.md
```

例: `_tasks/2026-06-14-1800-creations-db-sync.md`

## ログ書式

各ログは以下のセクションを含む（Markdown）。

```markdown
# creations-db 同期最適化ログ — YYYY-MM-DD HH:mm

## サブモジュール更新
- 旧コミット: <sha8>
- 新コミット: <sha8>
- 取り込んだ変更点の要約（_creations-db の CHANGELOG / コミットログより）

## 影響範囲の分析
- 変更されたスキーマ/フィールド/データ
- それを参照しているリポジトリ側の箇所（例: src/bot/character/loader.ts）

## 実施した最適化
- 具体的な変更ファイルと内容
- 型定義・パーサ・マッピングの追従内容

## 検証
- npm run typecheck の結果
- （あれば）npm run lint / build の結果

## コミット
- コミットハッシュ・メッセージ
```

> NOTE: ログは追記式。更新が無かった回はログを生成しない。
