# デプロイガイド — GCP VM 本番環境

> 対象: GCP VM インスタンス（Debian 12 / Ubuntu 22.04 以降）
> デプロイ方式: GitHub Actions → SSH → PM2
>
> **実機の現況（2026-08-05 時点）**: **`misskey-bots-unified`**（us-central1-a / **e2-medium** /
> メモリ 4GB + swap 2GB）は **Debian 12 (bookworm)** / git **2.39.5**（Debian 標準）/
> Node.js **v22.23.2**（`/usr/bin/node`・nvm ではない）/ pm2 **7.0.3**。外部 IP は静的予約済み。
>
> **2026-08-05 のインフラ統合で構成が大きく変わった。** 旧実機
> `misskey-bots-group-numbertales`（Ubuntu 24.04 / e2-small）は停止済みで、本ガイドの記述は
> すべて新しい統合 VM を対象とする。特に次の3点は旧構成との差が大きい。
>
> 1. **Spot（プリエンプティブル）インスタンス** — 予告なく停止し得る。`automaticRestart` は使えない（後述 5-3）
> 2. **他 Bot と同居する共用 VM** — VM 全体に効く操作は同居 Bot を巻き添えにする（後述「共用 VM での作業原則」）
> 3. **Debian であって Ubuntu ではない** — `add-apt-repository ppa:...` は使えない（後述 1-4）
>
> 旧 VM の Ubuntu 移行手順・記録（[vm-os-upgrade.md](./vm-os-upgrade.md) /
> [vm-upgrade-2026-07_worklog.md](./vm-upgrade-2026-07_worklog.md)）は履歴として残しているが、
> **現行 VM には適用しないこと**。

---

## 前提条件

- GCP VM が起動済みで SSH 接続できる状態
- VM のパブリック IP が固定（静的外部 IP アドレスを割り当て済み）
- GCP のファイアウォールで SSH (TCP:22) が許可されている

---

## 0. 共用 VM での作業原則（重要）

統合 VM `misskey-bots-unified` では、本 Bot 以外に別 Bot が同居している。

| プロセス | 管理方式 | 所有 |
| -------- | -------- | ---- |
| `numbertales-bot` | **pm2**（`pm2-snine9801.service`） | 本リポジトリ |
| `aphrnts-100-bot.service` | systemd 直管理 | 別リポジトリ |
| `ai_bot.service` | systemd 直管理 | 別リポジトリ |

- **安全な操作**: `pm2` 配下の操作（`pm2 reload/restart/logs/list`）と `~/NumberTales-MisskeyAIBot` 配下の
  ファイル操作。これらは本 Bot にしか影響しない。通常のデプロイはすべてこの範囲に収まる。
- **同居 Bot を巻き添えにする操作**（単独判断で実施しない）:
  - VM の再起動・停止・リセット（`gcloud compute instances reset/stop`、GCE 外部ウォッチドッグの `reset`）
  - `apt-get upgrade` など OS パッケージ更新
  - ファイアウォール・sshd・システム全体の systemd 設定変更
  - ディスクのリサイズ・アンマウント
- **リソースは共有**。メモリ 4GB を3 Bot で分け合う。`ecosystem.config.cjs` の
  `max_memory_restart`（現行 512M）を引き上げるときは、同居 Bot の取り分を潰さないか確認すること。

---

## 1. 初回 VM セットアップ（一度だけ手動で実施）

### 1-1. SSH 接続

```bash
ssh <your-user>@<VM-external-ip>
```

### 1-2. Node.js v22+ のインストール（NodeSource 経由）

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v  # v22.x.x が表示されれば OK
```

> **Note**: Bot は Node.js v24 で開発しているが、v22 LTS でも動作する。
> v24 を使いたい場合は `setup_24.x` に変更すること。

> **⚠️ nvm は使わない。** 統合 VM の Node.js は NodeSource による**システム導入**（`/usr/bin/node`）で、
> `~/.nvm` は存在しない。[`deploy.yml`](../.github/workflows/deploy.yml) は `nvm.sh` があるときだけ
> 読み込む条件分岐にしてあるため両対応だが、**無条件に `nvm use` を書き足さないこと**
> （nvm 不在の環境では `command not found` = exit 127 となり、`set -e` でデプロイが丸ごと失敗する）。

### 1-3. PM2 のグローバルインストール

```bash
sudo npm install -g pm2
pm2 -v  # バージョンが表示されれば OK
```

### 1-4. Git の設定とリポジトリのクローン

> **⚠️ git 2.36 以上が必須。**
>
> | 使用箇所 | 必要バージョン |
> | -------- | -------------- |
> | `tools/setup-creations-db-sparse.sh` の `sparse-checkout set --no-cone` | **2.36+** |
> | 同 `sparse-checkout reapply` | 2.27+ |
> | `deploy.yml` の `git submodule update --filter=blob:none` | **2.36+** |
>
> 満たさないと `usage: git sparse-checkout (init|list|set|disable) <options>` を出して
> **デプロイが exit 129 で失敗する**（2026-07-19 の実障害。`--filter=blob:none` の方は
> `||` フォールバックがあるため単独では落ちない）。
>
> **現行の統合 VM（Debian 12）は標準の 2.39.5 で要件を満たすので、追加作業は不要。**
>
> **⚠️ Debian で `ppa:git-core/ppa` を使わないこと。** PPA は Ubuntu 専用の仕組みで、Debian に
> `add-apt-repository -y ppa:git-core/ppa` を実行すると **apt のソース設定が壊れる**。
> 旧 VM（Ubuntu）向けの手順が古いドキュメントに残っているが、現行 VM には適用しない。
> Debian で要件を割った場合は backports（`bookworm-backports`）から入れること。

```bash
# バージョン確認（Debian 12 標準は 2.39.5 で要件を満たす）
git --version

# ── 2.36 未満だった場合のみ。ディストリごとに手段が違う ──
# Debian: backports を使う（PPA は使えない）
#   echo "deb http://deb.debian.org/debian bookworm-backports main" | sudo tee /etc/apt/sources.list.d/backports.list
#   sudo apt-get update && sudo apt-get -t bookworm-backports install -y git
# Ubuntu のみ: PPA が使える
#   sudo add-apt-repository -y ppa:git-core/ppa && sudo apt-get update && sudo apt-get install -y git

cd ~
git clone https://github.com/radiann-kswg/NumberTales-MisskeyAIBot.git
cd NumberTales-MisskeyAIBot

# サブモジュールの初期化（創作DB参照用）
git submodule update --init --recursive
```

### 1-5. 依存パッケージのインストールとビルド

```bash
npm install
npm run build
```

### 1-6. `.env` ファイルの作成

```bash
cp .env.example .env
nano .env   # または vim .env
```

以下の値を本番用に設定する:

| 変数                           | 設定値の例                    |
| ------------------------------ | ----------------------------- |
| `MISSKEY_HOST`                 | `https://radiann6631.net`     |
| `MISSKEY_TOKEN`                | Bot アカウントの API トークン |
| `AI_PROVIDER`                  | `openai`                      |
| `OPENAI_API_KEY`               | OpenAI の API キー            |
| `GEMINI_API_KEY`               | Gemini の API キー            |
| `NODE_ENV`                     | **`production`**              |
| `LOG_LEVEL`                    | `info`                        |
| `DEFAULT_CHARACTER_NUM`        | `000`                         |
| `ADMIN_USER_IDS`               | `misskey_user_id_1,misskey_user_id_2` |
| `RATE_LIMIT_REPLY_COOLDOWN_MS` | `0`（無制限 ← 推奨）          |
| `RATE_LIMIT_GLOBAL_PER_HOUR`   | `10`                          |
| `INCIDENT_LOG_PATH`            | `.cache/incident.log`（推奨） |
| `ERROR_LOG_PATH`               | `.cache/error.log`（推奨）    |

`ADMIN_USER_IDS` に含まれるユーザーだけが、全体デフォルト担当の変更コマンドを実行できる。
個別担当キャラクターと全体デフォルト担当は `DB_PATH` の SQLite に永続化され、再起動後も維持される。

### 1-7. ログディレクトリの作成

PM2 がログを書き出すディレクトリを事前に作成する。

```bash
mkdir -p ~/NumberTales-MisskeyAIBot/logs
```

### 1-8. Bot の初回起動

```bash
cd ~/NumberTales-MisskeyAIBot
pm2 start ecosystem.config.cjs --env production
pm2 list  # "online" になっていれば OK
```

### 1-9. PM2 をシステム起動時に自動起動させる

> **⚠️ Spot VM では省略不可の手順。** 統合 VM はプリエンプションで予告なく停止し、GCE 外部
> ウォッチドッグが再起動をかける。この2コマンドを実施していないと、**VM は復帰するのに Bot だけ
> 上がってこない**という状態になる。VM を作り直したときも必ず実施すること。

```bash
pm2 startup
# 表示されたコマンドを実行（sudo が必要）
pm2 save
```

確認方法（両方が期待値でなければ復旧経路が切れている）:

```bash
systemctl is-enabled pm2-$(whoami)   # enabled
ls -la ~/.pm2/dump.pm2               # 存在すること（pm2 save の成果物）
```

---

## 2. GitHub Actions の設定（CI/CD）

`master` ブランチへの push 時に自動デプロイされる（[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)）。

### 2-1. GitHub Secrets の設定

リポジトリの `Settings > Secrets and variables > Actions` に以下を登録する:

| Secret 名             | 値                                                                 |
| --------------------- | ------------------------------------------------------------------ |
| `GCP_SSH_HOST`        | VM の外部 IP アドレス                                              |
| `GCP_SSH_USER`        | SSH ユーザー名（例: `ubuntu`, `deploy`）                           |
| `GCP_SSH_PRIVATE_KEY` | SSH 秘密鍵の内容（`-----BEGIN OPENSSH PRIVATE KEY-----` から全文） |
| `GCP_SSH_PORT`        | `22`（変更していない場合）                                         |

### 2-2. SSH 鍵ペアの生成（VM に登録済みでない場合）

**ローカルまたは別の安全な環境で生成する:**

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_key
```

- `deploy_key.pub`（公開鍵）の内容を VM の `~/.ssh/authorized_keys` に追記する
- `deploy_key`（秘密鍵）の内容を GitHub Secrets の `GCP_SSH_PRIVATE_KEY` に設定する

---

## 3. デプロイフロー（2回目以降）

```
git push origin master
       │
       ▼
GitHub Actions が起動
       │
       ▼
SSH で VM に接続
       │
       ├─ git fetch origin master
       ├─ git reset --hard origin/master   ← git pull ではなくこちらを使用
       ├─ npm install                      ← devDependencies 込み（ビルドに必要）
       ├─ npm run build
       ├─ npm prune --omit=dev             ← ビルド後に本番用へ最適化
       └─ pm2 reload ecosystem.config.cjs
              │
              ▼
         ダウンタイムなしで Bot が再起動
```

> **⚠️ `git pull` ではなく `git reset --hard` を使う理由**
> VM にローカル変更（`dist/` の生成物など）があると `git pull` が競合で失敗する。
> `git reset --hard origin/master` なら強制的にリモートの状態に揃えられる。

---

## 4. 運用コマンド

VM に SSH してから実行:

```bash
# Bot のステータス確認
pm2 list

# リアルタイムログ確認
pm2 logs numbertales-bot

# 手動で再起動
pm2 restart numbertales-bot

# Bot を停止
pm2 stop numbertales-bot

# ログファイルをクリア
pm2 flush numbertales-bot

# インシデントログ（ハラスメント検知）確認
tail -n 20 .cache/incident.log
grep '"level":3' .cache/incident.log   # L3（暴言・脅迫）のみ

# エラーログ確認
tail -n 20 .cache/error.log
grep '"level":"error"' .cache/error.log  # error のみ
```

---

## 5. 自動復旧（ウォッチドッグ）

障害レイヤーごとに3層で自動復旧する。詳細設計は
[`_ideas/milestone/2026-07-04_milestone_auto-recovery.md`](../_ideas/milestone/completed/2026-07-04_milestone_auto-recovery.md) を参照。

| レイヤー | 障害 | 復旧手段 |
| -------- | ---- | -------- |
| 1 | プロセスの即死・クラッシュ | PM2 `autorestart`（既存） |
| 2 | プロセスハング / WS切断継続 / PM2 `errored` 放置 | VM内ウォッチドッグ（`tools/vm-watchdog.mjs` + systemd timer） |
| 3 | VMごとフリーズ・停止 / **Spot のプリエンプション** | GCE外部ウォッチドッグ（Cloud Scheduler + Cloud Run functions → reset/start）＋ `pm2 startup`/`pm2 save` による起動時復帰 |

### 5-1. Bot ハートビート

Bot は起動中、`HEARTBEAT_PATH`（デフォルト `.cache/heartbeat.json`）へ30秒ごとに
`{ ts, wsConnected, lastConnectedAt, uptimeSec }` を書き出す。追加設定は不要
（`.env` の `HEARTBEAT_PATH` / `HEARTBEAT_INTERVAL_MS` で変更可能）。

### 5-2. VM内ウォッチドッグの導入（初回のみ）

毎分 `tools/vm-watchdog.mjs` を systemd timer で実行し、以下の場合に pm2 を再起動する。

- pm2 のプロセスが `online` でない（`errored` / `stopped` / 未登録）
- ハートビートが3分以上更新されていない（イベントループのハング）
- WebSocket 切断が10分以上継続（自動再接続の失敗）
- フラッピング防止: 再起動は30分間に3回まで。超過時は `.cache/watchdog.log` に記録して抑止

```bash
cd ~/NumberTales-MisskeyAIBot

# ユニットファイルを配置（<USER> と <REPO_DIR> を置換）
sed -e "s|<USER>|$(whoami)|g" -e "s|<REPO_DIR>|$HOME/NumberTales-MisskeyAIBot|g" \
  tools/systemd/numbertales-watchdog.service | sudo tee /etc/systemd/system/numbertales-watchdog.service
sudo cp tools/systemd/numbertales-watchdog.timer /etc/systemd/system/

# 有効化
sudo systemctl daemon-reload
sudo systemctl enable --now numbertales-watchdog.timer

# 動作確認
systemctl list-timers numbertales-watchdog.timer
node tools/vm-watchdog.mjs --dry-run   # 手動判定（再起動はしない）
tail -n 20 .cache/watchdog.log         # 異常検知・再起動の記録
```

### 5-3. GCE外部ウォッチドッグの導入

VM そのものが落ちた場合の復旧。セットアップ手順・gcloud コマンドは
[`tools/gce-watchdog/README.md`](../tools/gce-watchdog/README.md) を参照。

> **⚠️ Spot 化でこのレイヤーの役割が変わった（2026-08-05）。**
>
> - 統合 VM は Spot のため **`automaticRestart` を有効化できない**（`False` 固定・
>   `onHostMaintenance=TERMINATE`）。旧構成の「`automaticRestart` も併せて確認する」という
>   指示は**現行 VM では無効**なので実行しないこと。
> - その結果、**プリエンプションからの復帰はレイヤー3が一手に担う**。
>   関数は `TERMINATED` を検知して `instances.start()` を呼ぶ。ここが止まると Bot は落ちたままになる。
> - **共用 VM のため `instances.reset()` は同居 Bot も強制再起動する。** 現行の関数は
>   「無応答かつ `RUNNING`」で `reset()` を撃つ実装のままなので、共用環境向けの再設計を
>   [`_ideas/milestone/2026-08-05_milestone_shared-vm-unified-watchdog.md`](../_ideas/milestone/2026-08-05_milestone_shared-vm-unified-watchdog.md)
>   に起票済み。再設計が入るまでは、`reset` が走ったら同居 Bot の生死も確認すること。

現行の向き先（2026-08-05 時点で更新済み）:

```bash
gcloud functions describe numbertales-gce-watchdog \
  --project=numbertales-misskey-surver --region=us-central1 --gen2 \
  --format="value(serviceConfig.environmentVariables)"
# GCE_INSTANCE=misskey-bots-unified / GCE_ZONE=us-central1-a / TARGET_IP=<統合VMの静的IP>
```

> **VM を作り替えたら、この関数の `GCE_INSTANCE` / `TARGET_IP` と GitHub Secrets の
> `GCP_SSH_HOST` を必ず同時に更新すること。** 旧インスタンスを指したまま放置すると、関数が
> 停止済み VM を `TERMINATED` と判定して **`start()` で叩き起こし続け、課金が止まらない**。

---

## 6. トラブルシューティング

### Bot が起動しない

```bash
pm2 logs numbertales-bot --lines 50
```

ログを確認して、`.env` の設定値（APIトークン・ホスト名）が正しいか確認する。

### GitHub Actions が失敗する

- `GCP_SSH_HOST` の IP が正しいか確認
- VM のファイアウォールルールで GitHub Actions のサーバー範囲から SSH が許可されているか確認
  - または GCP のファイアウォールで `0.0.0.0/0` → TCP:22 を一時的に許可して切り分ける
- SSH 秘密鍵が正しく登録されているか確認（改行を含む全文が Secrets に入っているか）

#### `Process exited with status 129` / `usage: git sparse-checkout ...`

**VM の git が古い**（2.36 未満）。1-4 の手順で PPA から更新する。
実行ログの見分け方は以下。SSH 接続自体は成功しており、失敗はスクリプト内部で起きている。

```
git sparse-checkout set --no-cone --stdin
  → usage: git sparse-checkout (init|list|set|disable) <options>
  → Process exited with status 129
```

> 2026-07-19 の `fc9fa60`（PR #25）で発生した実障害。ジョブが十数秒で落ちるため
> 一見 SSH 接続失敗に見えるが、実際には `git` のオプション非対応が原因だった。
> 切り分けには `gh run view <run-id> --log-failed` で**実ログを読むこと**（推測しない）。

#### 失敗したデプロイを再実行したい / 疎通だけ確認したい

`deploy.yml` は `workflow_dispatch` に対応しているので、**master への push を伴わずに手動実行できる**。
VM を入れ替えたときや GitHub Secrets（`GCP_SSH_HOST` 等）を更新したときの疎通確認に使う。

```bash
# 手動実行（実行内容は push 時と同一。VM へ反映されるのは master の内容）
gh workflow run deploy.yml
gh run watch "$(gh run list --workflow=deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

特定の run をやり直す場合は run ID を指定する。

```bash
gh run list --workflow=deploy.yml --limit 5      # run ID を調べる
gh run rerun <run-id>
gh run watch <run-id> --exit-status
```

> **Secrets の設定ミスは接続段階で落ちるため、Bot 実機には影響しない。**
> `GCP_SSH_HOST` が誤っていれば SSH 接続に失敗してジョブが終了し、VM 上では何も実行されない
> （`git reset` も `pm2 reload` も走らない）。稼働中の Bot を巻き込まずに検証できる。

### メンションに返答しない・Bot がリプライを無視する

`.env` の `RATE_LIMIT_REPLY_COOLDOWN_MS` が大きな値（例: `1800000`）になっていないか確認する。
この値が設定されていると、同一ユーザーへの返信が指定ミリ秒間ブロックされる。
通常は `0`（無制限）が推奨。

```bash
# VM 上で .env を確認（API キーを伏せて表示）
grep -vE "TOKEN|KEY|SECRET" .env
```

> **⚠️ `-E` フラグが必須**: `grep -v "TOKEN|KEY"` のように `-E` を省くと `|` がリテラル文字として扱われ、
> すべての行が表示されてシークレットが漏洩する。必ず `grep -vE` を使うこと。

### マルチキャラクターの設定が反映されない

- `.env` の `DEFAULT_CHARACTER_NUM` と `ADMIN_USER_IDS` が正しいか確認する
- 反映済みの個別担当や標準担当は `DB_PATH` の SQLite に残るため、設定変更後に挙動を初期化したい場合は Bot 停止後に対象 DB を退避または削除する
- 管理者コマンドは `ADMIN_USER_IDS` に含まれないユーザーからは実行できない

### メモリ不足で再起動が頻発する

`ecosystem.config.cjs` の `max_memory_restart` を調整するか、VM のスペックをアップグレードする。
現行の統合 VM は e2-medium（4GB + swap 2GB）で、設定値は `512M`（実測の常用は 130MB 前後）。

> **⚠️ 共用 VM なのでメモリは 3 Bot で分け合っている。** 上限を上げる前に `free -m` と
> 同居 Bot の使用量を確認すること。参考として、旧構成の e2-micro（1GB）では `256M` が目安だった。

### Bot が突然落ちて、しばらくして復帰していた

**Spot インスタンスのプリエンプションを疑う。** 統合 VM は Spot のため GCE 都合で予告なく停止する。
この場合 VM ごと `TERMINATED` になり、GCE 外部ウォッチドッグが最大5分後に `start()` で復帰させる。

```bash
# インスタンスの状態と直近のオペレーション履歴を確認
gcloud compute instances describe misskey-bots-unified \
  --project=numbertales-misskey-surver --zone=us-central1-a --format="value(status)"

gcloud compute operations list --project=numbertales-misskey-surver \
  --filter="targetLink~misskey-bots-unified" --sort-by=~insertTime --limit=10 \
  --format="table(operationType,status,insertTime)"
# compute.instances.preempted が出ていればプリエンプション
```

復帰後に Bot が上がってこない場合は 1-9 の `pm2 startup` / `pm2 save` が効いているかを確認する
（`systemctl is-enabled pm2-$(whoami)` と `~/.pm2/dump.pm2` の存在）。
なお停止が30分を超えた場合のみ、Bot 自身が復旧通知を1回投稿する（`features/recovery-notice.ts`）。

### インシデントログが生成されない

`.env` に `INCIDENT_LOG_PATH` が設定されている場合は指定パスへの書き込み権限を確認する。
デフォルト（`.cache/incident.log`）の場合、`.cache/` ディレクトリは起動時に自動作成される。

```bash
# 権限確認
ls -la .cache/
grep -vE "TOKEN|KEY|SECRET" .env | grep LOG_PATH
```
