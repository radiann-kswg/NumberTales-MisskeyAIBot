# GCE 外部ウォッチドッグ — デプロイ手順

Bot VM が **VM ごとフリーズ／停止**した場合に外部から自動復旧するための
Cloud Run functions + Cloud Scheduler 構成。VM 内ウォッチドッグ
（`tools/vm-watchdog.mjs`）では救えない障害レイヤーを担当する。

- 5分ごとに VM の TCP:22 へ死活確認（3回リトライ）
- 全滅 & `RUNNING` → `instances.reset()`（クールダウン30分）
- `TERMINATED`（停止中）→ `instances.start()`
- 無料枠: Cloud Scheduler 3ジョブ・Cloud Run functions 月200万リクエストまで無料。
  この構成（月約 8,640 呼び出し）は無料枠内に収まる

## 前提

- `gcloud` CLI 認証済み
- Bot 実機の値（2026-07-04 GCE コネクタで確認済み）:

```bash
export PROJECT=numbertales-misskey-surver
export REGION=us-central1
export ZONE=us-central1-a
export INSTANCE=misskey-bots-group-numbertales
export TARGET_IP=<VMの外部IP>        # .env の GCP_SSH_HOST と同じ値（コミット禁止）
```

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

## 併せて確認: GCE インスタンスの自動再起動設定

ホスト障害（ハードウェア障害・メンテナンス）時の自動再起動が有効か確認する:

```bash
gcloud compute instances describe $INSTANCE --project=$PROJECT --zone=$ZONE \
  --format='value(scheduling.automaticRestart)'
# false の場合は有効化
gcloud compute instances set-scheduling $INSTANCE \
  --project=$PROJECT --zone=$ZONE --restart-on-failure
```

## 撤去する場合

```bash
gcloud scheduler jobs delete numbertales-vm-watchdog --project=$PROJECT --location=$REGION
gcloud functions delete numbertales-gce-watchdog --project=$PROJECT --region=$REGION --gen2
gcloud iam service-accounts delete \
  "numbertales-watchdog@$PROJECT.iam.gserviceaccount.com" --project=$PROJECT
```
