# マイルストーン: F-17C 数式画像の清書基盤（PenchantManufacture_ImagePipeline）

> 作成日: 2026-09-18
> ステータス: **完了 ✅**（実装 2026-09-18: `34dc55e`・`22bd8f4`・`8c05f39`。VM 構築とプロフィールのクレジット表記は 2026-09-18 に実施、実機で画像付き返信を確認）
> 昇進元アイデア: [`_ideas/future-plan/F-17-arithmetic-puzzles.md`](../../future-plan/F-17-arithmetic-puzzles.md) の F-17C（**部分昇進**。A・B・D は未昇進）
> 利用側: [F-06 数式計算の強化](./2026-09-18_milestone_f06-calculate-enhancement.md)（T4 の画像清書が本 milestone に依存）。F-17A/B も後から相乗りする
> 設計判断: [ADR 0001](../../../docs/adr/0001-python-typeset-via-execfile.md)（Python を execFile で呼び、TS に移植しない）
> 用語: [CONTEXT.md](../../../CONTEXT.md)（清書・縦構造・プレーン式・PM 絵文字）

---

## 概要

式を PenchantManufacture の字形で組んだ PNG にして、Misskey の投稿に添付できるようにする基盤。
F-17 の A・B より先に単独で入れ、F-06 の数式計算と F-17A/B から使う（2026-09-18 決定）。

本 milestone の完了条件は「TeX 風の式の文字列を渡すと、画像付きで返信できる」ところまで。
**どの式を画像にするかは利用側が決める**（F-06 側の判定は F-06 milestone を参照）。

## 決定事項（2026-09-08 計画・2026-09-18 グリルで再確認）

| 項目 | 決定 |
| --- | --- |
| 配置 | `_calcimage-pipeline/` にサブモジュールを追加する。入れ子サブモジュール `basis/`（フォント）があるので `--recursive` が必須 |
| 呼び出し | Node から `child_process.execFile(TYPESET_PYTHON, ['_calcimage-pipeline/scripts/typeset.py', tex, '-o', tmp, '--bg', 'white', '--cell', '3'])`。TS に移植しない（ADR 0001） |
| 失敗時 | 3 秒でタイムアウトさせる。失敗・タイムアウト時は `null` を返し、利用側がプレーン式にフォールバックする。**画像は常に上乗せ**で、無くても文面が成立すること |
| ローカルキャッシュ | 同じ式は `.cache/typeset/<sha1>.png` を再利用する（`.cache/` は git 管轄外） |
| Drive の一意化 | 同じ sha1 の画像は Drive にも 1 枚しか置かない。`bot-state.ts` の KV に `driveimg:<sha1> → fileId` を持ち、アップロード済みならファイル ID を再利用する |
| 投稿 | `MisskeyClient.uploadFile(png, name, comment)` を新設する。`drive/files/create` は multipart なので、Node 22 標準の `fetch` + `FormData` + `Blob` で送る（新規依存なし）。`reply()` / `post()` に `fileIds?: string[]` を追加する |
| alt テキスト | Drive の `comment` にプレーン式を入れる |
| クレジット | CC BY 4.0。Bot プロフィールに「数式画像: PenchantManufacture (RadianN_kswg, CC BY 4.0)」を固定で載せる。投稿本文には毎回は入れない |
| VM | 共用 Spot VM に `apt install libcairo2`、`python3 -m venv _calcimage-pipeline/.venv`（PEP 668 対策）、`.env` に `TYPESET_PYTHON`。Bot の実行時依存に Python が加わることは受け入れ済み（ADR 0001） |

## タスク

| # | タスク | 内容 | 確認方法 |
| --- | --- | --- | --- |
| T1 | ✅ サブモジュールの導入 | `git submodule add` と `--recursive`。`tools/setup-image-pipeline.sh`（サブモジュールの取得と venv の構築。`setup-creations-db-sparse.sh` の隣に置く）。deploy.yml のサブモジュール更新が入れ子の `basis/` まで届くか確認する | ローカルで `typeset.py` が PNG を出力する |
| T2 | ✅ `src/features/typeset.ts` | `renderMathPng(tex): Promise<Buffer \| null>`（execFile・3 秒タイムアウト・ローカルキャッシュ） | Python が無い環境で `null` を返すことをテストで固定する |
| T3 | ✅ Misskey への画像投稿 | `uploadFile()` と `fileIds` の追加、Drive の一意化（KV） | 同じ式を 2 回投げてもアップロードが 1 回で済む |
| T4 | ✅ VM の構築 | libcairo2・venv・`TYPESET_PYTHON`・プロフィールのクレジット。`docs/deployment.md` と AGENTS.md の VM 手順に追記する | 実機で画像付きの返信が届く |
| T5 | ✅ 文書 | README の「ライセンス・クレジット」節にサブモジュールを追記する。AGENTS.md のリポジトリ構成に `_calcimage-pipeline/` を足す | — |

## 未確認事項

- パイプラインが受け付ける TeX サブセットと mathjs `toTex()` の出力の食い違い（`\cdot`・`bmatrix`・`\mathrm{}`）は、利用側（F-06 の T4）で吸収する前提にしている。サブセット側の最新の対応状況は着手時に確認する
- 大型演算子（`\sum`・`\int` など）はフォントに未収録。収録されるまで、該当する式は画像にしない
