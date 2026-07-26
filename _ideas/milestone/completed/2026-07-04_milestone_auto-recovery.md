# Milestone: Bot 自動復旧機能（3層ウォッチドッグ）

> 更新日: 2026-07-09（gcloud CLI 導入によりレイヤー3〔GCE外部ウォッチドッグ〕をデプロイ・
> 動作確認まで完了。`automaticRestart` 確認も完了）
> ステータス: 完了 ✅（レイヤー1・2・3 すべて本番稼働中／`automaticRestart` も有効化済みと確認）
> （残るは障害注入テストのみ。詳細は「残作業」参照）
> 完了根拠: 2026-07-09 にレイヤー3（GCE外部ウォッチドッグ）のデプロイ・動作確認まで完了。
> 2026-07-26 に `completed/` へ棚卸し。

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
| 3a | VM 停止（TERMINATED） | GCE外部ウォッチドッグ | `instances.start()` | ✅ 本番稼働中 |
| 3b | VM フリーズ（RUNNING だが無応答） | TCP:22 死活確認（5分毎×3回） | `instances.reset()`（冷却30分） | ✅ 本番稼働中 |
| 3c | ホスト障害・メンテナンス | GCE | `automaticRestart`（確認済み: `true`） | ✅ 確認済み |

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
      （手順: [docs/deployment.md](../../../docs/deployment.md) §5-2）。
      `systemctl is-enabled` / `is-active` とも確認済み、次回トリガーも正常に予約されていることを確認。
      VM側リポジトリは `git status` クリーン・`git log -1` が `d4426d3`（develop→master マージ済み最新）。
- [x] GCE外部ウォッチドッグのデプロイ（手順: [tools/gce-watchdog/README.md](../../../tools/gce-watchdog/README.md)）
      — 実機: プロジェクト `numbertales-misskey-surver` / ゾーン `us-central1-a` /
      インスタンス `misskey-bots-group-numbertales`。2026-07-09、ローカル開発機に導入された
      `gcloud` CLI（575.0.1、`snine9801@gmail.com` 認証済み。100(モモ)がAPHRNTs_100リポジトリ側で
      導入）を使い、クライアント君の承認を得た上でデプロイを実施:
      1. `cloudscheduler.googleapis.com` API有効化
      2. サービスアカウント `numbertales-watchdog@numbertales-misskey-surver.iam.gserviceaccount.com`
         作成 + `roles/compute.instanceAdmin.v1`（プロジェクト単位、対象はコード内で
         `misskey-bots-group-numbertales` に限定）付与
      3. Cloud Run functions (2nd gen) `numbertales-gce-watchdog` を `us-central1` へデプロイ
         （`--gen2` フラグ。gcloud のサブコマンドによって `--v2`/`--gen2` の表記揺れがあるため注意）
      4. `roles/run.invoker` 付与 + Cloud Scheduler ジョブ `numbertales-vm-watchdog` 作成
         （5分毎・Asia/Tokyo・OIDC認証）
      - 動作確認: `gcloud scheduler jobs run` で2回手動実行 → いずれも `Google-Cloud-Scheduler`
        UserAgent から `200`（レイテンシ8〜32ms）を確認。即時応答のため
        `isReachable()` が即成功＝TCP:22死活確認OK（`action:"none"`）の健全系パスを通ったと判断。
      - 撤去手順は README「撤去する場合」の通り。
- [x] `automaticRestart` 有効化確認。2026-07-09、gcloud CLI 導入により確認完了:
      `scheduling.automaticRestart: true`、`onHostMaintenance: MIGRATE`。ホスト障害・メンテナンス時の
      自動再起動は**既に有効**なので、この項目に対する追加対応は不要。
- [ ] 障害注入テスト（`kill -STOP` でハング再現 → 3分後に自動復旧するか）。
      SSH経由で実行自体は可能だが、本番の実ユーザー向けBotを一時的に応答不能にする実験のため、
      実施前に必ずクライアント君に日時の確認を取ってから行うこと。

## 設計メモ

- misskey-js の `Stream` は自動再接続を内蔵しているため、レイヤー2c は
  「再接続が長時間成功しない」場合のみ発火する保険
- ウォッチドッグは健全時にログを出さない（毎分実行によるログ肥大防止）
- pm2 ソケットはユーザー毎（`~/.pm2`）のため、systemd サービスは Bot 運用ユーザーで実行する
