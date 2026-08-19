# creations-db 同期最適化ログ — 2026-08-20 08:12

## サブモジュール更新

- 旧コミット: `4299486b`
- 新コミット: `5822ce8d`（**87 コミット前進**。前回追従 2026-07-26 以降、同期が停滞していた分をまとめて取り込み）
- 前進/退行判定: **前進**（`git -C _creations-db merge-base --is-ancestor 4299486b HEAD` → true）。
  退行でないことを追従前に確認済み（[docs/automation-creations-db-sync.md](../../docs/automation-creations-db-sync.md) の「退行の検知と復旧」節）。
- 追従方式: サブモジュール作業ツリーは既にローカル `develop` ブランチで upstream 先端に到達済み
  （`git -C _creations-db fetch origin develop` 後、`HEAD...origin/develop` = `0 0`）。detached HEAD ではない。
  停滞していたのは**親リポジトリ側の gitlink のみ**だったため、本コミットで gitlink を `5822ce8d` へ進めた。
- 追従後 `bash tools/setup-creations-db-sparse.sh` を冪等再適用し `UP_TO_DATE` を確認。

### 取り込んだ変更点の要約（コミットログより）

| 変更 | Bot への関係 |
| --- | --- |
| **`dict_Class.json` がコード（`Class`）と表示名（`Class_JP`）を分離**。レコードの `Class` は `1桁番(ユニデジッツ)` → `1桁番` のコード値に | 小（型宣言のみ・後述①） |
| `build-roleplay-prompts.mjs` に `resolveDictLabels()` を追加し、`Belonging` / `Class` の配列値を 1 要素ずつ辞書解決（複数所属が `A,B` と素通りしていたバグの修正） | 無（生成物の文面改善。抽出アンカーは不変） |
| `RoleplayPrompts/DB_Primary` に `roleplay-prompt-80.md` を新規生成（50 → **51 件**）、既存 12 件を再生成 | **中**（#80 が自動でキャラカード経路に載る） |
| `db_type.json` に `RelationOriginalTo_Primary` / `VariantModels_DBLink` を追加、`$palette` / `$display` 拡張 | 無（Bot 未参照。既存 `RelationTo_Primary` は据え置き） |
| `pkg/nodejs/index.mjs` の `isEmptyForCommons()` が `[]` を「該当なしの明示宣言」として空扱いしないよう変更 | 無（後述②） |
| 相関図 UI の三角格子刷新・SW リファクタ・他作品（ハンカクライブ等）の DB 更新 | 無（Bot は `pkg/nodejs` と `data/Works_NumberTales` のみ参照） |

## 影響範囲の分析

### ① `Class` のコード/表示名分離（コード変更不要）

`src/bot/character/loader.ts` の `CharacterRecord.Class` は**型宣言のみで消費箇所が無い**
（`grep -rn "Class" src/` の結果、`intent.ts` / `classify.ts` の一致は無関係の識別子）。
値がコード側へ変わってもプロンプト生成に影響しない。ただし doc コメントの例が旧表示名のままで
誤解を招くため、実データに合わせて更新した。

### ② `isEmptyForCommons()` の `[]` 扱い変更（実害なし）

`_Commons` からの補完が `[]` に対して働かなくなったため、空配列を持つレコードでは値が欠落し得る。
released 93 件で Bot 参照フィールド（`Class` / `TailsUnit` / `ThisMasters` / `Relation` /
`ConversationPattern` / `Character_JP` / `Summary_JP` / 一人称・二人称）を走査したところ、
**空配列は 0 件**だったため実害なし。

### ③ 生成ロールプレイプロンプトの再生成（コード変更不要）

`DB_Primary/` が 50 → **51 件**（`80` が新規）。`roleplay-prompt-loader.ts` は
`# あなたが演じる` / `# userとの会話を行うにあたって` の前方一致アンカーで切り出すため、
文面の変化では壊れない。全 51 件でアンカーの存在を実測確認済み（下記「検証」）。

### ④ released ロスターは不変

`db_Primary.json` の released は **93 件のまま**（追加・除外いずれも 0）。total 105 件も不変。
キャラ件数を根拠にした記述の更新は不要。

## 実施した最適化

### `src/bot/character/loader.ts`（doc コメントのみ・挙動不変）

- `Class` の例を実データ準拠へ更新し、コード/表示名分離の経緯を明記。
- `Weight_kg` / `TailsUnit.Branches` の母数 `released 92 件中` → `93 件中` へ更新
  （内訳 35 件 / 65 件は実測で不変を確認）。

> コードの追従は不要と判断した。upstream 変更のうち Bot が参照する層（`pkg/nodejs` の
> `getRecords()` 契約、`data/Works_NumberTales` のフィールド名）に破壊的変更が無いため。

## 検証

- `npm run typecheck`: 成功（エラー 0）
- `npm test`（build → vitest run）: **5 ファイル / 78 件すべて成功**
- 実データでの実測（`dist` 経由）:
  - `initializeCharacterDB()` → **`Character DB loaded: 93 released records`**（サブモジュール物理参照で成功。
    Cloudflare API フォールバックへ落ちていない）
  - `getReleasedCharacterByNum('000')` → `000(チトセ)` / `Class: ["開発者代理人","スクエアエリート"]`
  - カード抽出: `0` / `00` / `000` / `1` / `57` / **`80`（新規）** の全件で成功
  - `DB_Primary/*.md` 全 51 件で開始・終了アンカーの存在を確認（欠落 0 件）
- `bash tools/setup-creations-db-sparse.sh`: `UP_TO_DATE`（sparse 維持・Bot 必須パスのアサート通過）

## コミット

- 本ログと gitlink 更新・doc コメント追従を一括で 1 コミットにまとめる。
