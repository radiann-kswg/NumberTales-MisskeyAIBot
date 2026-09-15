# creations-db 同期最適化ログ — 2026-09-15 06:00

## サブモジュール更新

- 旧コミット（記録済み gitlink）: `74cfc585`
- 新コミット（作業ツリー HEAD）: `908e64ca`（**14 コミット前進**。前回追従 2026-09-08 以降）
- 前進/退行判定: **前進**（旧コミット `74cfc585` は新コミット `908e64ca` の祖先）
- sparse-checkout は維持（Works_NumberTales 一次系のみ）

### コミットログ（74cfc585..908e64ca）

```
908e64c 旧綴り別名解決をPython/C#クライアントへ追従(獣爾騎兵)
14822d4 Merge pull request #35 from radiann-kswg/dependabot/npm_and_yarn/dev-minor-patch-50f6077c1c
d76bbc9 DB構想追加(ナンバーテールズ)
20514d9 DB情報追加(ナンバーテールズ)
f2f8c51 chore(deps-dev): bump playwright in the dev-minor-patch group
04d1bf7 DB情報修正(ナンバーテールズ)
a6ab69a Merge pull request #34 from radiann-kswg/fix/shauer-riders-api-alias
367a9dd API/SWルート解決機能を追加(獣爾騎兵)
fc63407 Merge pull request #33 from radiann-kswg/fix/shauer-riders-rename
5a262b1 DB進捗更新(豹変系女子) ミル・ニュクスフを完成
43161e2 獣爾騎兵の英語表記改名の追従（フレームワーク側）+ 旧直リンク互換
5c4fa4c 獣爾騎兵の英語表記を ShauErRiders / Shau'er Riders へ全改名（データ側）
cb8e6ed docs/data: 創作ガイドラインを新規 4 タイトル向けに補填 + 獣爾騎兵の公式サイトを db_meta へ登録
a9e0185 skills: grilling / grill-me を .agents/skills へ取り込み（mattpocock/skills, MIT）
```

### 変更ファイルと主な内容（NumberTales 関連）

| ファイル | 内容 |
| --- | --- |
| `data/Works_NumberTales/DataBases/db_SemiPrimary.json` | **Class フィールド更新**（既存キャラ複数）＋**新キャラ追加** 3 件（後述） |
| `data/Works_NumberTales/DataBases/db_SelfSecondary.json` | 関連変更（221B / 247 / 323 の SelfSecondary 側エントリへの参照追加と思われる） |
| `data/Works_NumberTales/DataBases/db_UnprocessedSecondary.json` | 関連変更 |
| `data/Works_NumberTales/Dictionaries/dict_Class.json` | 新 Class 定義 2 件追加（後述） |
| `data/Works_NumberTales/Images/DB_Primary/attr/tailsUnit/attr_tailsUnitNTS-63.png` | Primary 63 の tailsUnit 画像更新（Bot は参照しない） |
| `data/Works_NumberTales/Images/DB_Primary/attr/tailsUnit/attr_tailsUnitNTS-75.png` | Primary 75 の tailsUnit 画像更新（Bot は参照しない） |
| `data/Works_NumberTales/Images/DB_Primary/corefolder/93/emstk_corefolderNTS-93-2.png` | Primary 93 のコアフォルダ画像追加（Bot は参照しない） |
| `docs/localization-en-rules.md` | 英語ローカライズルール更新（Bot の参照なし） |
| `docs/localization-glossary-quickref.md` | 英語用語集クイックリファレンス更新（Bot の参照なし） |
| `docs/pkg-client-libraries.md` | クライアントライブラリドキュメント更新（Bot の参照なし） |
| `docs/wrapper-summary-registry.md` | ラッパー概要レジストリ更新（Bot の参照なし） |

#### db_SemiPrimary.json: Class フィールド更新（既存キャラ）

複数の SemiPrimary キャラで `Class` 配列の内容が更新された。
旧 Class 種別（"デュオトリプル4型" / "デュオトリプル9型" / "トリプルセブンズ"）が除去・整理され、
「マルチアドレセンス」が追加された。

影響: **なし**（Bot は `Class` フィールドをデータ保持のみに使用。機能ロジックでの参照・ハードコードなし）

#### db_SemiPrimary.json: 新キャラ追加 3 件

| Num | 名前 | Progress |
| --- | --- | --- |
| `221` | チェイン / 221(チェインプライム) | `notProceeded` |
| `247-ma` | マンソーンジュ / 247(マンソーンジュ・ペンタゴン) | `notProceeded` |
| `323-ma` | トロンペ / 323(トロンペ) | `notProceeded` |

影響: **なし**（Bot は `Progress === 'released'` のみを公開キャラとして扱う。全件 `notProceeded` のため抽選・ルーレット等の母集団に含まれない）

#### dict_Class.json: 新 Class 定義追加

| Class | Class_EN | Class_Code |
| --- | --- | --- |
| マルチアドレセンス | Multi-Adolescence | NMA |
| プリーミアコンストレイント | Premier Constraint | NNP |

影響: **なし**（Bot は Class 辞書を直接参照しない）

### その他の変更（sparse-checkout で除外される作品）

- 獣爾騎兵: 英語表記 ShauErRiders/Shau'er Riders への全改名＋旧綴り別名互換追加・API ルート整備
- 豹変系女子: ミル・ニュクスフの DB 情報完成
- deps-dev: playwright バンプ (Dependabot PR #35)
- skills: grilling / grill-me の `.agents/skills` 取り込み

---

## 影響範囲の分析

### コード変更の必要性

本区間の変更は**データのみ**の追加・修正であり、Bot コード側の変更は不要と判断した。根拠:

1. **Class フィールドの更新**: `loader.ts` では `Class?: string[]` として型定義のみ。`prompt-builder.ts` / `roleplay-prompt-loader.ts` 等でフィールド値をロジックに利用している箇所なし
2. **新キャラ追加**: 全件 `Progress: "notProceeded"` のため、`loader.ts` の `entry.Progress === 'released'` フィルタで自動的に除外される
3. **dict_Class.json 更新**: Bot は Class 辞書を直接参照しない（UI 表示ヒント用）

---

## 最適化した箇所

なし（コード変更不要）

---

## 検証

- `npm run typecheck` ✅（型エラーなし）

---

## コミット

本ログと `_creations-db` の gitlink 更新をコミットする。
