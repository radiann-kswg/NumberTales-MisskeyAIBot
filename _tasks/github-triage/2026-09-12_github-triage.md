# GitHub 未解決問題トリアージ（2026-09-12）— NumberTales-MisskeyAIBot

`_tasks/` の棚卸依頼を受けて実施。**本ログは調査に加えて修正も含む**（従来の読み取り専用トリアージとは異なる）。
前回ログ: `_tasks/.archived/github-triage/2026-08-22_github-triage.md`（4 件すべて 09-08 に対応済みのため棚卸済み・git 管轄外）。

調査手段: `gh pr list` / `gh issue list` / `gh run list` / `gh api graphql`（reviewThreads）/ `npm audit` / ローカル `git`。

---

## 本日の状態

| 項目 | 状態 |
| --- | --- |
| OPEN Issue | ✅ 0 件 |
| OPEN PR | ✅ 0 件 |
| CI | ✅ 直近 5 run すべて success（最新: PR #44 の `Deploy to GCP VM`, 09-10） |
| `npm audit --omit=dev` | ✅ 0 件（本番依存に脆弱性なし） |
| **マージ済み PR の未解決 Copilot 指摘** | 🔴 **2 件**（PR #44 / PR #40）→ 本セッションで対応 |

---

## 1. 🔴 PR #44 — `process.exit()` で違反一覧の末尾が欠落しうる（対応済み）

**場所**: [tools/check-ctrl.mjs](../../tools/check-ctrl.mjs)

`process.exit()` は stdout への非同期書き込みを待たずにプロセスを落とすため、
制御文字の違反箇所が多いときに `r.stdout` の末尾が欠けうる、という指摘。
違反箇所を**一覧するための**チェックなので、出力が切れるのは機能を損なう。

**対応**: 全ての `process.exit(n)` を `process.exitCode = n` に置き換え、`if / else if` の連鎖で
自然終了させた（分岐の意味は不変: 一致=1 / 不一致=0 / git grep 異常=2）。

**検証**:

- クリーン時 → `exit=0`
- `tools/` に U+0008 を含む一時ファイルを置いて実行 → 違反行を stdout に出力したうえで `exit=1`（確認後に削除）

## 2. 🟡 PR #40 — テストが creations-db のカード文言に依存していた（対応済み）

**場所**: [test/prompt-builder.test.ts:16](../../test/prompt-builder.test.ts#L16)

カード経路の確認に「穏やかで控えめな口調」という **creations-db 側の本文**を使っていたため、
挙動が変わっていなくても DB の文面が微修正されるとテストだけ壊れる。

**対応**: 生成テンプレ固定の見出しアンカー `# あなたが演じる`
（[roleplay-prompt-loader.ts](../../src/bot/character/roleplay-prompt-loader.ts) の `CARD_START_PREFIX`）での確認に置き換えた。
「カードが基盤層に載っているか」という本来の検査意図はそのまま保たれる。

## 3. 🔵 npm 脆弱性 — 08-15 からの持ち越し（対応済み）

`brace-expansion`（high / GHSA-mh99-v99m-4gvg ほか）1 件のみが残っていた（`js-yaml` / `nanoid` / `postcss` は
その後の Dependabot PR で解消済み）。`npm audit fix` を実行し **lockfile のみ**が更新された（6 パッケージ）。
`npm audit` → 0 件。`npm audit --omit=dev` は元から 0 件で、本番 Bot への影響は当初からなし。

---

## 再発している運用パターン（🔁 3 回目）

PR #37（08-19）・PR #40（08-29）・PR #44（09-10）と、**Copilot レビューの着弾前にマージ**して
指摘が取りこぼされる流れが繰り返されている。Copilot のレビューは数分遅れて届くため、
`develop → master` のマージ前にレビュー完了を待つ運用にすると取りこぼしが止まる。

---

## _tasks/ の棚卸

- `_tasks/` 直下に放置されていた `2026-08-31-0600` / `2026-09-01-0600` の 2 件を、
  [`_tasks/README.md`](../README.md) の命名・配置規則どおり `creations-db-sync/` 配下へ回収した。
- 完了済みログを **`_tasks/.archived/`（git 管轄外）** へ退避した（21 件）。
  - `github-triage/`: 持ち越し項目がすべてクローズした 6 件（07-22 / 07-25 / 07-29 / 08-01 / 08-15 / 08-22）。
  - `creations-db-sync/`: 追従が完了した 15 件。**最新の `2026-09-08-0930` のみ残置**
    （現在の gitlink `74cfc585` の根拠として参照されるため）。
- 過去トリアージログの持ち越し項目は、本ログの時点で**すべてクローズ**（下表）。

| 起票ログ | 項目 | 決着 |
| --- | --- | --- |
| 07-22 / 07-25 | Dependabot PR #31 / #32、Deploy 失敗（`fc9fa60`） | ✅ 07-29 ログで追跡終了 |
| 07-29 / 08-01 | `deploy.yml` の `concurrency` 未設定 | ✅ 09-08 に設定追加（08-22 ログ追記） |
| 08-15 | Dependabot PR #36（postcss） | ✅ `740de25` でマージ済み |
| 08-15 | npm 脆弱性 4 件（すべて devDeps） | ✅ 本ログ §3 で 0 件化 |
| 08-22 | PR #37 の Copilot 指摘 4 件 | ✅ 09-08 に全件対応（同ログ追記） |

**残る外部ブロッカー**: CreationsDB Issue #13（F-06 Stage B/C・F-15 Phase 3 の監修文面待ち）。
Bot 側はフォールバック実装済みのため機能は壊れていない。本リポジトリ側の対応は不要。

---

## 検証

- `node tools/check-ctrl.mjs` ✅（クリーン=0 / 混入=1 の両経路を実測）
- `npm run typecheck` ✅
- `npm test` ✅ 7 ファイル / 87 件すべて成功

## 未実施（要判断）

- GitHub 上の Copilot レビュースレッド 2 件（PR #44 / PR #40）は**未 resolve**。
  修正は入ったので resolve して構わないが、GitHub への書き込みのため User の指示待ち。
