# creations-db 同期最適化ログ — 2026-09-08 09:30

## サブモジュール更新

- 旧コミット: `b9cea4f3`
- 新コミット: `74cfc585`（**27 コミット前進**。前回追従 2026-08-28 以降）
- 前進/退行判定: **前進**（`git -C _creations-db merge-base --is-ancestor b9cea4f3 74cfc585` → true）。
  作業ツリー `HEAD` = `origin/develop` = `74cfc585` で detached HEAD ではない。
- gitlink は先行コミット `3ba7a4a`（chore: creations-db を 74cfc58 へ更新）で既に追従済みだったが、
  **本ログが未作成だった**ため、本コミットで作業ログを補完する（ゲートは追従済みのため `UP_TO_DATE 74cfc585`）。
- sparse-checkout は維持（`data/` 直下は `Works_NumberTales` + `db_meta.json` + `db_type.json` のみ）。

### 取り込んだ変更点の要約（コミットログ・実データ差分より）

| 変更 | Bot への関係 |
| --- | --- |
| `#67` の `Progress` が `released` → `unprofiled`（released 93 → **92 件**） | **小**（後述①。母集団はコードが `Progress === 'released'` で動的に絞るため自動追従。コメントの実数のみ更新） |
| `RoleplayPrompts/DB_Primary/` に `roleplay-prompt-49.md` / `-77.md` を新規生成（51 → **53 件**）。db_Primary 側にも 49 / 77 の `ConversationPattern` を追加 | **小**（後述②。ローダーが番号別に遅延ロードするため、コード変更なしで 2 キャラがカード基盤層へ載る） |
| `db_meta.json` の `hideText` enum に「検閲済み」を追加 | 無（後述③。`prompt-builder.ts` は `hideText` の**存在**だけで非公開判定するため文言非依存） |
| `db_type.json` の facet に `codeFrom`（`Faction_Code` / `Class_Code`）を追加 | 無（DB の UI 表示ヒント。Bot は facet を参照しない） |
| VRM パスの命名統一（`vrm_corefolderN` → `vrm_NTS-N-corefolder`）、チャット絵・絵文字ステッカーの画像整備 | 無（Bot は画像・VRM を参照しない） |
| API/SW 整備、CI の Node 22 固定、dependabot（vitest 5 / glob 13 等） | 無（Bot が動的 import する `pkg/nodejs/` は本区間で変更なし） |
| 他作品（獣爾騎兵 / 豹変系女子 / ハンカクライブ 等）の DB 更新 | 無（sparse で作業ツリーから除外済み） |

## 影響範囲の分析

### ① released ロスターが 93 → 92 件（コード変更不要・コメントのみ追従）

- 差分は `#67` の 1 件のみ（`released` → `unprofiled`）。他 104 件の `Progress` に変化なし。
- 週次担当キャラ抽選・キャラ番号ルーレットの母集団は `loader.ts` が
  `entry.Progress === 'released'` で毎回フィルタするため、**自動的に 92 件へ追従する**。
- ただし `loader.ts` のドキュメンテーションコメントが旧実数（93 件中 35 / 65）のままだったため実測値へ更新した。

### ② ロールプレイプロンプトの新規生成（コード変更不要）

- `DB_Primary/` は 51 → 53 件。`roleplay-prompt-loader.ts` は
  `roleplay-prompt-<Num>.md` を番号別に遅延ロードするため、**49 / 77 が自動でカード基盤層に載る**。
- 見出しアンカーの前方一致で切り出す方式のため、tpl 側の新セクション追加でも抽出は壊れない。

### ③ トップレベルキー集合は不変

- `db_Primary.json` の全レコードから収集したキー集合は新旧で**完全一致**（`NumerospecStats` 移行後の構造のまま）。
  前回のような破壊的なスキーマ移動は本区間には無い。

## 実施した最適化

- [src/bot/character/loader.ts](../../src/bot/character/loader.ts):
  `Weight_kg` の非公開率・`TailsUnit.Branches` の保持率のコメントを実測値（92 件中 34 / 64）へ更新。

> 本区間はスキーマ破壊が無いため、パーサ・型定義の追従は不要だった。
> 同コミットには別件（PR #37 の Copilot レビュー指摘 4 件の修正）も含む。詳細は
> [_tasks/github-triage/2026-08-22_github-triage.md](../github-triage/2026-08-22_github-triage.md) の追記節を参照。

## 検証

- `npm run typecheck` ✅
- `npm test`（build → vitest run）✅ 7 ファイル / 87 件すべて成功
- `bash tools/check-creations-db-update.sh` → `UP_TO_DATE 74cfc585`

## コミット

- 本コミット（本ログ＋コメント追従）。gitlink 追従自体は先行コミット `3ba7a4a`。
