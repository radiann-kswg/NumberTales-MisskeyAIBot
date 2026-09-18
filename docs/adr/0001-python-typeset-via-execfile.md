# 数式の画像清書は Python パイプラインを execFile で呼ぶ（TS に移植しない）

数式の画像清書（F-17C）は、[PenchantManufacture_ImagePipeline](https://github.com/radiann-kswg/PenchantManufacture_ImagePipeline)（Python 3.11）を
サブモジュール `_calcimage-pipeline/` に置き、Node の Bot から `child_process.execFile` で呼ぶ。
TS に移植しないのは、フォントメトリクスを実測する組版ロジックを二重に保守することになるから。
その代わりに、共用 Spot VM へ `libcairo2`（apt）と venv を常設し、Bot の実行時依存に Python を加える。
Python が落ちても返答が壊れないよう、画像はあくまで上乗せとして扱い、画像が無くても文面が成立するように組む
（失敗時は PM 絵文字＋プレーン式にフォールバックする）。
2026-09-08 に F-17 計画で方針を決め、2026-09-18 のグリルで実行時依存の受け入れを再確認した。

## Considered Options

- **TS に移植する**: 依存は Node だけで済む。ただしパイプライン本体と組版ロジックを二重に保守することになるので不採用。
- **画像清書をやめて PM 絵文字だけにする**: 縦構造（入れ子の分数・入れ子の根号・行列）は 1 行では表せないので不採用。
