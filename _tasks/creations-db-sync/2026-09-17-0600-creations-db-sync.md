# creations-db 追従ログ — 2026-09-17 06:00 JST

## 追従した _creations-db のコミット範囲

```
96372d16 ロールプレイプロンプト生成機能強化(豹変系女子)
8f755fdb DB情報追加(豹変系女子)＆配色検出スクリプト推敲
4c2499d2 DB情報追加(アンオースドロジカ)
38cf84a8 キャッシュクリアスクリプトを実装
27cc27ff DB構想整理(ナンバーテールズ＆大元辞書)
```

記録済み gitlink: `908e64ca` → 追従先 HEAD: `96372d16`

## 変更があったファイルと主な内容

### NumberTales 関連（Bot 参照対象）

**`data/Works_NumberTales/DataBases/db_SemiPrimary.json`**
- `221(チェイン)`: `FormalName_JP/EN` を「仮称13×17号機(221番機)」→「仮称13×17号機(同位異格221番機)」に変更。`ModelName_JP/EN` フィールドを新規追加。`GenderType` を `Neutral` → `FemaleNeutral` に変更
- `247(マンソーンジュ)`: 同様に `FormalName` 変更（同位異格表記）、`ModelName_JP/EN` 追加
- `323(トロンペ)`: 同様に `FormalName` 変更（同位異格表記）、`ModelName_JP/EN` 追加
- `512(ハキビ)`: `Name_JP/EN` の `8³` を `2⁹` に変更、`CodeName` から「立法八/Eight Cubed」を削除
- `729(ナブク)`: `FormalName` 変更（「仮設」→「想定機」）、`ModelName` を2行形式に変更、`Class` から「キャレ型」を削除

**`data/Works_NumberTales/DataBases/db_SelfSecondary.json`**（sparse-checkout 除外対象）
- 221, 247, 323, 451, 813 番機に `Belonging` フィールドを追加

**`data/Dictionaries/dict_Faction.json`**
- 「ティーポットベリー・コンピューティング」（英皇国系メーカー）を新規追加
- 「白の六芒星」`RegionstyleWithin` を W → X に変更
- 「照梅テクノロジー」`RegionstyleWithin` を X → W に変更
- 「レゾンデイトルカンパニー」`RegionstyleWithin` を W → X に変更
- 「スターダスト財団」`isAcademic` を `false` → `null` に変更

### 別作品（sparse-checkout 除外・Bot 非参照）

- `data/Works_SinisterChangingGirls/` — 豹変系女子 DB 追加・ロールプレイプロンプト生成強化
- `data/Works_UnauthedLogica/DataBases/db_Primary.json` — アンオースドロジカ DB 追加
- ツール類: `tools/build-roleplay-prompts.mjs`（強化）、`tools/clean-cache.mjs`（新規）、`tools/patch-colorpalette.mjs`（推敲）

## 最適化した箇所

なし。

変更されたフィールド（`FormalName_JP/EN`、`ModelName_JP/EN`、`GenderType`、`CodeName_JP/EN`、`Class`、`Belonging`）はいずれも `src/` 内の Bot コードで直接参照されていない。`CharacterRecord` インターフェース（`loader.ts`）は参照しないフィールドを型に持たないため、型定義の更新も不要。

## npm run typecheck の結果

```
> numbertales-misskey-ai-bot@0.1.0 typecheck
> tsc --noEmit
```

エラーなし（クリーン）。
