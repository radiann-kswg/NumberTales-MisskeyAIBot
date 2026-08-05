# GCE 外部ウォッチドッグ — デプロイ手順

Bot VM が **VM ごとフリーズ／停止**した場合に外部から自動復旧するための
Cloud Run functions + Cloud Scheduler 構成。VM 内ウォッチドッグ
（`tools/vm-watchdog.mjs`）では救えない障害レイヤーを担当する。

- 5分ごとに VM の TCP:22 へ死活確認（3回リトライ）
- 全滅 & `RUNNING` → `instances.reset()`（クールダウン30分）
- `TERMINATED`（停止中）→ `instances.start()`
- 無料枠: Cloud Scheduler 3ジョブ・Cloud Run functions 月200万リクエストまで無料。
  この構成（月約 8,640 呼び出し）は無料枠内に収まる

> **⚠️ 共用 Spot VM 向けの注意（2026-08-05 のインフラ統合以降）**
>
> - 対象 VM は **Spot（プリエンプティブル）** になった。予告なく `TERMINATED` にされるため、
>   本ウォッチドッグの `start()` 経路が**プリエンプションからの唯一の復帰手段**である。
> - 対象 VM には**他の Bot が同居している**。したがって `reset()` は本 Bot だけでなく
>   **同居 Bot も強制再起動する**。現行実装は「無応答かつ `RUNNING`」で `reset()` を撃つため、
>   共用環境向けの再設計を
>   [`_ideas/milestone/2026-08-05_milestone_shared-vm-unified-watchdog.md`](../../_ideas/milestone/2026-08-05_milestone_shared-vm-unified-watchdog.md)
>   に起票済み。再設計が入るまでは `reset` 発火時に同居 Bot の生死も確認すること。

## 前提

- `gcloud` CLI 認証済み
- Bot 実機の値（2026-08-05 実測・**統合 VM へ移設済み**）:

```bash
export PROJECT=numbertales-misskey-surver
export REGION=us-central1
export ZONE=us-central1-a
export INSTANCE=misskey-bots-unified
export TARGET_IP=<VMの外部IP>        # .env の GCP_SSH_HOST と同じ値（コミット禁止）
```

> **関数・スケジューラは既にデプロイ済みで、統合 VM を向くよう更新済み。** 以下 1〜3 は
> 新規構築・作り直しの手順である。現況の確認だけなら「4. 動作確認」と次のコマンドで足りる。
>
> ```bash
> gcloud functions describe numbertales-gce-watchdog \
>   --project=$PROJECT --region=$REGION --gen2 \
>   --format="value(serviceConfig.environmentVariables)"
> ```
>
> **VM を作り替えたら `GCE_INSTANCE` と `TARGET_IP` を必ず更新すること。** 旧インスタンスを
> 指したまま放置すると、関数が停止済み VM を `TERMINATED` と判定して **`start()` で叩き起こし続け、
> 課金が止まらない**。併せて GitHub Secrets の `GCP_SSH_HOST` も同時に更新する。

## 1. サービスアカウント作成（最小権限）

```bash
gcloud iam service-accounts create numbertales-watchdog \
  --project=$PROJECT --display-name="NumberTales VM watchdog"

# インスタンスの get/reset/start/setMetadata に必要
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:numbertales-watchdog@$PROJECT.iam.gserviceaccount.com" \
  --role="roles/compute.instanceAdmin.v1"
```

## 2. 関数のデプロイ（このディレクトリで実行）

```bash
cd tools/gce-watchdog

gcloud functions deploy numbertales-gce-watchdog \
  --project=$PROJECT --region=$REGION --gen2 --runtime=nodejs22 \
  --entry-point=watchdog --trigger-http --no-allow-unauthenticated \
  --service-account="numbertales-watchdog@$PROJECT.iam.gserviceaccount.com" \
  --memory=256Mi --timeout=120s \
  --set-env-vars="GCP_PROJECT=$PROJECT,GCE_ZONE=$ZONE,GCE_INSTANCE=$INSTANCE,TARGET_IP=$TARGET_IP"

# デプロイ後の URL を取得
export FUNC_URL=$(gcloud functions describe numbertales-gce-watchdog \
  --project=$PROJECT --region=$REGION --gen2 --format='value(serviceConfig.uri)')
```

## 3. Cloud Scheduler ジョブ作成（5分ごと・OIDC 認証）

```bash
# Scheduler が関数を呼び出せるようにする
gcloud run services add-iam-policy-binding numbertales-gce-watchdog \
  --project=$PROJECT --region=$REGION \
  --member="serviceAccount:numbertales-watchdog@$PROJECT.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

gcloud scheduler jobs create http numbertales-vm-watchdog \
  --project=$PROJECT --location=$REGION \
  --schedule="*/5 * * * *" --time-zone="Asia/Tokyo" \
  --uri="$FUNC_URL" --http-method=GET \
  --oidc-service-account-email="numbertales-watchdog@$PROJECT.iam.gserviceaccount.com" \
  --attempt-deadline=180s
```

## 4. 動作確認

```bash
# 手動実行（reachable: true が返れば正常）
gcloud scheduler jobs run numbertales-vm-watchdog --project=$PROJECT --location=$REGION

# 関数ログの確認
gcloud functions logs read numbertales-gce-watchdog \
  --project=$PROJECT --region=$REGION --gen2 --limit=20
```

## 併せて確認: インスタンスのスケジューリング設定

```bash
gcloud compute instances describe $INSTANCE --project=$PROJECT --zone=$ZONE \
  --format='value(scheduling.provisioningModel,scheduling.automaticRestart,scheduling.onHostMaintenance)'
# 統合 VM の現況: SPOT / False / TERMINATE
```

> **⚠️ Spot では `automaticRestart` を有効化できない。**
> `--restart-on-failure` を指定してもエラーになる（Spot の仕様上 `automaticRestart=False` 固定・
> `onHostMaintenance=TERMINATE`）。旧構成（通常 VM）向けだった有効化手順は**現行 VM には適用しない**。
>
> 代わりに、プリエンプション・ホスト障害からの復帰は次の2段で担保する。
>
> 1. **本ウォッチドッグ**が `TERMINATED` を検知して `instances.start()`（最大5分の検知遅延）
> 2. VM 起動後、**`pm2-<user>.service`（systemd enabled）＋ `~/.pm2/dump.pm2`** で Bot が自動復帰
>
> 2 が欠けていると VM だけ復帰して Bot は落ちたままになる。VM を作り直したら必ず
> `pm2 startup` と `pm2 save` を実施すること（[docs/deployment.md](../../docs/deployment.md) の 1-9）。

## プリエンプションの履歴を確認する

```bash
gcloud compute operations list --project=$PROJECT \
  --filter="targetLink~$INSTANCE" --sort-by=~insertTime --limit=10 \
  --format="table(operationType,status,insertTime)"
# compute.instances.preempted が出ていればプリエンプション
```

## 撤去する場合

```bash
gcloud scheduler jobs delete numbertales-vm-watchdog --project=$PROJECT --location=$REGION
gcloud functions delete numbertales-gce-watchdog --project=$PROJECT --region=$REGION --gen2
gcloud iam service-accounts delete \
  "numbertales-watchdog@$PROJECT.iam.gserviceaccount.com" --project=$PROJECT
```
