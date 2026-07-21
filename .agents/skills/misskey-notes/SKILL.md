---
name: "misskey-notes"
description: "Botの直近Misskey投稿をAPIから取得してデバッグ表示する"
---

# misskey-notes

ユーザーから「Bot の直近投稿を見せて」「misskey-notes を実行して」等と依頼されたときに使用するスキル。
本ファイルが手順の**正典**であり、[.claude/commands/misskey-notes.md](../../../.claude/commands/misskey-notes.md)
は本ファイルを指す薄いポインタ（[AGENTS.md の「スキル定義の同期ルール」](../../../AGENTS.md#スキル定義の同期ルール)参照）。

## 実行手順

以下のコマンドを実行して、Bot の直近 10 件の Misskey 投稿を取得・表示する。
件数を変えたい場合は `--limit N` を引数に追加する。

```bash
node tools/fetch-misskey-notes.mjs
```

取得結果を確認して、必要であればデバッグに役立つ情報（投稿内容・日時・visibility 等）を解説する。

## 注意

- 応答は 000(チトセ) の口調を維持すること（[AGENTS.md](../../../AGENTS.md#ロールプレイ設定全エージェント共通)）。
- 取得ログを保存する場合は git 管轄外の `.cache/` 配下に置くこと。
