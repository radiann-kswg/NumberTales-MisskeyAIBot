# GCP 旧リソース棚卸しガイド（インフラ統合の後始末）

> 種別: 運用手順書（**破壊的操作を含む。実行はリポジトリ所有者が行うこと**）
> 作成: 2026-08-05（インフラ統合による VM 移設の後始末として調査・作成）
> 関連: [deployment.md](./deployment.md) / [AGENTS.md の「VM 実機の前提」](../AGENTS.md#vm-操作デプロイ上の注意重要)

2026-08-05 のインフラ統合（GCP 料金軽減）で、Bot は共用 Spot VM `misskey-bots-unified` へ移設された。
移設は完了しているが、**旧 VM のディスクとスナップショットスケジュールが残っており、課金が続いている。**
本書はその棚卸し手順をまとめる。

> **⚠️ 大前提: VM を停止（`TERMINATED`）してもディスク課金は止まらない。**
> Compute Engine の課金が止まるのは VM インスタンスの実行時間だけで、
> **Persistent Disk はアタッチ先が停止していても容量ぶん課金され続ける**。
> 旧 VM を「停止したから安心」と扱わないこと。

---

## 1. 現況（2026-08-05 実測）

### 稼働中（消してはいけない）

| リソース | 内容 | 備考 |
| -------- | ---- | ---- |
| `misskey-bots-unified` | e2-medium / **Spot** / us-central1-a / `RUNNING` | **現行の本番 VM。** 本 Bot と同居 Bot が稼働 |
| `misskey-bots-unified`（ディスク） | 64GB pd-balanced | 上記のブートディスク |
| `misskey-bots-unified-ip` | 静的外部 IP（`IN_USE`） | GitHub Secrets `GCP_SSH_HOST` と外部ウォッチドッグの `TARGET_IP` が参照 |
| `numbertales-gce-watchdog` / `numbertales-vm-watchdog` | Cloud Run functions + Scheduler | レイヤー3 の自動復旧。**Spot のプリエンプション復帰を一手に担う** |
| `daily-keep4`（`misskey-bots-unified` への適用ぶん） | 日次スナップショットポリシー | 現行 VM のバックアップ。維持する |

### 停止済み・棚卸し候補

| インスタンス | ゾーン | ディスク | ブートディスクの `autoDelete` | スナップショットポリシー |
| ------------ | ------ | -------- | ----------------------------- | ------------------------ |
| `misskey-bots-group-h0wm` | us-central1-a | **256GB** pd-balanced | **`False`** | **`daily-keep4` が適用中（日次で走り続けている）** |
| `misskey-bots-group-numbertales` | us-central1-a | **256GB** pd-balanced | **`False`** | なし |
| `aphrnts-100-bot` | **asia-northeast1-a** | 20GB pd-balanced | `True` | なし |

合計 **532GB** の pd-balanced が課金対象のまま残っている。

> **概算**: pd-balanced は概ね $0.10/GB/月（asia-northeast1 はやや高い）。
> 532GB で **月 $50 前後**が目安。**正確な額は請求コンソールの実績で確認すること**（本書の数値は概算）。

### 特に効きの大きい2点

1. **`misskey-bots-group-h0wm` のディスクに日次スナップショットが走り続けている。**
   `daily-keep4`（毎日 02:00・保持4世代）が停止済み VM のディスクに適用されたままで、
   2026-07-31 以降ぶんが実際に作成されている。使う予定のないディスクのバックアップを
   毎日取り続けている状態なので、**削除より先にポリシーの切り離しを行うと無駄が即止まる**。
2. **ブートディスクの `autoDelete` が `False`。**
   `misskey-bots-group-h0wm` と `misskey-bots-group-numbertales` は、
   **インスタンスを削除してもディスクが残る**。VM 削除だけで終わらせないこと。

---

## 2. 実行前の確認（省略しないこと）

- [ ] **`aphrnts-100-bot` は別 Bot（APHRNTs_100 / 100 Momo）の旧リソース。**
      本リポジトリの管轄外なので、**削除は所有者の同意を取ってから**行う。判断が付かなければ残す。
- [ ] 旧 VM 内に**まだ吸い出していないデータが無いか**確認する。特に SQLite の永続データ
      （`DB_PATH`）・`.cache/incident.log`・`.cache/error.log`。統合 VM へ移行済みかを確かめる。
- [ ] 旧 Misskey 撤去時のバックアップは、リポジトリ**外**の
      `_backups/NumberTales-MisskeyAIBot/2026-07-20_vm-misskey-removal/` にある。ここは消さない。
- [ ] 現行 VM `misskey-bots-unified` と静的 IP `misskey-bots-unified-ip` を**誤って対象に含めない**。

```bash
export PROJECT=numbertales-misskey-surver

# 消す前に全体を一覧して対象を目視確認する
gcloud compute instances list --project=$PROJECT \
  --format="table(name,zone,status,machineType.scope(machineTypes))"
gcloud compute disks list --project=$PROJECT \
  --format="table(name,zone,sizeGb,status,users[0].scope(instances))"
```

---

## 3. 手順

### 3-1. まず出血を止める（低リスク・先にやる価値が高い）

停止済みディスクから日次スナップショットポリシーを外す。**ディスク自体は消えない**ので、
判断を保留したままでも安全に実行できる。

```bash
gcloud compute disks remove-resource-policies misskey-bots-group-h0wm \
  --project=$PROJECT --zone=us-central1-a \
  --resource-policies=projects/$PROJECT/regions/us-central1/resourcePolicies/daily-keep4

# 外れたことを確認（空になればOK）
gcloud compute disks describe misskey-bots-group-h0wm \
  --project=$PROJECT --zone=us-central1-a --format="value(resourcePolicies)"
```

> **現行 VM `misskey-bots-unified` のポリシーは外さないこと。** こちらは必要なバックアップ。

### 3-2. 退避用スナップショットを取る

削除前の保険。**復旧経路をここに残してから**削除へ進む。

```bash
gcloud compute snapshots create numbertales-final-20260805 \
  --project=$PROJECT --source-disk=misskey-bots-group-numbertales \
  --source-disk-zone=us-central1-a \
  --description="Final snapshot before decommission (infra consolidation 2026-08-05)"

gcloud compute snapshots create h0wm-final-20260805 \
  --project=$PROJECT --source-disk=misskey-bots-group-h0wm \
  --source-disk-zone=us-central1-a \
  --description="Final snapshot before decommission (infra consolidation 2026-08-05)"

gcloud compute snapshots list --project=$PROJECT \
  --format="table(name,diskSizeGb,sourceDisk.scope(disks),status,creationTimestamp)"
```

> スナップショットにも保管料はかかるが、ディスク実体よりはるかに安く、増分方式で圧縮も効く。
> **「ディスクを消してスナップショットを残す」のが料金面では正解**になる。

### 3-3. インスタンスを削除する

`autoDelete=False` のため、**この操作ではディスクは消えない**（3-4 が必要）。

```bash
gcloud compute instances delete misskey-bots-group-numbertales \
  --project=$PROJECT --zone=us-central1-a

gcloud compute instances delete misskey-bots-group-h0wm \
  --project=$PROJECT --zone=us-central1-a

# 別 Bot 管轄。所有者の同意が取れた場合のみ（こちらは autoDelete=True なのでディスクも消える）
# gcloud compute instances delete aphrnts-100-bot \
#   --project=$PROJECT --zone=asia-northeast1-a
```

### 3-4. 残ったディスクを削除する（**ここが本命**）

```bash
# アタッチ先が消えて未使用になっていることを確認（USERS 列が空）
gcloud compute disks list --project=$PROJECT \
  --format="table(name,zone,sizeGb,status,users[0].scope(instances))"

gcloud compute disks delete misskey-bots-group-numbertales \
  --project=$PROJECT --zone=us-central1-a
gcloud compute disks delete misskey-bots-group-h0wm \
  --project=$PROJECT --zone=us-central1-a
```

### 3-5. 古いスナップショットを整理する

`daily-keep4` が作った旧 VM ぶんの自動スナップショット（`misskey-bots-group--us-central1-a-*`）は、
3-2 の最終スナップショットを残したうえで削除してよい。**世代を1つは残す**こと。

```bash
gcloud compute snapshots list --project=$PROJECT \
  --filter="sourceDisk~misskey-bots-group-h0wm" \
  --format="table(name,creationTimestamp,diskSizeGb)"
# 残す1件を決めてから、不要ぶんを個別に削除する
# gcloud compute snapshots delete <SNAPSHOT_NAME> --project=$PROJECT
```

---

## 4. 事後確認

```bash
# インスタンス: misskey-bots-unified だけが残っていること
gcloud compute instances list --project=$PROJECT --format="table(name,zone,status)"

# ディスク: misskey-bots-unified(64GB) だけが残っていること
gcloud compute disks list --project=$PROJECT --format="table(name,zone,sizeGb,users[0].scope(instances))"

# 静的 IP: misskey-bots-unified-ip が IN_USE のままであること
#（RESERVED で未使用の IP は課金対象になるので、余っていれば解放する）
gcloud compute addresses list --project=$PROJECT --format="table(name,address,status,users[0])"

# Bot が無事であること（最重要）
gcloud compute instances describe misskey-bots-unified \
  --project=$PROJECT --zone=us-central1-a --format="value(status)"
```

最後に Bot の生死を実機で確認する。

```bash
node tools/fetch-vm-logs.mjs --lines 30
```

---

## 5. やってはいけないこと

- **現行 VM `misskey-bots-unified` およびそのディスク・静的 IP を対象に含めない。**
  共用 VM なので、誤って落とすと同居 Bot も巻き添えになる。
- **`daily-keep4` ポリシー自体を削除しない。** 現行 VM のバックアップに使われている。
  外すのは「停止済みディスクへの適用」だけ。
- **スナップショットを1件も残さずに全削除しない。** 復旧経路が消える。
- **`aphrnts-100-bot` を所有者の確認なく削除しない。** 本リポジトリの管轄外。
- **確認せずに `gcloud compute instances delete` を複数まとめて流さない。** 一件ずつ確認して実行する。
