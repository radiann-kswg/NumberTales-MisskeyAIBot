# VM OS アップグレードガイド — Ubuntu 20.04 → 22.04 → 24.04

> 対象: GCP VM `misskey-bots-group-numbertales`（us-central1-a / e2-small / pd-balanced 256GB）
> 関連: [deployment.md](./deployment.md) / 実施記録: [vm-upgrade-2026-07_worklog.md](./vm-upgrade-2026-07_worklog.md)

---

## 🚨 最重要: この VM には Misskey 本体が同居している

**Bot 専用サーバーではない。** 2026-07-20 の作業で判明した。

| 稼働中のもの | 実体 |
| --- | --- |
| **Misskey インスタンス** | PostgreSQL の `mk1` DB（87M）+ nginx（80/443）+ `misskey` ユーザー |
| NumberTales Bot | pm2 の `numbertales-bot`（SQLite `.cache/session.db` を使用） |

- **`postgresql-15` を削除・停止してはならない。** `mk1` は Misskey の本番データ。
  Bot 自身は SQLite なので PostgreSQL を使わないが、**同居している Misskey が使っている。**
- パッケージ掃除（`autoremove` 等）の際は、**必ず `postgresql` / `nginx` が対象外であることを確認**する。
- OS 作業で `systemctl` を触る場合、`postgresql` と `nginx` の生存を作業後に必ず確認する。

```bash
# 作業後の必須確認
systemctl is-active postgresql nginx
sudo -u postgres psql -lqt | cut -d"|" -f1 | grep mk1   # mk1 が見えること
```

---

## 現在の到達点（2026-07-20 時点）

| 区間 | 状態 |
| --- | --- |
| 20.04 → **22.04** | ✅ **完了**（Ubuntu 22.04.5 LTS。CI 緑化・Bot 稼働・Misskey 無傷を確認済み） |
| 22.04 → 24.04 | ⏸ **保留**。PostgreSQL 15→16 のデータ移行が前提（後述） |

22.04 の標準サポートは 2027年4月、PostgreSQL 15 のサポートは 2027年11月まで。
**急いで 24.04 へ上げる理由はない。** Misskey のダウンタイムを計画できる日に実施する。

### 24.04 へ進むためのブロッカー: PostgreSQL

`do-release-upgrade` は以下で中断する（2026-07-20 に実測）。

```
ERROR Could not calculate the upgrade
ERROR Dist-upgrade failed: 'The package 'postgresql-15' is marked for removal
  but it is in the removal deny list.
```

24.04 の標準 PostgreSQL は 16 のため 15 が削除対象になるが、deny list が削除を拒否して
依存計算が破綻する。**これは保護機構が正しく働いた結果であり、回避してはならない。**

進めるには先に `pg_upgradecluster` で 15 → 16 へ移行する。**Misskey の停止を伴う。**
実施時は最低限、以下を先に行うこと。

```bash
# 1. ディスクスナップショット（必須）
# 2. 論理バックアップも併せて取る
sudo -u postgres pg_dumpall > ~/pg_dumpall_$(date +%Y%m%d).sql
# 3. Misskey を停止してから移行
```

---

## 背景

実機は **Ubuntu 20.04.6 LTS (focal)** で稼働している（[deployment.md](./deployment.md) の「24.04 推奨」は
推奨値であって実機ではない）。20.04 は標準サポートが終了しており、`pro status` は `attached: false`
＝ **Ubuntu Pro 未契約のためセキュリティ更新が届いていない**。これが 24.04 へ移行する主動機。

副次的に、20.04 標準の git 2.25.1 は本リポジトリの要件（2.36+）を満たさず、2026-07-19 に
デプロイ障害を起こした（[deployment.md](./deployment.md) のトラブルシューティング参照）。
24.04 の標準 git は 2.43 なので、移行後は PPA なしで要件を満たす。

---

## 大原則

- **LTS は1つずつしか上がれない。** `20.04 → 22.04 → 24.04` の2段階。直接は飛べない。
- **必ずスナップショットを取ってから始める。** 唯一の完全なロールバック手段。
- **`tmux` / `screen` ではなく `setsid` でセッションから切り離して実行する。**
  SSH が切れるとアップグレードが中断するため端末から切り離す必要があるが、
  **`tmux` 自体が OS アップグレードの更新対象に含まれる。**
  2026-07-20 の 20.04→22.04 で実際に tmux サーバーが落ち、`do-release-upgrade` が端末を失って
  最後の `confirmRestart()` に応答できず孤児化した（パッケージ適用は完了済みだったので実害はなく、
  手動 `reboot` で復旧）。

  ```bash
  # ✅ setsid で切り離す（tmux に依存しない）
  sudo setsid nohup env DEBIAN_FRONTEND=noninteractive \
    do-release-upgrade -f DistUpgradeViewNonInteractive > ~/upgrade.log 2>&1 < /dev/null &
  ```

  `do-release-upgrade` は保険として port 1022 に専用 sshd を立てるが、頼らずに済ませるのが正道。

- **SSH のポーリングは 60 秒以上の間隔を空ける。** この VM の ufw は `22/tcp LIMIT IN`（`ufw limit ssh`）
  が有効で、**30 秒に 6 接続を超えるとブロックされる**。
  2026-07-20 に 15 秒間隔の監視スクリプトでこれを踏み、**自分で自分を締め出した**。
  しかも監視ループが接続を試み続けるためブロックが解除されず、ループを止めるまで回復しなかった。
  VM 側は正常稼働していたのに SSH だけが不通になるため、**サーバー障害と誤認しやすい**。

  ```bash
  sudo ufw status verbose            # 22/tcp LIMIT IN を確認
  # SSH が突然不通になったら、まず GCE シリアルコンソールで生死を確認する
  gcloud compute instances get-serial-port-output <instance> --zone=<zone> | tail -30
  # [UFW LIMIT BLOCK] ... DPT=22 が出ていれば自分が原因。接続を止めて数分待てば解除される
  ```
- **1段階ごとに検証する。** 22.04 が健全だと確認してから 24.04 へ進む。

> **⚠️ 中断の実例（2026-07-20）**: SSH 越しに素で `do-release-upgrade` を実行した結果、
> VM 再起動を挟んで依存解決の途中（`openCache()`）で停止した。
> このときは `sources.list` の書き換え前だったためシステムは無傷で、
> pm2 の `startup` 設定により Bot も自動復帰したが、**運が良かっただけ**。

### ⚠️ `pkill -f` を SSH 越しに使わない

中断した実行の残骸（port 1022 の `release-upgrader-sshd`）を掃除しようとして
`sudo pkill -f "release-upgrader-sshd"` を実行したところ、**自分の SSH セッションごと切断された**
（2026-07-20 に実際に踏んだ）。

`pkill -f` はプロセスの**コマンドライン全体**を対象にマッチする。SSH 越しに送ったコマンド文字列は
リモート側のシェルのコマンドラインにそのまま現れるため、**パターンが自分自身を実行しているシェルに
マッチして自滅する**。掃除は PID 指定で行うこと。

```bash
# ❌ 自分のセッションごと落ちる
sudo pkill -f "release-upgrader-sshd"

# ✅ PID ファイル経由で対象だけを止める
P=$(sudo cat /var/run/release-upgrader-sshd.pid 2>/dev/null)
[ -n "$P" ] && sudo kill "$P"
```

---

## 1. 事前準備

### 1-1. ディスクスナップショット（必須）

```bash
gcloud compute disks snapshot misskey-bots-group-numbertales \
  --zone=us-central1-a \
  --snapshot-names=pre-2204-upgrade-$(date +%Y%m%d) \
  --project=numbertales-misskey-surver

# READY を確認してから次へ進む
gcloud compute snapshots describe pre-2204-upgrade-$(date +%Y%m%d) \
  --project=numbertales-misskey-surver \
  --format="table(name,status,diskSizeGb,storageBytes)"
```

### 1-2. 設定・データのバックアップ

スナップショットがあれば足りるが、単体復旧が速いので併せて取得する。

```bash
# ローカルへ退避（.cache/ は git 管轄外）
mkdir -p .cache/vm-backup-$(date +%Y%m%d)
scp -i ~/.ssh/deploy_key_gha <user>@<host>:NumberTales-MisskeyAIBot/.env \
  .cache/vm-backup-$(date +%Y%m%d)/env.backup
scp -i ~/.ssh/deploy_key_gha <user>@<host>:NumberTales-MisskeyAIBot/.cache/session.db \
  .cache/vm-backup-$(date +%Y%m%d)/session.db
```

> `.env` は本番トークンを含む。取得後に中身を `cat` / ログ出力しないこと。

### 1-3. 健全性チェック

以下がすべて綺麗でないと、アップグレードが途中で詰まる。

```bash
sudo dpkg --audit            # 出力が空であること（壊れたパッケージなし）
apt list --upgradable        # 先に apt-get upgrade で消化しておく
df -h /                      # 空き容量。最低 5GB、できれば 10GB 以上
ls /var/run/reboot-required  # あれば先に再起動しておく
```

---

## 1-4. 【必読】20.04 → 22.04 は node-* パッケージで必ず失敗する

**2026-07-20 に実際に踏んだ。対処せずに実行しても `do-release-upgrade` は数十秒で abort する。**

```
ERROR Could not calculate the upgrade
  This was likely caused by: * Unofficial software packages not provided by Ubuntu
ERROR Dist-upgrade failed: 'E:Error, pkgProblemResolver::Resolve generated breaks,
  this may be caused by held packages.'
```

### 原因

`/var/log/dist-upgrade/apt.log` に決定的な証拠が出る。

```
Broken node-yargs-parser Breaks on node-yargs (< 16.2.0~)
Broken node-yargs Depends on node-escalade < none @un H >    ← jammy に存在しない
```

distro 由来の `node-*` パッケージが **275 個**入っており、そのうち `node-escalade` が
22.04 に存在しないため依存解決器が破綻する。20.04 → 22.04 の既知の典型パターン。
**PPA（git-core 等）は原因ではない。**

### 対処

孤立パッケージを掃除してから再実行する。対象は **384 個**（`node-*` 275 + `python2` 系 + `x11`/`fonts` 系）。

```bash
# 1. 何が消えるか必ず先に確認する（-s = シミュレーション）
sudo apt-get -s autoremove | grep "^Remv" | wc -l
sudo apt-get -s autoremove | grep -E "^Remv (git|nodejs|docker-ce|openssh-server) " \
  || echo "critical packages are safe"

# 2. 問題なければ実行
sudo apt-get autoremove --purge -y

# 3. 依存解決が通るか確認してから do-release-upgrade へ
sudo apt-get -s dist-upgrade
```

> **確認済み（2026-07-20）**: この 384 個に `git` / `nodejs` / `docker-ce` / `openssh-server` は
> **含まれない**。`apt-get -s autoremove` の出力を `grep git` すると
> `gyp [0.1+20180428git4d467626-3ubuntu1]` のバージョン文字列に引っかかるが、これは誤検知。
> 判定は必ず `grep "^Remv "` で行うこと。

### ⚠️ Node.js の実行系を壊さないこと

**pm2 デーモンは `/usr/bin/node`（nodesource 版 v22.23.1）で動いている。** nvm ではない。

```bash
sudo ls -l /proc/$(pgrep -f "PM2 v" | head -1)/exe   # -> /usr/bin/node
nvm version default                                   # -> v22.22.3（pm2 は使っていない）
```

`ecosystem.config.cjs` は `interpreter` を指定していないため、Bot は
**pm2 デーモンを起動した node** を継承する。したがって:

- **nodesource の `nodejs` パッケージを削除すると Bot が起動しなくなる。** autoremove 対象外であることを毎回確認する。
- `deploy.yml` は `nvm use default` するが、これは `npm install` / `npm run build` に効くだけで、
  pm2 デーモン自体の node は切り替わらない。
- OS アップグレード後は `node -v` と `pm2 list` の両方を必ず確認する。

---

## 2. 実行（20.04 → 22.04）

### 2-1. tmux セッションを張って実行

**SSH セッションが切れても生き残るよう、必ず tmux 内で起動する。**

```bash
# VM 上で
tmux new-session -d -s osupgrade
tmux send-keys -t osupgrade \
  'sudo DEBIAN_FRONTEND=noninteractive do-release-upgrade -f DistUpgradeViewNonInteractive 2>&1 | tee ~/upgrade-2204.log' C-m

# 進捗確認（別セッションから何度でも）
tmux capture-pane -t osupgrade -p | tail -30
tail -f ~/upgrade-2204.log
```

- `-f DistUpgradeViewNonInteractive` で対話プロンプトを自動応答する。
  設定ファイルの衝突は既存側（`--force-confold` 相当）が保持される。
- 完了時に **自動で再起動する**ため、SSH は一度切れる。数分待って再接続する。

### 2-2. サードパーティリポジトリの扱い

`do-release-upgrade` は自分が知らないリポジトリを**無効化して** `.distUpgrade` / `.save` に退避する。
本 VM には以下がある。アップグレード後に手動で復帰させる必要があるものを把握しておく。

| リポジトリ | アップグレード後の扱い |
| ---------- | ---------------------- |
| `nodesource.sources` | Node.js。**nvm 管理と併存しているため要確認**（deploy.yml は nvm 側を使う） |
| `git-core-ubuntu-ppa-*.list` | 22.04 標準 git は 2.34 なので **PPA の再有効化が必要**（要件は 2.36+） |
| `docker.list` | Docker。使用状況に応じて復帰 |
| `google_osconfig_managed.list` / `osconfig_managed_*.list` | GCP の OS Config エージェント。通常は自動復帰 |

> **注意**: 22.04 の標準 git は **2.34** で、本リポジトリの要件 2.36 に**わずかに届かない**。
> 22.04 段階では PPA の再有効化を忘れないこと。24.04 まで上げれば標準 git が 2.43 になり PPA は不要。

---

## 3. アップグレード後の検証

各段階の後に必ず実施する。

```bash
# OS
lsb_release -a

# git（要件 2.36+）
git --version

# Node.js（deploy.yml は nvm 経由で v22 を使う）
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use default; node -v

# pm2 と Bot
pm2 list                     # numbertales-bot が online
cat .cache/heartbeat.json    # wsConnected: true かつ ts が新しい

# デプロイ経路が通るか（失敗していた2箇所）
cd ~/NumberTales-MisskeyAIBot
git submodule update --init --recursive --filter=blob:none
bash tools/setup-creations-db-sparse.sh   # UP_TO_DATE / APPLIED どちらでも exit 0

# パッケージ健全性
sudo dpkg --audit
```

最後に CI を回して緑を確認する。

```bash
gh run list --workflow=deploy.yml --limit 3
gh run rerun <run-id> && gh run watch <run-id> --exit-status
```

---

## 4. ロールバック

アップグレードが破綻した場合、スナップショットから復元する。

```bash
# 1. インスタンスを停止
gcloud compute instances stop misskey-bots-group-numbertales \
  --zone=us-central1-a --project=numbertales-misskey-surver

# 2. スナップショットから新しいディスクを作成
gcloud compute disks create restored-numbertales \
  --source-snapshot=pre-2204-upgrade-<YYYYMMDD> \
  --zone=us-central1-a --type=pd-balanced \
  --project=numbertales-misskey-surver

# 3. 既存ブートディスクを外して復元ディスクを接続
gcloud compute instances detach-disk misskey-bots-group-numbertales \
  --disk=misskey-bots-group-numbertales \
  --zone=us-central1-a --project=numbertales-misskey-surver
gcloud compute instances attach-disk misskey-bots-group-numbertales \
  --disk=restored-numbertales --boot \
  --zone=us-central1-a --project=numbertales-misskey-surver

# 4. 起動して pm2 / Bot を確認
gcloud compute instances start misskey-bots-group-numbertales \
  --zone=us-central1-a --project=numbertales-misskey-surver
```

> 外部 IP を静的割り当てにしている場合、インスタンスを作り直しても IP は維持される。
> GitHub Secrets の `GCP_SSH_HOST` を変えずに済むか、復元前に確認しておくこと。

---

## 補足: ホーム直下の `.git`（2026-07-20 に退避済み）

`/home/<user>/.git` に **root 所有の空リポジトリ**（コミット0件・追跡ファイル0件）が存在していた。
git 2.35.2+ の `safe.directory` 検査により、**ホーム直下で git を叩くと**
`fatal: detected dubious ownership` で落ちる原因になる。

デプロイ経路は必ず `cd ~/NumberTales-MisskeyAIBot` してから git を実行するため実害はなかったが、
`~/.git.bak-20260720` へリネームして退避済み。リポジトリ外で git を実行するスクリプトを
追加する場合は、同種の残骸がないか確認すること。
