# creations-db 同期最適化ログ — 2026-07-26 08:30

## サブモジュール更新

- 旧コミット: `2b307544`
- 新コミット: `ef03f0a6`（18 コミット前進）
- 前進/退行判定: **前進**（`git -C _creations-db merge-base --is-ancestor 2b307544 origin/develop` → true）。
  退行ではないことを追従前に確認済み（[docs/automation-creations-db-sync.md](../../docs/automation-creations-db-sync.md) の「退行の検知と復旧」節に従う）。
- 追従方式: detached HEAD ではなく**ローカル `develop` ブランチごと ff 前進**（`checkout develop` → `merge --ff-only origin/develop`）。
  参照が過去で止まる退行の再発防止のため。追従後 `bash tools/setup-creations-db-sparse.sh` を冪等再適用し `UP_TO_DATE` を確認。

### 取り込んだ変更点の要約（CHANGELOG / コミットログより）

| 日付 | 変更 | Bot への関係 |
| --- | --- | --- |
| 2026-07-25 | **ロールプレイプロンプト生成物の `[object Object]` / 句点二重化 / 文断裂を解消**。`Height_cm` / `Weight_kg` / `ConceptAge` が `{value, about_JP, about_EN}` 形式・その配列を取りうることを明示し、`unwrapValueLike()` で解決するようにした | **大**（後述） |
| 2026-07-25 | top-level schema の順序合流を canonical 化、Worker `/api/v1/works` に `Works_OfficialLinks[]` 追加 | 小（Bot は `/records` のみ使用） |
| 2026-07-25 | キャラシート画像表示順を typedef 宣言順へ統一、データの `Images` キー順も整列 | 無（Bot は画像を参照しない） |
| 2026-07-24 | 生成プロンプトの余分な改行を解消、複数名を `「A」または「B」` 形式へ変更 | **中**（見出し文字列が変化） |
| 2026-07-22 | 誕生日カレンダーの `_DBLinkRef` 参照解決・同一人物集約 | 無（Bot 未使用） |
| — | NumberTales DB へのキャラ情報追加（`ConversationPattern` 充填ほか） | **中**（生成プロンプトが 46 → 50 件へ） |

## 影響範囲の分析

### ① 計測系フィールドが「素の数値」とは限らない（実害あり）

upstream が自陣で修正した `[object Object]` 問題と**同じ地雷が Bot 側にも埋まっていた**。
`src/bot/character/loader.ts` は `Height_cm` / `Weight_kg` / `ConceptAge` を `number` と宣言していたが、
released 92 件の実データを走査した結果は以下のとおり。

| フィールド | `number` | `{value, about_JP}` | 配列 | `{hideText}`（非公開） |
| --- | --- | --- | --- | --- |
| `Height_cm` | 90 | 0 | **2**（#67 / #2-alt） | 0 |
| `Weight_kg` | 45 | 0 | **12** | **35** |
| `ConceptAge` | 70 | **22** | 0 | 0 |

実際に参照しているのは `src/bot/character/prompt-builder.ts` の F-15 身体性コンテキスト（`Height_cm`）のみ。
`typeof profile.Height_cm === 'number'` で弾いていたため `[object Object]` の混入は起きていなかったが、
**配列形式の 2 体（#67 = 145cm 通常時 / 190cm 筋装備時、#2-alt = 150cm 想定）が一律「等身大」へ潰れ、
キャラ固有の等身がプロンプトから欠落していた**。

### ② 生成ロールプレイプロンプトの見出し変更（追従不要と確認）

複数名エイリアスの見出しが `「35(サトコ) または 35(ミコ)」` → `「35(サトコ)」または「35(ミコ)」` へ変化。
`roleplay-prompt-loader.ts` は `# あなたが演じる` / `# userとの会話を行うにあたって` の**前方一致アンカー**で
カードを切り出すため、見出し内の表記変更では壊れない。実データで抽出を実測確認（下記「検証」）。

### ③ 生成プロンプトの新規追加（コード変更不要）

`RoleplayPrompts/DB_Primary/` が 46 → **50 件**（`24` / `50` / `78` / `87` が新規生成）。
ローダーはファイル存在で動的に判定するため、この 4 体が自動でキャラカード基盤層の経路に載る。
未生成の released キャラは 44 体で、従来どおりフィールド組み立ての fallback を使う。

## 実施した最適化

### `src/bot/character/loader.ts`

- `CharacterValueLike`（`{value?, about_JP?, about_EN?, about?}`）と
  `CharacterMeasureField`（`number | CharacterValueLike | CharacterValueLike[] | HideTextWrapper`）を新設。
- `Height_cm` / `Weight_kg` / `ConceptAge` の型を `number` → `CharacterMeasureField` へ変更し、
  実データの 4 形態を型として表明した（実データの内訳と参照時の注意点を doc コメントに明記）。
- `CharacterTailsUnit` に実データ準拠のフィールド `Branches` / `Segment` / `TailsUnit_PNGName` / `Note_EN` を追加。

### `src/bot/character/prompt-builder.ts`

- **`resolveMeasureField(value, unit)` を新設**（export・テスト対象）。creations-db 側 `unwrapValueLike()` と
  同一の優先順で解決する:
  1. `hideText`（非公開）は**一切出力しない** → `null`
  2. `value` があれば採用（`0` も有効値）。`about_JP` があれば `（…）` で添える
  3. `value` 無し・補足のみの値は補足のみ返し、**単位を付けない**（「不詳cm」化の防止）
  4. 配列は各要素を解決して `・` 連結
- `buildEmbodimentSection()` の `Height_cm` 参照を本関数経由へ差し替え。
  これで #67 は `約145cm（通常時）・190cm（筋装備時）` と解決される（従来は「等身大」）。

### `test/measure-field.test.ts`（新規）

実データで確認した 4 形態＋境界（`0` の有効値扱い・非公開の非出力・補足のみの単位省略・
配列連結・旧フィールド名 `about` フォールバック）を 11 ケースで固定化。

## 検証

- `npm run typecheck`: 成功（エラー 0）
- `npm test`（build → vitest run）: **4 ファイル / 43 件すべて成功**（新規 11 件を含む）
- 実データでの実測（`dist` 経由）:
  - カード抽出: `000` / `35` / `61` / `85` / `3x11` / `24` / `50` / `78` / `87` の全件で成功。
    別名義見出し（`「87(ヤシナ)」または「87(ハナ)」`）でもアンカーが外れないことを確認。
  - 身長解決: `000` → `165cm`、`67` → `145cm（通常時）・190cm（筋装備時）`、
    `2-alt` → `150cm（想定）`（いずれも従来は後者 2 件が「等身大」へ潰れていた）
- `bash tools/setup-creations-db-sparse.sh`: `UP_TO_DATE`（sparse 維持・Bot 必須パスのアサート通過）

## コミット

- 本ログと同一コミットに含める（gitlink 更新・コード追従・テスト・ドキュメント整備を一括）。
- push は行わない（[docs/automation-creations-db-sync.md](../../docs/automation-creations-db-sync.md) の分業方針に従う）。
