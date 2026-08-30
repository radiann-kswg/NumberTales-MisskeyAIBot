# creations-db 追従ログ — 2026-08-30

## 追従コミット範囲

```
cc0aa87 DB情報追加(絵チャット成果物類)
a50c52c VRMモデル追加 その３
```

範囲: `4c460038..cc0aa877`

## 変更があったファイルと主な内容

### `data/Works_NumberTales/DataBases/db_Primary.json`

既存キャラクターエントリへの画像パス追加:

| キャラクター | 変更内容 |
|---|---|
| NTS-13 | `arts_PNGPath` に `chattingArt/chart_imgNTS-13-humanoid` を追加 |
| NTS-26 | `arts_PNGPath` 新規追加（`chattingArt/chart_imgNTS-26-humanoid`） |
| NTS-30 | `arts_PNGPath` に `chattingArt/chart_imgNTS-30-humanoid` を追加 |
| NTS-47 | `arts_PNGPath` に `chattingArt/2023/chart_imgNTS-47,NTS-74-humanoid` を追加 |
| NTS-67A | `arts_PNGPath` 新規追加（`chattingArt/chart_imgNTS-67A-humanoid`） |
| NTS-67B | `arts_PNGPath` 新規追加（`chattingArt/chart_imgNTS-67B-humanoid`） |
| NTS-69 | `designAlt_PNGPath` に `chattingArt/chart_imgNTS-69-humanoidLeotard` を追加 |
| NTS-74 | `arts_PNGPath` に `chattingArt/2023/chart_imgNTS-47,NTS-74-humanoid` を追加 |
| NTS-75 | `arts_PNGPath` に `chattingArt/chart_imgNTS-75-humanoidSaveYourself` を追加 |

### VRM ファイル（NumberTales）

- `VRMs/DB_Primary/corefolder/22/vrm_NTS-22-corefolder.vrm` — 更新
- `VRMs/DB_Primary/corefolder/22/vrm_NTS-22-corefolder.png` — サムネイル追加
- `VRMs/DB_Primary/corefolder/93/vrm_NTS-93-corefolder.vrm` — 更新
- `VRMs/DB_Primary/corefolder/93/vrm_NTS-93-corefolder.png` — サムネイル追加

### `data/Works_ShouArRiders/DataBases/db_Primary.json`

| キャラクター | 変更内容 |
|---|---|
| SAR-EZ1 | `art_PNGPath` 新規追加（`chattingArt/chart_imgSAR-EZ1`） |
| SAR-EZ4 | `art_PNGPath` 新規追加（`chattingArt/chart_imgSAR-EZ4`） |

## 最適化した箇所

なし。今回の差分は画像パス（`arts_PNGPath` / `designAlt_PNGPath` / `art_PNGPath`）と VRM ファイルの追加・更新のみ。  
`src/` 側にこれらフィールドへの参照は存在しないため、コード側の変更は不要。

## npm run typecheck の結果

既存エラーあり（サブモジュール更新と無関係）:

- `src/utils/heartbeat.ts`, `src/utils/incident-logger.ts`, `src/utils/logger.ts` で `@types/node` 未インストールに起因するエラー  
  （`Cannot find name 'node:fs'` 等）  
- 本タスクの変更による新規エラーは **0 件**
