# Copilot Instructions — NumberTales-MisskeyAIBot

> **共通仕様の正典（SSOT）は [AGENTS.md](../AGENTS.md)。** プロジェクト概要・リポジトリ構成・実装済み機能・
> セッション開始時のルーティン・ロールプレイ設定・Bot 開発方針・コード変更時の注意・Git ブランチ運用・
> VM 操作／デプロイ・進捗ログの棚卸ルール・禁止事項などの**共通仕様はすべて AGENTS.md に集約**されています。
> 本ファイルには **GitHub Copilot / VS Code 固有の事項と参照リンクのみ**を記します。
> 共通ルールを変更するときは AGENTS.md を更新し、本ファイルには共通仕様を書き足さないこと（重複・乖離の原因になる）。

---

## 最初にやること

**本ファイルを読んだら、必ず [AGENTS.md](../AGENTS.md) も読むこと。** 共通仕様は AGENTS.md にしか書かれていません。

セッション開始時のルーティン（ロールプレイ固定・禁止事項の再確認）は
**[AGENTS.md の「セッション開始時のルーティン（全エージェント共通）」](../AGENTS.md#セッション開始時のルーティン全エージェント共通)**
に一本化されています。最初の応答を生成する前に同節の手順を実施してください。

> 口調例・立ち位置・ロールプレイ上の制約の詳細は
> [AGENTS.md の「ロールプレイ設定（全エージェント共通）」](../AGENTS.md#ロールプレイ設定全エージェント共通)を参照。

---

## GitHub Copilot / VS Code 固有の事項

- 回答は必ず**日本語**で行う。
- ファイル探索・編集は VS Code / Copilot のツールを用いる。複数ファイルにまたがる新規作成・構成変更は事前に計画を提示する。
- 仕様が曖昧な場合は推測実装を避け、関連ドキュメント（[AGENTS.md](../AGENTS.md) / [docs/](../docs/)）を参照して確認する。
- 共通の実行コマンド・ディレクトリ構成・実装済み機能・設計方針・禁止事項などは [AGENTS.md](../AGENTS.md) を参照（本ファイルには再掲しない）。

---

## 参照

- **共通仕様の正典: [AGENTS.md](../AGENTS.md)**
- ロールプレイ正本: [\_roleplay-datas/roleplay-prompt.md](../_roleplay-datas/roleplay-prompt.md) ／ AI 連携リンク集: [\_roleplay-datas/ai-link.md](../_roleplay-datas/ai-link.md)
- 詳細ドキュメント: [docs/](../docs/)（architecture / development / deployment）
- 対をなす設定書:
  - [CLAUDE.md](../CLAUDE.md)（Claude Code / Cowork 向けの薄い設定書）
  - [AGENTS.md](../AGENTS.md)（OpenAI Codex はこれを直接読み込むため、Codex 固有の事項は
    [AGENTS.md の「エージェント別の固有事項」](../AGENTS.md#エージェント別の固有事項)に記載）
- エージェント共通スキル: [.agents/](../.agents/)
- 過去の対話アーカイブ: [\_session-archives/\_agent-chats](../_session-archives/_agent-chats)
