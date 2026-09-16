# creations-db 追従ログ — 2026-09-14 06:00 JST

## 追従した _creations-db のコミット範囲

```
74cfc585..14822d44
```

```
14822d44 Merge pull request #35 from radiann-kswg/dependabot/npm_and_yarn/dev-minor-patch-50f6077c1c
d76bbc9a DB構想追加(ナンバーテールズ)
20514d92 DB情報追加(ナンバーテールズ)
f2f8c515 chore(deps-dev): bump playwright in the dev-minor-patch group
04d1bf77 DB情報修正(ナンバーテールズ)
a6ab69ac Merge pull request #34 from radiann-kswg/fix/shauer-riders-api-alias
367a9dd8 API/SWルート解決機能を追加(獣爾騎兵)
fc63407b Merge pull request #33 from radiann-kswg/fix/shauer-riders-rename
5a262b1d DB進捗更新(豹変系女子) ミル・ニュクスフを完成
43161e2e 獣爾騎兵の英語表記改名の追従（フレームワーク側）+ 旧直リンク互換
5c4fa4c0 獣爾騎兵の英語表記を ShauErRiders / Shau'er Riders へ全改名（データ側）
cb8e6ed8 docs/data: 創作ガイドラインを新規 4 タイトル向けに補填 + 獣爾騎兵の公式サイトを db_meta へ登録
a9e01853 skills: grilling / grill-me を .agents/skills へ取り込み（mattpocock/skills, MIT）
```

## 変更があったファイルと主な内容

### ナンバーテールズ関連（Bot に影響する可能性があるもの）

| ファイル | 内容 |
|---|---|
| `data/Works_NumberTales/DataBases/db_SemiPrimary.json` | 新キャラクター3体追加（221/247-ma/323-ma、Progress: notProceeded）、既存キャラクターの Class 配列更新（デュオトリプル系・トリプルセブンズ等→マルチアドレセンス） |
| `data/Works_NumberTales/DataBases/db_SelfSecondary.json` | 既存キャラクターの Class 更新（sparse-checkout 除外対象） |
| `data/Works_NumberTales/DataBases/db_UnprocessedSecondary.json` | 変更（sparse-checkout 除外対象） |
| `data/Works_NumberTales/Dictionaries/dict_Class.json` | 新クラス追加: `マルチアドレセンス`(NMA)・`プリーミアコンストレイント`(NNP) |
| `data/Works_NumberTales/Images/DB_Primary/attr/tailsUnit/attr_tailsUnitNTS-63.png` | 63(ムツミ) 尻尾形状アトラス画像追加 |
| `data/Works_NumberTales/Images/DB_Primary/attr/tailsUnit/attr_tailsUnitNTS-75.png` | 75(シチゴ) 尻尾形状アトラス画像追加 |
| `data/Works_NumberTales/Images/DB_Primary/corefolder/93/emstk_corefolderNTS-93-2.png` | 93(クミ) コアフォルダ画像修正 |

### その他（ナンバーテールズ以外）

- `data/Works_ShauErRiders/` 全体：「獣爾騎兵」の英語表記を ShauErRiders / Shau'er Riders へ全改名
- `data/Localization/` 各種：翻訳辞書更新
- `.agents/skills/grilling`, `grill-me`：外部スキル取り込み（Bot 側と無関係）

## Bot 側への影響分析

### 新キャラクター（221 / 247-ma / 323-ma）

いずれも `Progress: "notProceeded"` のため、以下のフィルタにより Bot の公開キャラクターリストに含まれない。

- `loader.ts:230,243` — `entry.Progress === 'released'` のみ返す
- `weekly-poll.ts:48` — `progress === 'released' || progress === 'released(beta)'` のみ候補

→ **コード変更不要**

### Class 配列の変更（既存キャラクター）

`src/` 内で `Class` フィールドを直接参照しているコードはなし（型定義のみ）。  
Bot の prompt-builder・weekly-poll・F-06 ルーレット等への影響なし。

→ **コード変更不要**

### 新クラス定義（dict_Class.json）

`dict_Class.json` を読み込むコードは Bot 側に存在しない（スキーマ参照型定義のみ）。

→ **コード変更不要**

### 画像ファイル

Bot 本体は画像ファイルを直接読み込まない（URL 参照のみ）。

→ **影響なし**

## 最適化した箇所

なし（今回の DB 変更はコード側の追従が不要な変更のみ）。

## npm run typecheck の結果

```
npm run typecheck
> numbertales-misskey-ai-bot@0.1.0 typecheck
> tsc --noEmit

exit_code=0（エラーなし）
```
