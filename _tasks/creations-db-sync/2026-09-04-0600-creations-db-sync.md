# creations-db 追従ログ — 2026-09-04 06:00 JST

## 追従コミット範囲

```
3d10a0a6 fix: CI の Node を 22 系へ固定(jsdom/undici の要求と不整合)
51cfef9b DB情報追加(ナンバーテールズ)
9ad33b17 DB進捗更新(ナンバーテールズ)
e7f97491 API構造拡張(相関図URL)
421d050a API構造拡張(キャラシートURL)
a334a7e4 DB進捗更新(パストダイヴァー)
```

旧 gitlink (master 記録済み): `b3241ceee4143f504369e7494ee6989e378edd5f`  
新 gitlink: `3d10a0a6c2ba1966b689faa4da7b1396b84a9932`

## 変更があったファイルと主な内容

| ファイル | 内容 |
| --- | --- |
| `data/Works_NumberTales/DataBases/db_Primary.json` | 64号機（64(ムトシ)）の外見情報更新（コスチューム細分化）・`Hobby` hideText を "？？？" → "検閲済み"/"Censored" に整理 |
| `data/Works_NumberTales/DataBases/db_SemiPrimary.json` | 64XP（ゼフィア）の `Progress` を "stillTentative" → **"released"** に変更・設定追記。`img_PNGName` を `null` → `"attr_numberMarkNTS-64XP"` 等に更新 |
| `data/Works_NumberTales/DataBases/db_Primary.json` | 64号機の `img_PNGName` を `null` → `"attr_numberMarkNTS-64"` に更新 |
| `data/Works_NumberTales/Dictionaries/dict_Class.json` | 全クラスエントリに `Class_Code` フィールド追加（例: "1桁番" → `"N1D"`、"10倍番" → `"NDD"`） |
| `data/Works_NumberTales/Images/…/attr_numberMarkNTS-64*.png` | 64号機・64XP の数字マーク PNG を新規追加（3件） |
| `data/Works_NumberTales/DataBases/db_SemiPrimary.json` の `DB_SemiPrimary/concept/` | 64XP のコンセプト画像追加 |
| `data/Works_PastDivers/DataBases/db_SemiPrimary.json` | PastDivers 進捗更新 |
| `lib/viewer-locator.js` | キャラシート短縮URL（`$Index_Badge` 型フィールド）対応 |
| `lib/relations-locator.js` | 相関図短縮URL対応 |
| `data/Works_NumberTales/Dictionaries/dict_Triples.json` | トリプルス辞書エントリ追加 |
| `CHANGELOG.md` | 上記変更の履歴追記 |
| `tests/` | `lib.viewer-locator.test.js` / `lib.relations-locator.test.js` / `data.facet-codes.test.js` 追加 |

## 最適化した箇所

**なし。**

今回の差分はボット側コードへの影響なし。理由は以下の通り：

- **`dict_Class.json` に `Class_Code` 追加**: ボットは `dict_Class.json` を直接読まない。キャラクターレコードの `Class?: string[]` フィールドはクラス名の配列を保持しており、型定義（`loader.ts:162`）は既存のままで問題なし。
- **`db_Primary.json` の 64号機外見・hideText 更新**: データ変更のみ。`Hobby_JP` の `hideText` は既存の `HideTextWrapper` 型（`loader.ts:64`）で処理済み。
- **`db_SemiPrimary.json` の 64XP が "released" に**: ボットの `initializeCharacterDB()` は `Primary` DB のみを読む（`loader.ts:228`）。SemiPrimary はロールプレイプロンプト経由のみだが、64XP のロールプレイプロンプト（`RoleplayPrompts/DB_SemiPrimary/roleplay-prompt-64-sxp.md`）は未生成のため、`roleplay-prompt-loader.ts` が `null` を返して fallback 経路へ委ねる（既存の挙動）。
- **`lib/viewer-locator.js` / `lib/relations-locator.js` の拡張**: DB UI ライブラリのみの変更で、ボットのランタイムコードはこれらを直接インポートしていない。
- **画像ファイル追加**: ボットは画像ファイルを参照しない。

## npm run typecheck 結果

```
> numbertales-misskey-ai-bot@0.1.0 typecheck
> tsc --noEmit

（エラーなし・正常終了）
```

※ 初期クローン環境のため `npm install` を事前実行してから typecheck を実施した。
