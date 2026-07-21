# 運用: 復旧通知（ダウンタイム明けの「寝てました」投稿） — 実装仕様

> 作成日: 2026-07-20
> ステータス: **実装済み** ✅（2026-07-21・PR #27 で develop へマージ済み。**本番デプロイ・実機確認は未実施**）
>
> 実装: `src/features/recovery-notice.ts`（新規）／`utils/heartbeat.ts` に `readLastHeartbeat()` 追加／
> `index.ts` で HeartbeatWriter 生成前に前回 ts を退避し起動後に非ブロッキング発火／
> `misskey/client.ts` の `post()` に `visibility` オプション追加（復旧通知は `home`）／
> `config/env.ts`・`.env.example` に `DOWNTIME_NOTICE_{THRESHOLD,COOLDOWN,MAX}_MS` を追加。
> 検証: `formatDowntime` 7件＋判定分岐8件（初回・負値・閾値未満・上限超過・クールダウン内外・WS未接続・正常）を vitest で固定化。
> 着想: Misskey Bot「藍ちゃん」の復帰時自動投稿（「ん、私、寝てた…？」）
> 関連: [2026-07-04_milestone_auto-recovery.md](./2026-07-04_milestone_auto-recovery.md)（ハートビート基盤を流用）、
> [2026-07-20_milestone_f15-corefolder-form-enhancement.md](./2026-07-20_milestone_f15-corefolder-form-enhancement.md)（演出連携・任意）

---

## 概要

Bot が一定時間以上停止した状態から再起動したとき、**000(チトセ)**（開発者代行）が
「●時間ぶりに復帰したよ」という復旧通知を自発投稿する基本機能。
稼働状態の可視化（フォロワーへの安心材料）とキャラクター演出を兼ねる。

---

## トリガー条件

| 項目 | 仕様 |
| ---- | ---- |
| ダウンタイム算出 | 起動時、`HeartbeatWriter` 開始**前**に `.cache/heartbeat.json` の前回 `ts` を読み、`now - ts` を停止時間とする |
| 通知閾値 | `DOWNTIME_NOTICE_THRESHOLD_MS`（env・**既定 30分**）以上のときのみ投稿。未満は無言で復帰（`pm2 reload` デプロイ・ウォッチドッグ再起動の数秒〜数分は対象外にする趣旨） |
| 多重投稿防止 | `bot-state.ts`（KV）に `last_downtime_notice_at` を記録し、クールダウン（`DOWNTIME_NOTICE_COOLDOWN_MS`・既定 6時間）内は再投稿しない（クラッシュループ対策） |
| **上限** | `DOWNTIME_NOTICE_MAX_MS`（env・**既定 7日**）を**超えたら投稿しない**。ディスクスナップショットからの復元で古い `heartbeat.json` が蘇るケースを弾く（下記） |

### エッジケース（投稿しない条件）

- `heartbeat.json` が存在しない／パース不能（初回起動・`.cache` クリア後）→ 通知なし
- 算出値が負（時計が巻き戻った場合）→ 通知なし
- **算出値が `DOWNTIME_NOTICE_MAX_MS`（既定 7日）を超える → 通知なし**
- 閾値以上でも Misskey 接続確立前は投稿しない（WebSocket 接続完了後に投稿）

> **⚠️ なぜ上限が要るか（2026-07-20 追記）**
> [docs/vm-os-upgrade.md](../../docs/vm-os-upgrade.md) のロールバック手順で
> **ディスクスナップショットから復元すると、`.cache/heartbeat.json` が
> スナップショット取得時点の古い `ts` を持ったまま復活する。**
> 実際には停止していないのに「現在時刻 − 古い ts」が巨大値となり、
> 数日〜数週間のダウンタイムとして誤投稿されてしまう。
> スナップショット復元は今日整備した正規手順なので、踏む可能性は現実的にある。
>
> なお `.cache/` は `.gitignore` 済みのため `git reset --hard`（デプロイ）では消えない
> ＝通常デプロイでは heartbeat が正しく引き継がれることは 2026-07-20 の実機作業で確認済み。

---

## 投稿仕様

- **発言キャラ**: 000(チトセ) 固定（週次担当キャラに依存しない。開発者代行＝メンテ担当としての立ち位置）
- **書式**: `formatSpeech('000', ...)` の既存書式（コアフォルダ絵文字が「顔」になる）
- **公開範囲**: `home`（既存の自発投稿と同じ）
- **停止時間の表記**: コード側で算出・整形（`●分` / `●時間` / `●日と●時間`）。**数値はLLMに計算させない**
- **文面**: 停止時間・復帰の事実をコード側で確定し、フレーバー文のみ LLM 生成
  （`buildCharacterSystemPrompt()`・既存の監修方針どおり）。LLM失敗時は固定テンプレへフォールバック
- 例（イメージ）: 「ふぁ…私、8時間ほど寝てたみたいだね。メンテナンスは無事完了、今日も通常運転だよ」

### F-15 連携（任意・依存させない）

F-15 実装後は「コアフォルダ形態で丸まって休止 → ぽよんと跳ね起きて変形」の演出部品を
復旧通知に組み込める。**本機能は F-15 に依存せず単体で完結**させ、演出強化のみ後日追従する。

---

## 実装ステップ

1. `src/utils/heartbeat.ts` — 起動時に前回ハートビートを読む `readLastHeartbeat()` を追加
2. `src/features/recovery-notice.ts`（新規）— 閾値判定・停止時間整形・文面生成・投稿
3. `src/index.ts` — `main()` の WebSocket 接続確立後に一度だけ呼び出し（`HeartbeatWriter` 開始前に前回 ts を退避）
4. `src/config/env.ts` — `DOWNTIME_NOTICE_THRESHOLD_MS` / `DOWNTIME_NOTICE_COOLDOWN_MS` /
   `DOWNTIME_NOTICE_MAX_MS` 追加
5. `src/storage/bot-state.ts` — KV キー `last_downtime_notice_at` の読み書き
6. `npm run typecheck` / 単体確認（閾値未満・heartbeat 無し・クールダウン中の各分岐）

---

## 完了条件

- [ ] 閾値以上のダウンタイム後の起動で 000(チトセ) の復旧通知が 1 回だけ投稿される
- [ ] デプロイ（`pm2 reload`）・ウォッチドッグ再起動では投稿されない
- [ ] エッジケース（初回起動・時計異常・クールダウン中・**上限超過**）で投稿されない
- [ ] `npm run typecheck` 通過・実機確認
- [ ] AGENTS.md 実装済み機能テーブル・README 更新
