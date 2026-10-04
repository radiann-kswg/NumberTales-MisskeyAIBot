# creations-db 追従ログ — 2026-10-04 09:25 JST

手動追従（ドキュメント更新 PR #55 のついでにクライアント君の依頼で実施）。`_calcimage-pipeline` も `--remote` で確認したが upstream に更新なし（`347965b` のまま）。

## サブモジュール更新

- 旧コミット: `82411ecf`
- 新コミット: `5afa4145`
- 判定: `git merge-base --is-ancestor 82411ecf 5afa4145` → **前進**
- 取り込んだ変更点（12 コミット）:

```
5afa4145 参考資料周り整備(作中メタなど)
51a32f83 DB情報更新(桜花兄弟・パストダイヴァー周辺)
29d233bc Merge branch 'develop'
11ae637f 表記変更 その２
6aa461ca DB情報更新(作中メタ周り・豹変系女子)＆表記変更 その１
7ef73d81 DB情報追加(ナンバーテールズ)
e6dcc7ff / 0419c781 dependabot（undici 8.11.2・dev-minor-patch）
71638f0a DB情報追加(ナンバーテールズ＆劇中地理メタ周り)
3a645ff8 DB進捗更新(ナンバーテールズ)
```

## 影響範囲の分析

### ナンバーテールズ関連（Bot から参照されるパス）

| ファイル | 内容 |
| --- | --- |
| `DataBases/db_Primary.json` | **0(零) と 00(零百) が `unprofiled` → `released`**。`Character/Hobby/SpecialSkill/Favor/Unlike/Summary` と 00 の `FirstPersonCalling_JP` が埋まった。000(チトセ) の `Summary_JP/EN` 更新 |
| `DataBases/db_SemiPrimary.json` | 222A(ペルゲン)・222B(ドッペル) に `ConversationPattern` 新設。立方体番号群（125/216/343/512/729）・64・% の `Belonging` 表記変更 |
| `DataBases/db_meta.json` | `Belonging.Faction` の表記「シンフォニー.X(ツェーン)」→「シンフォニー.X」 |
| `RoleplayPrompts/DB_Primary/roleplay-prompt-0.md` / `-00.md` | 既存カードの微修正（0 は 1 行・00 は 7 行） |
| `RoleplayPrompts/DB_SemiPrimary/roleplay-prompt-222A.md` / `-222B.md` | **新規追加**（Bot は SemiPrimary のカードを参照しないため影響なし） |
| `Images/.../tailsUnit/attr_tailsUnitNTS-87.png` | 画像追加（Bot は参照しない） |

### Bot 側への影響

| 変更 | 影響 |
| --- | --- |
| 0(零)・00(零百) が released 化 | `getReleasedCharacters()` に **2 名増える**（released 92 → 94 相当）。(a) 「0番と話したい」で切り替え可能になる（カード `roleplay-prompt-0/00.md` あり）。(b) 週次担当の候補は `FIXED_EXCLUDE_NUMS` に `'0'`/`'00'` が入っているので従来どおり除外。(c) 計算問題の番号モードは `numericCharacterNums` が `value <= 0` を弾くので 0・00 は答えにならない。(d) **キャラ番号ルーレットは released 全員から引いていた**ため 0・00 も当たり得た（→ 下記のとおり対象を絞った）。(e) F-11-B は `AnivDay` を持っていれば記念日投稿の対象になる |
| 222A/222B の `ConversationPattern` | SemiPrimary は Bot が読まないため影響なし |
| `Belonging` / `db_meta` の表記変更 | `loader.ts` は `Belonging` を参照しないため影響なし |
| 000 の `Summary_JP` 更新 | fallback 経路の「概要メモ」に反映。000 はカード経路なので実質カード側の文面が使われる |

→ ルーレットの抽選対象を「コアフォルダ絵文字がインスタンスに登録されている個体」に絞った（`isRouletteEligible`・同日のクライアント君判断）。0/00 は 000 と絵文字名が衝突するため 000 だけ通す。ほかはコード変更不要。

## 実施した最適化

- `features/f06/index.ts`: `isRouletteEligible()` を追加し、ルーレットの抽選対象をコアフォルダ絵文字を持つ個体に限定（`test/roulette.test.ts` で固定）。
- gitlink の更新。`tools/setup-creations-db-sparse.sh` は `UP_TO_DATE`（必須パスのアサート通過）。

## 検証

- `npm test`: 12 ファイル / 193 件 PASS（新 gitlink の DB を読む `measure-field` / `prompt-builder` 含む）

## コミット

- `8398599` — `chore(creations-db): _creations-db を 82411ecf → 5afa4145 へ追従（2026-10-04）`（gitlink 更新と本ログの作成）
- `c71c258` — `fix(f06): キャラ番号ルーレットの抽選対象をコアフォルダ絵文字を持つ個体に限定する`（上記の最適化と回帰テスト）
