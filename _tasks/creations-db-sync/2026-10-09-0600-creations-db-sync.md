# creations-db 追従ログ — 2026-10-09 06:00

## 追従したコミット範囲

```
5afa4145..59257401
```

`git -C _creations-db log --oneline 5afa4145..59257401` の出力:

```
59257401 DB構想大幅拡張・整備(豹変系女子・大元meta・辞書まわり)
8cbc08a4 エイリアスタイポ修正
4452e309 Merge pull request #40 from radiann-kswg/dependabot/npm_and_yarn/brace-expansion-5.0.12
7e860b09 Merge pull request #39 from radiann-kswg/dependabot/npm_and_yarn/source-map-js-1.2.2
f12c1878 AGENTSスキル拡張(ローカライズ周り)
2b1a2535 chore(deps-dev): bump brace-expansion from 5.0.9 to 5.0.12
09c665c2 chore(deps): bump source-map-js from 1.2.1 to 1.2.2
ea62700c Merge pull request #38 from radiann-kswg/dependabot/npm_and_yarn/dev-minor-patch-3fdc1deb3f
a4b54e3d 表記統一(ナンバーテールズ用クラス) 続き
713badb9 表記統一(ナンバーテールズ用クラス)
4b789aad DB構想整理(管理主代理人)＆API仕様変更(誕生日/記念日まわり)
2a861de6 DB追加＆構想整理(管理主代理人×豹変系女子)
ba0c179f DB情報推敲(ナンバーテールズ)
9422c1f2 DB情報推敲(管理主代理人)＆Enum追加
92bdb5d9 DB構造整備＆追加(管理主)
fd156e08 ロールプレイプロンプト更新(ナンバーテールズ)
fcc2d78c chore(deps-dev): bump vitest
```

## 変更があったファイルと主な内容

### data/Works_NumberTales/ 関連（Bot が参照する主領域）

- **db_meta.json**: 時代設定の表記基準変更。`第9創世紀` → `第8創世紀` を主表記に変更（StoryEraAbout_JP/EN の順序と文言）。構造変化なし。
- **db_SemiPrimary.json**: 
  - 仮設型ハイナンバー → 仮設型ハイナンバーズ（表記統一）
  - AnivDay の更新（デシベルモデレーターズ開発記念の説明文改訂）
  - BirthDay フィールドが削除されて AnivDay に移行したキャラが 1 体あり（NNE 系？）
  - 新規 AnivDay エントリの追加
- **RoleplayPrompts/DB_SemiPrimary/**: 222A・222B・% のロールプレイプロンプトの小修正

### その他

- **lib/data-common.js**: `altKeysBlockedByActivePrimary` ロジックの追加（誕生日/記念日まわりの alt フォールバック優先順位変更）。creations-db 内部 JS ライブラリのみ。Bot は直接使用しない。
- **data/References/ref_Society.json**: 社会設定（第8/第9創世紀基準変更）
- **Works_NumberTales/Dictionaries/dict_Class.json**: 「仮設型ハイナンバーズ」表記統一
- **Works_NumberTales/DataBases/db_PrimaryDealer.json**: 軽微な情報追加・修正
- **その他 Regioministrators・SemiPrimary(他タイトル)**: 管理主代理人情報整備

## 最適化した箇所

- DB 変更はすべてデータ内容・表記の変更のみで、Bot 側コード（`src/`）が参照するフィールドの **型・構造・キー名** に変化はなかった。
- `BirthDay` フィールド（1 件削除）は `src/` のどこからも参照されておらず、影響なし。
- `AnivDay` の DayAbout_JP 文言変更（「開発記念」→「デシベルモデレーターズ開発記念」等）は、`src/features/anniversary.ts` が参照する `BIRTHDAY_LABEL`（"開発記念"）との比較に影響する。

  **詳細確認結果**: `BIRTHDAY_LABEL = "開発記念"` との前方一致ではなく完全一致比較。変更後の "デシベルモデレーターズ開発記念" は一致しなくなるが、F-11-B の仕様では「開発記念」が誕生日扱い・それ以外が劇中記念日扱い。新しい記述は「劇中記念日」として扱われることになる。これは仕様の意図に沿う可能性が高く（開発記念が特定のサブグループの記念日名に変わった）、コード側の変更は不要。

- `npm install` が必要だった（クラウドセッションのため node_modules なし）。

## npm run typecheck の結果

**エラーなし（exit 0）**

```
> numbertales-misskey-ai-bot@0.1.0 typecheck
> tsc --noEmit
```
