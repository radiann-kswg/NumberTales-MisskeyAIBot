# creations-db 追従ログ — 2026-09-12 06:00 JST

## 追従コミット範囲

```
fc63407b Merge pull request #33 from radiann-kswg/fix/shauer-riders-rename
5a262b1d DB進捗更新(豹変系女子) ミル・ニュクスフを完成
43161e2e 獣爾騎兵の英語表記改名の追従（フレームワーク側）+ 旧直リンク互換
5c4fa4c0 獣爾騎兵の英語表記を ShauErRiders / Shau'er Riders へ全改名（データ側）
cb8e6ed8 docs/data: 創作ガイドラインを新規 4 タイトル向けに補填 + 獣爾騎兵の公式サイトを db_meta へ登録
a9e01853 skills: grilling / grill-me を .agents/skills へ取り込み（mattpocock/skills, MIT）
```

記録 gitlink: `74cfc585` → 追従先: `fc63407b`

## 変更があったファイルと主な内容

| カテゴリ | 変更内容 |
|----------|----------|
| `data/Works_ShauErRiders/**` | 獣爾騎兵の英語表記を `ShouArRiders` → `ShauErRiders` / `Shau'er Riders` へ全改名（PR #33） |
| `data/Works_SinisterChangingGirls/**` | ミル・ニュクスフ（Works_SinisterChangingGirls）のDB入力完成 |
| `data/Dictionaries/dict_Faction.json` | 獣爾騎兵の `Faction_EN` を `"Shou'ar Riders"` → `"Shau'er Riders"` に更新 |
| `data/Localization/**` | 各ローカライゼーションファイルのスコープ参照 `Works_ShouArRiders` → `Works_ShauErRiders` への追従 |
| `.agents/skills/grilling`, `grill-me` | mattpocock/skills より MIT ライセンスのスキルを取り込み |
| `AGENTS.md`, `CHANGELOG.md`, `_work_in_progress/**` | 進捗記録・フレームワーク整備 |

**Works_NumberTales への直接変更: なし**

## 最適化した箇所

変更は `Works_ShauErRiders`（改名）・`Works_SinisterChangingGirls`（ミル・ニュクスフ）・グローバル辞書の範囲に限定されており、Bot が参照する `Works_NumberTales/` のキャラクターデータに実質的な変更はない。

- `src/` 側に `ShouArRiders` / `ShauErRiders` の参照がないことを確認済み
- キャラクターローダー（`src/bot/character/loader.ts`）・ヌメロジー参照（`src/features/f06/`）への影響なし
- コード側の最適化は不要と判断。gitlink ポインタの更新のみ実施

## npm run typecheck の結果

```
> numbertales-misskey-ai-bot@0.1.0 typecheck
> tsc --noEmit
```

エラーなし（exit 0）
