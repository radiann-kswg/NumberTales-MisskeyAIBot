# creations-db 追従ログ — 2026-09-13 06:00 JST

## 追従したコミット範囲

`74cfc585..04d1bf77`（8 コミット）

```
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

### Works_NumberTales 関連

- `data/Works_NumberTales/Images/DB_Primary/corefolder/93/emstk_corefolderNTS-93-2.png`
  - 93(クミ) のコアフォルダ画像を修正（尻尾形状の誤りを修正）
  - JSON データの変更は **なし**

### 共有辞書・ローカライズ（NumberTales 以外の作品由来の変更）

- `data/Dictionaries/dict_Faction.json`
- `data/Localization/trans_PersonName.json`
- `data/Localization/trans_Phenomenon.json`
- `data/Localization/trans_PlaceName.json`
- `data/Localization/trans_Regions.json`
- `data/Localization/trans_Society.json`
- `data/Localization/trans_Titles.json`

変更理由: 獣爾騎兵の英語表記を `ShauErRiders / Shau'er Riders` へ全改名した際の反映。

### その他（Bot スコープ外）

- `data/Works_ShauErRiders/` — 獣爾騎兵データ（別作品）の改名・API追加
- `data/Works_SinisterChangingGirls/DataBases/db_Primary.json` — 豹変系女子キャラ追加
- `data/Works_ShouArRiders/Localization/trans_FamilyName.json` — 別作品
- `.agents/skills/`, `.claude/skills/` — grilling/grill-me スキル追加（MIT）
- `lib/`, `pages/`, `pkg/`, `tests/` — creations-db フレームワーク側の改修
- `docs/`, `guideline*.md` — ドキュメント更新

## 最適化した箇所

**なし。**

今回の変更で Bot コード（`src/`）への影響はゼロ:
- `Works_NumberTales` の JSON データ変更なし（画像のみ）
- 共有辞書の変更は `_creations-db/pkg/nodejs/index.mjs` ライブラリが吸収
- `src/bot/character/` のフィールドマッピングに影響する変更なし
- `src/features/f06/` のヌメロジー参照に影響する変更なし

## npm run typecheck の結果

```
> numbertales-misskey-ai-bot@0.1.0 typecheck
> tsc --noEmit

(エラーなし・正常終了)
```

※ リモートセッション起動時は `node_modules` が未インストールのため、先に `npm install` を実施した。
  typecheck エラーは今回の creations-db 追従によるものではなく、クリーン環境での初期状態であることを確認済み。
