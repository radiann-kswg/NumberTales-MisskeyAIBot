# `.agents/` — エージェント共通スキル置き場

このフォルダは、リポジトリで稼働する AI エージェント（**OpenAI Codex / Claude / GitHub Copilot**）に
共有させる**スキル（手順つきコマンド）の正典**を置く、ツール非依存の名前空間です。

> エージェント設定書そのものの正典は [AGENTS.md](../AGENTS.md) です。本フォルダはスキル定義のみを扱います。
> 役割分担の全体像は [AGENTS.md の「設定書の同期ルール」](../AGENTS.md#設定書の同期ルール重要) を参照してください。

## 構成

```
.agents/
  README.md                   # 本ファイル
  skills/
    <name>/SKILL.md           # スキル手順の正典（frontmatter に name / description）
```

| スキル | 内容 |
| --- | --- |
| [`skills/misskey-notes`](./skills/misskey-notes/SKILL.md) | Bot の直近 Misskey 投稿を API から取得してデバッグ表示する |

## 追加・変更のルール

詳細は [AGENTS.md の「スキル定義の同期ルール」](../AGENTS.md#スキル定義の同期ルール) が正典。要点は次の 3 つです。

1. **手順本体は `.agents/skills/<name>/SKILL.md` にだけ書く。**
2. Claude Code から `/<name>` で呼びたい場合のみ、`.claude/commands/<name>.md` に
   **正典を指す薄いポインタ**を置く（手順を複製しない）。
3. ディレクトリ名は機能名そのものにする。移行ツールが付ける `source-command-` などの接頭辞は残さない。
   改名したらポインタ側の参照も同時に直すこと。

## 読み込まれ方

- **OpenAI Codex**: 本フォルダのスキルを直接読み込む。共通仕様は [AGENTS.md](../AGENTS.md) から取得する。
- **Claude Code**: [`.claude/commands/`](../.claude/commands/) のポインタ経由で本フォルダの SKILL.md を参照する。
- **GitHub Copilot**: [`.github/copilot-instructions.md`](../.github/copilot-instructions.md) から
  [AGENTS.md](../AGENTS.md) を辿り、必要に応じて本フォルダを参照する。
