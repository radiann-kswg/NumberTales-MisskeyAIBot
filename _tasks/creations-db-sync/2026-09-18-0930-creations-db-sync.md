# creations-db 追従ログ — 2026-09-18 09:30 JST

ローカル機での手動追従（`git fetch origin develop` → ローカル `develop` を ff 前進）。

## 追従した _creations-db のコミット範囲

```
908e64ca..96372d16
```

```
96372d16 ロールプレイプロンプト生成機能強化(豹変系女子)
8f755fdb DB情報追加(豹変系女子)＆配色検出スクリプト推敲
4c2499d2 DB情報追加(アンオースドロジカ)
38cf84a8 キャッシュクリアスクリプトを実装
27cc27ff DB構想整理(ナンバーテールズ＆大元辞書)
```

- 前進/退行判定: `git merge-base --is-ancestor 908e64ca 96372d16` → 祖先（**前進**）
- サブモジュールはローカル `develop` ブランチ自体を `origin/develop` へ ff 前進（detached HEAD 解消）
- `.git/modules/_creations-db/index.lock`（0 byte・2026-09-17 08:14、git プロセス無し）が残っていたため削除して続行

## 変更があったファイルと主な内容

### ナンバーテールズ関連

| ファイル | 内容 |
|---|---|
| `data/Works_NumberTales/DataBases/db_SemiPrimary.json` | 221/247/323 の `FormalName` を「同位異格◯◯番機」表記へ変更し `ModelName_JP/EN` 追加、221 の `GenderType` を `FemaleNeutral` へ。512 の `Name`/`CodeName` 修正（8³→2⁹）。729 の `FormalName`/`ModelName` 修正と `Class` から `キャレ型` 削除 |
| `data/Works_NumberTales/DataBases/db_SelfSecondary.json` | 変更（sparse-checkout 除外対象） |

### その他（ナンバーテールズ以外）

- `data/Works_SinisterChangingGirls/`：豹変系女子の DB 情報・ロールプレイプロンプト（テンプレート・N/S）追加
- `data/Works_UnauthedLogica/`：アンオースドロジカの DB 情報追加
- `data/Dictionaries/dict_Faction.json`：大元辞書整理（sparse-checkout 除外対象）
- `tools/build-roleplay-prompts.mjs`：enrich 付き `*_DBLink` からの不足フィールド補填。NumberTales の `RoleplayPrompts/` は再生成なし
- `tools/clean-cache.mjs` ほかテスト・docs：フレームワーク側のみ

## Bot 側への影響分析

- Bot が読むのは `NumberTales/Primary`（`loader.ts:240`）と `RoleplayPrompts/DB_Primary/` のみ。いずれも今回**無変更**。
- `db_SemiPrimary.json` は Bot から読み込まれない。変更フィールド（`FormalName`/`ModelName`/`GenderType`/`Class`）を `src/` で参照している箇所もなし。
- `pkg/nodejs/`（`CreationsDBClient`）も無変更。

→ **コード変更不要**

## 最適化した箇所

なし（gitlink の更新のみ）。

## 検証

- sparse-checkout: `tools/setup-creations-db-sparse.sh` → `UP_TO_DATE`（必須パスのアサート通過）、`git -C _creations-db status` clean
- `npm run typecheck`：エラーなし
- `npm test`：9 ファイル / 128 件すべて成功
