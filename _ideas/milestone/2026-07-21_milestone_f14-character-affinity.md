# F-14 Phase 1（基盤）: キャラ別親密度（character_affinity）ストア — 実装仕様

> 作成日: 2026-07-21
> ステータス: **実装済み** 🔧（2026-07-21・ストア基盤＋加算フック＋照会コマンド。能力レジストリ本体は後続に温存）
> 元アイデア: [`future-plan/F-14-character-ability-commands.md`](../future-plan/F-14-character-ability-commands.md)（構想全体）
> 関連: [F-15 Phase 3](./2026-07-20_milestone_f15-corefolder-form-enhancement.md)（お供随伴演出・スキンシップ反応）の前提基盤

---

## 概要

F-14（キャラ固有コマンド）の全体像のうち、**キャラ別親密度（アフィニティ）ストア基盤**のみを先行実装する。
これは **F-15 Phase 3（お供随伴演出・スキンシップ反応）が必要とする依存**であり、能力レジストリ本体
（78タロット・44ヨット対戦・ゲスト召喚等）は本マイルストーンの対象外として温存する。

---

## 実装内容（2026-07-21）

### 1. `character_affinity` ストア（[src/storage/character-affinity.ts](../../src/storage/character-affinity.ts)）

- `(user_id, char_num)` 複合キーの SQLite ストア。F-12B 信頼度（`trust.ts`・ユーザー単位グローバル値）とは
  **別テーブル・移行不要・低リスク**。
- API: `addPoints`（日次上限つき）/ `getPoints` / `getLevel` / `getTopAffinity(excludeNum)` / `listByAffinity`。
- レベル閾値（**暫定**）: Lv.0=0 / Lv.1=1+ / Lv.2=10+ / Lv.3=30+。`affinityLevel()` で算出。お供演出は Lv.2 以上が対象。
- 日次上限: `points_today` / `today_date` を持ち、当日(JST)の加算量が `dailyCap` を超えない（スパム防止）。

### 2. 加算フック（[src/bot/handlers/mention.ts](../../src/bot/handlers/mention.ts)）

- **タスク完了時**: アクティブキャラへ +3（daily cap 10）。信頼度加算（`recordTaskCompletion`）と同経路に併設。
- **1日1回の会話ボーナス発生時**: アクティブキャラへ +1（daily cap 10）。
- 加算量・上限・レベル閾値は**暫定値**。実運用で調整する。

### 3. 照会コマンド（`affinity-check` intent）

- 「78とどれくらい仲良し？」→ そのキャラのレベルを表示。
- 「仲良し度ランキング教えて」→ 上位5件のレベル一覧。

### 検証

- vitest: affinity ストア 11 件＋intent 分類（`affinity-check` 3 件・既存回帰含む）で計 **32 件 PASS**。
- `npm run typecheck` 成功。

---

## 今回スコープ外（後続に温存）

- 能力レジストリ（`features/char-abilities/`）・78タロット・44ヨット対戦・33調べ物・ゲスト召喚・ティア解放。
  → [`future-plan/F-14-character-ability-commands.md`](../future-plan/F-14-character-ability-commands.md) を一次ソースに別マイルストーンで実装。

## 残・フォローアップ

- 数値パラメータ（加算量・日次上限・レベル閾値）の実運用調整。
- `schedule` 通知時のアフィニティ加算（`task-scheduler` 経路）は今回未配線。
- この基盤の上に **F-15 Phase 3（お供演出・スキンシップ）** を実装する。
