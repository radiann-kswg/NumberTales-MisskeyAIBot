# デプロイガイド — GCP VM 本番環境

> 対象: GCP VM インスタンス（Ubuntu 24.04 LTS 推奨）
> デプロイ方式: GitHub Actions → SSH → PM2

---

## 前提条件

- GCP VM が起動済みで SSH 接続できる状態
- VM のパブリック IP が固定（静的外部 IP アドレスを割り当て済み）
- GCP のファイアウォールで SSH (TCP:22) が許可されている

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

### 1-3. PM2 のグローバルインストール

```bash
sudo npm install -g pm2
pm2 -v  # バージョンが表示されれば OK
```

### 1-4. Git の設定とリポジトリのクローン

```bash
cd ~
git clone https://github.com/radiann-kswg/NumberTales-MisskeyAIBot.git
cd NumberTales-MisskeyAIBot

# サブモジュールの初期化（創作DB参照用）
git submodule update --init --recursive
```

### 1-5. 依存パッケージのインストールとビルド

```bash
npm install --omit=dev
npm run build
```

### 1-6. `.env` ファイルの作成

```bash
cp .env.example .env
nano .env   # または vim .env
```

以下の値を本番用に設定する:

| 変数 | 設定値の例 |
|------|------------|
| `MISSKEY_HOST` | `https://radiann6631.net` |
| `MISSKEY_TOKEN` | Bot アカウントの API トークン |
| `AI_PROVIDER` | `openai` |
| `OPENAI_API_KEY` | OpenAI の API キー |
| `GEMINI_API_KEY` | Gemini の API キー |
| `NODE_ENV` | **`production`** |
| `LOG_LEVEL` | `info` |
| `RATE_LIMIT_REPLY_COOLDOWN_MS` | `1800000`（30分） |
| `RATE_LIMIT_GLOBAL_PER_HOUR` | `10` |

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

```bash
pm2 startup
# 表示されたコマンドを実行（sudo が必要）
pm2 save
```

---

## 2. GitHub Actions の設定（CI/CD）

`master` ブランチへの push 時に自動デプロイされる（[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)）。

### 2-1. GitHub Secrets の設定

リポジトリの `Settings > Secrets and variables > Actions` に以下を登録する:

| Secret 名 | 値 |
|-----------|-----|
| `GCP_SSH_HOST` | VM の外部 IP アドレス |
| `GCP_SSH_USER` | SSH ユーザー名（例: `ubuntu`, `deploy`） |
| `GCP_SSH_PRIVATE_KEY` | SSH 秘密鍵の内容（`-----BEGIN OPENSSH PRIVATE KEY-----` から全文） |
| `GCP_SSH_PORT` | `22`（変更していない場合） |

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
       ├─ git pull origin master
       ├─ npm install --omit=dev
       ├─ npm run build
       └─ pm2 reload ecosystem.config.cjs
              │
              ▼
         ダウンタイムなしで Bot が再起動
```

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
```

---

## 5. トラブルシューティング

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

### メモリ不足で再起動が頻発する

`ecosystem.config.cjs` の `max_memory_restart` を調整するか、VM のスペックをアップグレードする。
e2-micro（メモリ 1GB）の場合、`256M` 程度に設定するのが安全。
