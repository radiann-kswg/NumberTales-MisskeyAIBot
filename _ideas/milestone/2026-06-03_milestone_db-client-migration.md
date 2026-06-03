# DB参照改修 — `pkg/nodejs` クライアントへの移行

> 作成日: 2026-06-03
> ステータス: **未着手** ⏳

---

## 概要

現状の Bot は `_creations-db/data/Works_NumberTales/DataBases/db_Primary.json` を
静的 `import` で直接参照している。創作DB に新規追加された `pkg/nodejs/index.mjs`
（`CreationsDBClient`）を使用することで、DB フラグ（`DB_Hidden` / `Works_Hidden`）を
自動尊重する API ベースの参照へ移行する。

これは `_ideas/future-plan/creations-db-reference-expansion.md` で検討中だったアイデアの具体化にあたる。

## 改修背景

- `_creations-db` の `pkg/nodejs/index.mjs` が 2026-06-02 の DB 更新（commit `202e49a`）で追加された
- コンストラクタ引数なし（`new CreationsDBClient()` のみ）でサブモジュール配置から自動解決できる
- 現状の静的 `import` では `DB_Hidden: true` の DB がアクセス制御されず素通りする
- 将来の HTTP フォールバック（`future-plan/creations-db-reference-expansion.md`）への足場になる

## 変更対象ファイル

| ファイル                      | 現状                                            | 改修後                                                  |
| ----------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| `src/bot/character/loader.ts` | `import(...)` で `db_Primary.json` を直読み     | `CreationsDBClient.getRecord()` / `getRecords()` に変更 |
| `src/config/env.ts`           | `DB_PRIMARY_JSON_PATH` 定数でファイルパスを保持 | クライアント初期化用定数へ整理                          |

## タスク詳細

### M-A-1: `CreationsDBClient` の読み込み・型整合の確認

- `_creations-db/pkg/nodejs/index.mjs` の `import` 方法を確認（ESM 形式）
- `tsconfig.json` の `moduleResolution` / `allowJs` との整合を確認
- 型定義（`.d.ts`）が存在しない場合は `src/types/creationsdb.d.ts` を手動で作成
- `loader.ts` の `CharacterRecord` 型と `CreationsDBClient` の返却型をマッピング

### M-A-2: `loader.ts` の参照ロジック置き換え

- `getCharacterProfile(num)` を `client.getRecord('Works_NumberTales', 'db_Primary', num)` に変更
- `getReleasedCharacters()` を `client.getRecords('Works_NumberTales', 'db_Primary')` に変更
- `includePrivate: false`（デフォルト）で `isPrivate: true` レコードが自動除外されることを確認

### M-A-3: `env.ts` のパス定数整理

- `DB_PRIMARY_JSON_PATH` 定数を削除または非推奨化
- 必要に応じて `CREATIONS_DB_REPO_ROOT` を明示設定する定数を追加（通常は自動解決なので不要）

### M-A-4: 動作確認

- `npm run typecheck` でエラーなし
- キャラクター切り替え・F-06 ヌメロジー・週次担当選出が正常動作することを確認
- 存在しない番号を指定した場合（`getRecord()` が `null` を返す）の挙動がこれまでと同等であることを確認

## 依存関係

- `_creations-db` サブモジュールが `202e49a`（`pkg/nodejs/index.mjs` を含むバージョン）以降であること
- `loader.ts` を参照するすべての既存機能（F-06・マルチキャラ・週次担当・就任挨拶）が影響範囲

## 注意事項

- `pkg/nodejs/index.mjs` は ES Module 形式のため、`import()` dynamic import または `createRequire()` の使用が必要になる場合がある
- `CreationsDBClient` はファイルシステム I/O で同期的に動作しているが、非同期 API であることに注意
- 型定義が自動生成されない場合、返却値の型を `CharacterRecord` に手動でアサーションする最小限の型定義で対応すること
