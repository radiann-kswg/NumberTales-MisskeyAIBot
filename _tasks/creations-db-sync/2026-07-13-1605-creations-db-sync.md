# creations-db 同期最適化ログ — 2026-07-13 16:05

## サブモジュール更新

- 旧コミット（記録済み gitlink）: `7d44e5bd`
- 新コミット（作業ツリー HEAD）: `e1d45b71`
- コミット数: 34件（`7d44e5bd..e1d45b71`）／281ファイル（+20,711 / -9,403）

過去最大規模の追従。`pkg/nodejs/index.mjs`（ボットが `CreationsDBClient` として直接 import している
FS クライアント）に 780行の差分が入っており、`data/Works_NumberTales/DataBases/db_Primary.json` からは
7,547行が削除された。ボット側に影響し得る変更を以下に整理する。

### 主な変更点（_creations-db CHANGELOG / コミットログより）

- **`NumberMarkLocation` / `IdentityMotif` の廃止 → `AppearanceDetail` へ一本化**（2026-07-11）:
  両フィールドは `AppearanceDetail`（`$Def_AppearanceDetail[]`）へ移行済みであることが全95レコードで
  確認されたため、`db_type.json` の型宣言（`$Def_NumberMarkLocation` / `$Def_NumberMark` /
  `$Def_FormsMotif`）とともに db_Primary.json の実データから削除された
  （`scripts/migrate-remove-nummark-identitymotif.mjs` で実施）。
  → **ボット側 `src/bot/character/loader.ts` が型定義として保持していた唯一の該当フィールド。今回の追従対象。**
- **`pkg/` FS クライアント 4種の本体追従**（2026-07-13）: `pkg/nodejs` が 2026-06-22 以降追従できて
  いなかった DB 機構へ一括追従。ボットに関わる変更は次の通り。
  - `DB_Hidden` / `Works_Hidden` の**直接アクセス遮断**（従来は `getRecords()` で素通りしていた）。
    専用エラー型 `CreationsDBNotFoundError` を新設し、非公開 DB へのアクセスは throw するようになった。
    → ボットが参照する `NumberTales/Primary` は公開 DB のため遮断対象外。
  - **`isPrivate` フィルタ順序の修正**: `_Commons` 適用「後」に除外するよう変更（従来は前に除外して
    いたため、`_Secondaries[]._Commons.isPrivate: true` によるシリーズ単位の非公開指定が漏れていた）。
    → 実測で NumberTales/Primary に `isPrivate` レコードは **0件**。取得件数に変化なし。
  - `getRecords(workId, dbName, options)` に第3引数 `options`（`applyCommons`、既定 true）、
    コンストラクタに `options`（`includePrivate` / `includeHidden`、いずれも既定 false）を追加。
    **いずれも後方互換**で、既存の 2 引数呼び出し・単一引数コンストラクタはそのまま動作する。
  - `getIndexKey()` / `getWorkType()` を新設。`getRecord()` のインデックスキー `'Num'` 決め打ちを
    スキーマ駆動（`$IndexDef`）解決へ変更。→ ボットは `getRecords()` のみ使用のため影響なし。
- **`Works_Proxies` → `Works_DestinyFoxRecords` へ統合**（2026-07-11）: `data/Works_Proxies/` は削除され、
  `Proxy` DB として統合。→ ボットは `NumberTales/Primary` のみ参照のため影響なし。
- **VRM 3Dビューア対応**（2026-07-12）: `Works_NumberTales` に新規トップレベル `VRMs` を追加（4レコード）。
  → `CharacterRecord` が抽出するフィールドに含まれず、Bot 応答にも使用しないため影響なし。
- **Cloudflare 実 API の R2 復旧**（2026-07-13）: `migrate.mjs` の `wrangler r2 object put` に `--remote` が
  欠落しており、R2 が稼働開始以来ずっと空だった問題を修正。`_Commons` 適用と非公開レコード除外が
  本番 API で機能するようになった。→ ボットのフォールバック経路②（Cloudflare Workers API）の応答が
  正常化する方向の変更。実測で影響なしを確認（後述）。

## 影響範囲の分析

| 変更箇所 | ボット側参照ファイル | 影響 |
|---|---|---|
| `NumberMarkLocation` / `IdentityMotif` 廃止 | `src/bot/character/loader.ts` | **要追従**。`NumberMarkEntry` 型と `CharacterRecord.NumberMarkLocation` が実データに存在しないフィールドを指す状態になった |
| `AppearanceDetail` 新設（全105レコード） | なし | ボットは外見・意匠データを応答に使用しないため型追加は不要（YAGNI） |
| `CreationsDBNotFoundError` 新設・Hidden 遮断 | `src/bot/character/loader.ts` | `NumberTales/Primary` は公開 DB のため遮断対象外。既存 try/catch でフォールバックも維持される |
| `isPrivate` フィルタ順序修正 | `src/bot/character/loader.ts` | Primary に `isPrivate` レコード 0 件。取得件数・内容とも変化なし |
| `getRecords` / コンストラクタへの options 追加 | `src/bot/character/loader.ts` | 後方互換。`ICreationsDBClient` の最小インターフェース定義も変更不要 |
| `VRMs` 新設 | なし | `CharacterRecord` 非対象フィールド |
| `Works_Proxies` 統合・`$IndexDef` サイドカー等 | なし | `NumberTales/Primary` 以外の作品・機構 |
| Cloudflare 実 API の R2 復旧 | `src/bot/character/loader.ts`（フォールバック②） | 実 API の応答を実測し、サブモジュールと同一結果であることを確認 |

## 実施した最適化

**`src/bot/character/loader.ts`**: 廃止された `NumberMarkLocation` の型定義を削除。

- `NumberMarkEntry` インターフェース（export）を削除。
- `CharacterRecord.NumberMarkLocation` フィールド宣言を削除。

削除の根拠:

- 実データで全105レコード中 **0件**（完全消滅）を確認。upstream で型宣言ごと廃止されている。
- `src/` 全体を grep しても参照は `loader.ts` の型定義のみ。`prompt-builder.ts` の
  `buildCharacterSystemPrompt()` は本フィールドを一切読まない（元コメントにも
  「画像生成パイプライン等での参照を想定。Bot 応答には直接使用しない」と明記されていた）。
- 後継の `AppearanceDetail` は意匠・画像参照データであり、ボットの応答生成では使用しないため
  型定義への追加は行わない（実際に使う段階で追加すればよい）。

その他のフィールド（`ThisMasters` / `RelationTo_Primary` / `ConversationPattern` 等）は健在のため変更なし。

## 検証

```
npm run typecheck
→ エラーなし（0件）
```

実データでの動作確認（`CreationsDBClient` を新クライアントで直接実行）:

```
total records : 105
released      : 92
000 found     : true  （Name_JP: 000(チトセ) / ConversationPattern: true / DialogueExamples: 4）

--- released レコードでのフィールド保有数 ---
ConversationPattern : 43    Hobby_JP        : 90    SpecialSkill_JP : 90
Favor_JP            : 90    NumerospecAbout_JP : 91  Strength_JP    : 11
Weakness_JP         : 11    InStory_JP      : 43    Backgrounds_JP  : 39
ThirdPersonCalling_JP : 91  ThisMasters     : 37    RelationTo_Primary : 0（Primary DB には元々非在）

--- 廃止・新設フィールド（全105レコード中） ---
NumberMarkLocation : 0    IdentityMotif : 0    AppearanceDetail : 105    VRMs : 4

isPrivate 保有 : 0
_Commons 注入（Belonging / RaceType）: 適用済み
```

レコード数・released 件数とも前回 2026-07-10 sync 時点と同一。`initializeCharacterDB()` が想定通り
キャラクターDBをロードできること、`CreationsDBNotFoundError` が投げられないことを確認した。

フォールバック経路②（Cloudflare Workers 実 API）の疎通確認:

```
GET https://database.numbertales-radiann.net/api/v1/NumberTales/Primary/records
→ 105 件 / released 92 件 / NumberMarkLocation 0 件（サブモジュールと完全一致）
→ 000(チトセ) を Progress: "released" で取得可能
```

R2 復旧後の本番 API でも、ボットが必要とするレコードが同一内容で取得できることを確認した。

## 追加対応: `Num` 正規化の衝突を修正（ボット側の既存バグ）

同期作業中に発見した **親リポジトリ側（ボット）のバグ**。creations-db 側は `Num` を `"000"` / `"0"` / `"00"`
の別レコードとして正しく区別しており（`000(チトセ)` / `零 零` / `零 百`）、DB 側に問題はない。
`loader.ts` の `normalizeNum()` が先頭ゼロを除去するため、この3つがすべて `"0"` へ潰れて
取り違えが起きる状態だった。

- **発現条件**: 現状は `零 零` / `零 百` の `Progress` が `"released(beta)"` で、`initializeCharacterDB()` の
  `Progress === 'released'` 厳密一致フィルタに除外されるため実害は出ていなかった。ただし両レコードを
  含めて解決すると `"0"` / `"00"` の**どちらも `000(チトセ)` を返す**（誤爆）状態であり、両者が
  `released` へ昇格した時点で顕在化する時限バグだった。
- 旧コミット `7d44e5bd` 時点でも両レコードは存在しており、**今回の DB 更新で発生したものではない**。

**修正（`src/bot/character/loader.ts` の `getReleasedCharacterByNum()`）**: 生値の完全一致を先に試し、
一致しない場合のみゼロ埋め除去（`normalizeNum()`）でフォールバックする2段構えに変更した。
`normalizeNum()` 自体は `"057"` → `"57"` の表記ゆれ吸収に必要なため残している。

検証（`dist/` をビルドして実関数を実行）:

```
--- 現行データ（released のみ）: 後方互換を維持 ---
getReleasedCharacterByNum("000") => Num=000 000(チトセ)
getReleasedCharacterByNum("0")   => Num=000 000(チトセ)   ← 「0番機に切り替えて」が従来どおり動作
getReleasedCharacterByNum("00")  => Num=000 000(チトセ)
getReleasedCharacterByNum("57")  => Num=57  57(イズナ)
getReleasedCharacterByNum("057") => Num=57  57(イズナ)    ← ゼロ埋め吸収も維持
getDefaultCharacterProfile()     => Num=000 000(チトセ)

--- 将来シナリオ（beta 昇格を想定し全105レコードで解決）---
"000"  修正前 => 000(チトセ)   修正後 => 000(チトセ)
"0"    修正前 => 000(チトセ)   修正後 => 零 零     ← 誤爆を解消
"00"   修正前 => 000(チトセ)   修正後 => 零 百     ← 誤爆を解消
```

`零 零` / `零 百` が `released` へ昇格しても、`Num` の指すレコードを取り違えない状態になった。

## コミット

- `chore(creations-db): _creations-db を develop 最新(e1d45b71)へ追従し NumberMarkLocation 廃止に対応`
  - `_creations-db`: gitlink を `7d44e5bd` → `e1d45b71` へ更新
  - `src/bot/character/loader.ts`: `NumberMarkEntry` 型・`CharacterRecord.NumberMarkLocation` を削除
  - `_tasks/2026-07-13-1605-creations-db-sync.md`: 本ログ
- `fix(character): Num 正規化の衝突を修正（"000"/"0"/"00" の取り違えを防止）`
  - `src/bot/character/loader.ts`: `getReleasedCharacterByNum()` を完全一致優先の2段解決に変更
