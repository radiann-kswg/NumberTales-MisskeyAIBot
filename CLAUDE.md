# CLAUDE.md — NumberTales-MisskeyAIBot（Claude Code / Cowork 用）

> **共通仕様の正典（SSOT）は [AGENTS.md](./AGENTS.md)。** プロジェクト概要・リポジトリ構成・実装済み機能・
> セッション開始時のルーティン・ロールプレイ設定・Bot 開発方針・コード変更時の注意・Git ブランチ運用・
> VM 操作／デプロイ・creations-db 分業型同期・進捗ログの棚卸ルール・禁止事項などの
> **共通仕様はすべて AGENTS.md に集約**されています。
> 本ファイルには **Claude Code / Cowork 固有の事項と参照リンクのみ**を記します。
> 共通ルールを変更するときは AGENTS.md を更新し、本ファイルには共通仕様を書き足さないこと（重複・乖離の原因になる）。

---

## 最初にやること

**本ファイルを読んだら、必ず [AGENTS.md](./AGENTS.md) も読むこと。** 共通仕様は AGENTS.md にしか書かれていません。

セッション開始時のルーティン（ロールプレイ固定・禁止事項の再確認）は
**[AGENTS.md の「セッション開始時のルーティン（全エージェント共通）」](./AGENTS.md#セッション開始時のルーティン全エージェント共通)**
に一本化されています。最初の応答を生成する前に同節の手順を実施してください。

> 口調例・立ち位置・ロールプレイ上の制約の詳細は
> [AGENTS.md の「ロールプレイ設定（全エージェント共通）」](./AGENTS.md#ロールプレイ設定全エージェント共通)を参照。
> ロールプレイはあくまで口調のみに適用し、**技術タスクの実行精度を妨げないこと**。

---

## Claude Code / Cowork 固有の事項

- 回答は必ず**日本語**で行う（Claude Code / Cowork は英語へ流れやすいので特に注意）。
- ファイル探索・編集は Claude Code のツールを用いる。複数ファイルにまたがる新規作成・構成変更は事前に計画を提示する。
- 一時生成ファイル（デバッグダンプ・ログ等）は git 管轄外の `.cache/` 配下に格納する。
- スラッシュコマンド [`.claude/commands/`](./.claude/commands/) は
  [`.agents/skills/`](./.agents/skills/) の**薄いポインタ**。手順本体はそちらが正典なので、
  コマンドを追加・変更するときは [AGENTS.md の「スキル定義の同期ルール」](./AGENTS.md#スキル定義の同期ルール)に従うこと。
- 共通の実行コマンド・ディレクトリ構成・実装済み機能・設計方針・禁止事項などは [AGENTS.md](./AGENTS.md) を参照（本ファイルには再掲しない）。

---

## 参照

- **共通仕様の正典: [AGENTS.md](./AGENTS.md)**
- ロールプレイ正本: [\_roleplay-datas/roleplay-prompt.md](./_roleplay-datas/roleplay-prompt.md) ／ AI 連携リンク集: [\_roleplay-datas/ai-link.md](./_roleplay-datas/ai-link.md)
- 詳細ドキュメント: [docs/](./docs/)（architecture / development / deployment）／ creations-db 分業同期: [docs/automation-creations-db-sync.md](./docs/automation-creations-db-sync.md)
- 対をなす設定書:
  - [.github/copilot-instructions.md](./.github/copilot-instructions.md)（GitHub Copilot 向けの薄い設定書）
  - [AGENTS.md](./AGENTS.md)（OpenAI Codex はこれを直接読み込むため、Codex 固有の事項は
    [AGENTS.md の「エージェント別の固有事項」](./AGENTS.md#エージェント別の固有事項)に記載）
- エージェント共通スキル: [.agents/](./.agents/)
- 過去の対話アーカイブ: [\_session-archives/\_agent-chats](./_session-archives/_agent-chats)
