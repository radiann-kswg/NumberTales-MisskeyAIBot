# Milestone: Bot 自動復旧機能（3層ウォッチドッグ）

> 更新日: 2026-07-08（レイヤー2のsystemd timerを本番VMへ導入・稼働確認）
> ステータス: レイヤー1・2 本番稼働中 ✅／レイヤー3（GCE外部）・`automaticRestart`確認は
> gcloud CLI が必要でエージェント側のツールでは実行不可 🔜（詳細は「残作業」参照）

## 背景・目的

VM インスタンス上の Bot がエラー落ち・処理落ち（ハング）した際に、人手を介さず
自動復旧できるようにする。障害レイヤーごとに担当を分けた3層構成とする。

## 障害レイヤーと対応

| # | 障害 | 検知 | 復旧 | 状態 |
| - | ---- | ---- | ---- | ---- |
| 1 | プロセス即死・クラッシュ | PM2 | PM2 `autorestart`（既存） | ✅ 既存 |
| 2a | クラッシュループ後の `errored` 放置（`max_restarts:5` 超過） | VM内ウォッチドッグ | `pm2 restart` | ✅ 本番稼働中 |
| 2b | イベントループのハング（プロセス生存・応答なし） | ハートビート鮮度（3分） | `pm2 restart` | ✅ 本番稼働中 |
| 2c | WebSocket 切断の長期継続（再接続失敗） | ハートビート `wsConnected`（10分） | `pm2 restart` | ✅ 本番稼働中 |
| 3a | VM 停止（TERMINATED） | GCE外部ウォッチドッグ | `instances.start()` | 🔜 デプロイ待ち |
| 3b | VM フリーズ（RUNNING だが無応答） | TCP:22 死活確認（5分毎×3回） | `instances.reset()`（冷却30分） | 🔜 デプロイ待ち |
| 3c | ホスト障害・メンテナンス | GCE | `automaticRestart`（要確認） | 🔜 設定確認待ち |

## 実装内容

### レイヤー2（VM内・コストゼロ）

- `src/utils/heartbeat.ts` — `HeartbeatWriter`。30秒毎に `.cache/heartbeat.json` へ
  `{ ts, wsConnected, lastConnectedAt, uptimeSec }` を書き出し（`HEARTBEAT_PATH` / `HEARTBEAT_INTERVAL_MS`）
- `src/misskey/client.ts` — `isConnected()` 追加（`_connected_` / `_disconnected_` で状態追跡）
- `src/index.ts` — ハートビート起動・shutdown 時停止
- `tools/vm-watchdog.mjs` — 毎分実行の監視スクリプト。フラッピング防止（30分3回上限）、
  `--dry-run` 対応、判定ログは `.cache/watchdog.log`（NDJSON）
- `tools/systemd/numbertales-watchdog.{service,timer}` — systemd ユニット雛形

### レイヤー3（GCE外部）

- `tools/gce-watchdog/` — Cloud Run functions (2nd gen)。Cloud Scheduler（5分毎・OIDC）から
  起動し TCP:22 を死活確認 → reset/start。クールダウンはインスタンスメタデータ
  `watchdog-last-reset` で管理。無料枠内で運用可

## 残作業（VM・GCP 側セットアップ）

- [x] develop → master デプロイ後、VM で systemd timer を導入（2026-07-08）
      （手順: [docs/deployment.md](../../docs/deployment.md) §5-2）。
      `systemctl is-enabled` / `is-active` とも確認済み、次回トリガーも正常に予約されていることを確認。
      VM側リポジトリは `git status` クリーン・`git log -1` が `d4426d3`（develop→master マージ済み最新）。
- [ ] GCE外部ウォッチドッグのデプロイ（手順: [tools/gce-watchdog/README.md](../../tools/gce-watchdog/README.md)）
      — 実機: プロジェクト `numbertales-misskey-surver` / ゾーン `us-central1-a` /
      インスタンス `misskey-bots-group-numbertales`（e2-small・2026-07-04 コネクタで確認済み）。
      **エージェント側では実行不可**: ローカル開発機・本番VMのいずれにも `gcloud` CLI が無く、
      Google Compute Engine コネクタも Cloud Functions/Cloud Scheduler/IAM のデプロイ用ツールを
      持たない（インスタンスの参照・start/stop/reset・作成/削除・マシンタイプ変更のみ対応）ため、
      クライアント君の gcloud 認証済み環境での実行が必要（2026-07-08 確認）。
- [ ] `automaticRestart` 有効化確認。**同様の理由でエージェント側では実行不可**
      （コネクタからは `scheduling.automaticRestart` を参照できず、gcloud もローカル/VMどちらにも無い）。
      クライアント君側で `gcloud compute instances describe misskey-bots-group-numbertales
      --project=numbertales-misskey-surver --zone=us-central1-a
      --format='value(scheduling.automaticRestart)'` を実行して確認してもらう必要がある。
- [ ] 障害注入テスト（`kill -STOP` でハング再現 → 3分後に自動復旧するか）。
      SSH経由で実行自体は可能だが、本番の実ユーザー向けBotを一時的に応答不能にする実験のため、
      実施前に必ずクライアント君に日時の確認を取ってから行うこと。

## 設計メモ

- misskey-js の `Stream` は自動再接続を内蔵しているため、レイヤー2c は
  「再接続が長時間成功しない」場合のみ発火する保険
- ウォッチドッグは健全時にログを出さない（毎分実行によるログ肥大防止）
- pm2 ソケットはユーザー毎（`~/.pm2`）のため、systemd サービスは Bot 運用ユーザーで実行する
