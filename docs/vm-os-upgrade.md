# VM OS アップグレードガイド — Ubuntu 20.04 → 22.04 → 24.04

> 対象: GCP VM `misskey-bots-group-numbertales`（us-central1-a / e2-small / pd-balanced 256GB）
> 関連: [deployment.md](./deployment.md)

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
- **必ず `tmux`（または `screen`）の中で実行する。** SSH が切れるとアップグレードが中断し、
  `sources.list` が書き換わった半端な状態で止まると復旧が面倒になる。
  `do-release-upgrade` は保険として **port 1022 に専用 sshd** を立てるが、頼らずに済ませるのが正道。
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
