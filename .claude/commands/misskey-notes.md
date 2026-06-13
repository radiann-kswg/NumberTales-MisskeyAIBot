---
description: Botの直近Misskey投稿をAPIから取得してデバッグ表示する
---

以下のコマンドを実行して、Botの直近10件のMisskey投稿を取得・表示してください。
件数を変えたい場合は `--limit N` を引数に追加してください。

```bash
node tools/fetch-misskey-notes.mjs
```

取得結果を確認して、必要であればデバッグに役立つ情報（投稿内容・日時・visibility 等）を解説してください。
