# creations-db 追従ログ — 2026-09-24 06:00 JST

## 追従コミット範囲

```
0b89f4f2..523c5174
```

（master ブランチ基点。昨日の detached HEAD 上コミット分 21b72c67 も含む）

| コミット | メッセージ |
|---------|-----------|
| 523c5174 | DB進捗更新(運命線狐の記録) |
| 36567e5f | UI仕様変更 |
| c6d6f334 | DB進捗更新(人形兵ゼロイド) |
| 2786067e | DB進捗更新(人形兵ゼロイド周り)＆API周りbugfix |
| e0817980 | UI修正(代理周辺) |
| 21b72c67 | DB進捗更新(代理) |

## 変更があったファイルと主な内容

### Dictionaries
- `dict_Faction.json` — 「百花繚乱研究国際大使所」「百戦錬磨開発所」の `BaseAreaAbout` 追記、「シンフォニー.X(ツェーン)」新規追加
- `dict_RaceType.json` — `CustomAutomaton(TaleBeastType)` → `CustomAutomaton` に統一（basis を Humanoid に変更）
- `dict_SymphonyX.json` — 新規追加（シンフォニー.X向けクラス辞書）
- `db_meta.json` (Dictionaries) — `#Dict_SymphonyX` エントリ追加

### Works_NumberTales
- `DataBases/db_Primary.json` — 軽微な更新（差分あり）

### Works_UnauthedLogica（主な変更）
- `DataBases/db_Primary.json` — 大幅追加（+2219行）：人形兵ゼロイド・運命線狐関連キャラクターデータ
- `DataBases/db_meta.json` / `db_type.json` — メタ定義更新
- `Dictionaries/dict_Battlers.json` / `dict_Beauties.json` / `dict_Class.json` / `dict_MobClass.json` / `dict_ModelSeries.json` — 辞書更新・追加
- `Dictionaries/db_meta.json` — 新規追加
- `Images/DB_Primary/concept/cnsp_imgUAL-Z61.png` — コンセプト画像追加
- `References/_DesignNotes/number-tier.md` — 新規追加（ナンバーティア設計ノート）

### その他
- `data/References/ref_Society.json` — 社会参照データ追加
- `data/db_meta.json` / `db_type.json` — 全体メタ更新
- `CHANGELOG.md` — 変更履歴追加（+50行）
- `docs/api-sw-spec.md` / `docs/schema-meta-processing.md` — ドキュメント更新
- `lib/data-common.js` / `pages/` — UIライブラリ・ページ更新
- `tests/enrich.dblink.jump.merge.test.js` — テスト追加

## 最適化した箇所

なし。`src/bot/character/` および `src/features/f06/` は変更されたフィールド
（`RaceType`・`Faction`・`dict_SymphonyX`等）を直接参照していないため、
コード側の追従は不要と判断した。

## npm run typecheck の結果

111件のエラーあり。ただし**すべて既存の依存パッケージ未インストールに起因**：
- `@types/node` 未インストール（`node:fs`/`node:path`/`process`/`setInterval` 等）
- `misskey-js` / `better-sqlite3` / `openai` / `@google/generative-ai` / `mathjs` / `dotenv` 未インストール

creations-db の今回の変更に起因する新規型エラーはゼロ。
