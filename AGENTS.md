# NumberTales-MisskeyAIBot — Agent Instructions

## プロジェクト概要

このリポジトリは、創作キャラクター「[ナンバーテールズ0番機 000(チトセ)](https://database.numbertales-radiann.net/pages/characters.html?work=Works_NumberTales&db=Primary&num=000&idx=000&idxKey=Num&q=)」を模した生成AIを用いた **Misskey AI Bot** の開発・アイディア整理を行うプロジェクトです。

- **Bot主人公キャラクター**: ナンバーテールズ0番機 000(チトセ) — 中性的な気質を持つ若手エンジニア肌のポータブルヒューマノイド
- **プラットフォーム**: [Misskey](https://misskey-hub.net/)（分散型SNS）
- **AI基盤**: ChatGPT / Gemini 等の生成AI API

## リポジトリ構成

```
src/
  index.ts                    # エントリポイント
  ai/                         # AIProvider 抽象レイヤー（OpenAI / Gemini）
  bot/
    classifier/intent.ts      # 意図分類（返り値: ClassificationResult）
    handlers/mention.ts       # メンション受信ハンドラ（4 分岐）
    handlers/timeline.ts      # homeTimeline リアクションハンドラ
    ratelimit/                 # RateLimiter クラス
    reactor/                   # 絵文字マップ・感情分類
    responder/                 # 発言書式・テンプレート
    scheduler/                 # 時間帯別自発投稿
  config/                     # 環境変数・定数
  misskey/client.ts           # Misskey WebSocket クライアントラッパー
  storage/session.ts          # SQLite セッションコンテキスト
  utils/                      # ロガー等
docs/                         # 詳細ドキュメント（architecture / development / deployment）
_ideas/bot-spec/              # 仕様書・設計ドキュメント
_roleplay-datas/              # ロールプレイ用プロンプト・AI連携情報
  roleplay-prompt.md          # 000(チトセ)のキャラクター設定・命令文
  ai-link.md                  # 連携中のAIサービスリンク
_rough-idea/                  # アイディア検討メモ（ChatGPT/Geminiとの対話ログ）
_creations-db/                # サブモジュール: 百花繚乱研究所 創作DB
  data/                       # キャラクターJSONデータ
  api/                        # 擬似API
  docs/                       # ドキュメント
```

## 重要なリファレンス

- **創作DB (サブモジュール)**: [`_creations-db/`](./_creations-db/) — キャラクターデータはここのJSONを参照
- **キャラクターDB UI**: https://database.numbertales-radiann.net/pages/characters.html
- **ナンバーテールズ公式サイト**: https://www.numbertales-radiann.com/
- **000(チトセ) キャラクターページ**: https://database.numbertales-radiann.net/pages/characters.html?work=Works_NumberTales&db=Primary&num=000&idx=000&idxKey=Num&q=
- **AI連携リンク集**: [\_roleplay-datas/ai-link.md](./_roleplay-datas/ai-link.md)

## キャラクター・世界観の注意事項

- **ナンバーテールズ**は「百花繚乱研究所」制作の妖獣型ポータブルヒューマノイドシリーズ（著作権者: RadianN_kswg/ラジアン）
- キャラクターに関するコード・プロンプト生成時は [ロールプレイ設定](./_roleplay-datas/roleplay-prompt.md) を参照すること
- ガイドライン遵守が必須: 反社会的・性的表現・ヘイト行為・公式設定からの著しい逸脱は禁止
- 創作DBのライセンスは **CC BY-NC 4.0** — 商用利用不可

## Bot開発に関するコンテキスト

### 実装済み機能

| 機能 ID | 内容 | 状態 |
|---|---|---|
| Phase 1 | WebSocket 接続・メンション受信・LLM 返信・CW 制御 | ✅ 完了 |
| Phase 1 | SQLite セッション会話履歴（TTL 30分・最大3往復） | ✅ 完了 |
| F-01 拡張 | 意図分類 4 分岐（greeting / form-switch / creative-consultation / chat） | ✅ 完了 |
| F-02 | 時間帯別自発投稿スケジューラー（朝/昼/夕方/深夜） | ✅ 完了 |
| F-03 | 創作壁打ちモード（creative-consultation ブランチ） | ✅ 完了 |
| F-04 | TL リアクション（homeTimeline 購読 + カスタム絵文字感情分類） | ✅ 完了 |
| F-06 | 数字・ヌメロジーコマンド | ✅ 完了 |
| — | マルチキャラクター切り替え | ✅ 実装済み |

### 検討中のBot機能アイデア

詳細は [`_rough-idea/`](./_rough-idea/) を参照:

- **ゆる会話系**: 深夜雑談・インスタンス文化学習
- **創作支援系**: お題生成・キャラ設定補助・世界観深掘り
- **リアクション特化系**: カスタム絵文字感情妖精・リアクションBot
- **000(チトセ)固有**: 球体型/人型のモード切り替え・開発者代行キャラとしての振る舞い

### Misskey Bot実装上の注意

- 投稿文字数: インスタンスにより異なるが最大3000文字程度
- 日常会話は100文字以内を目安とし、詳細はCW(注釈)内に
- カスタム絵文字を積極活用
- ユーザー個人情報の永続保存は行わない

## サブモジュールの更新方法

```bash
# 最新データを取得する場合
git submodule update --remote _creations-db
```

## VM 操作・SSH 作業上の注意（重要）

### `.env` ファイル確認コマンド

**必ず `-E` フラグを付けること。**

```bash
# ✅ 正しい（-E フラグが必須）
grep -vE "TOKEN|KEY|SECRET" .env

# ❌ 間違い（-E なしでは | がリテラル文字として扱われ全行通過 → シークレット漏洩）
grep -v "TOKEN|KEY" .env
```

### git deploy の操作

VM 側に `dist/` などのローカル変更があると `git pull` が失敗する。  
**GitHub Actions および手動デプロイでは必ず `git reset --hard` を使用すること。**

```bash
# ✅ 正しい手順
git fetch origin master
git reset --hard origin/master
npm install --omit=dev
npm run build
pm2 reload ecosystem.config.cjs

# ❌ 間違い（ローカル変更があるとコンフリクトで止まる）
git pull origin master
```

### Bot が返信しない場合の確認

`.env` の `RATE_LIMIT_REPLY_COOLDOWN_MS` を確認する。`0` 以外（例: `1800000`）が設定されていると  
同一ユーザーへの返信が指定ミリ秒間ブロックされる。基本的に `0`（無制限）が推奨。

```bash
grep -vE "TOKEN|KEY|SECRET" .env | grep RATE_LIMIT
```

### PM2 ログ確認

```bash
pm2 logs numbertales-bot --lines 20
```

## 開発スタイル

- Bot本体以外に相当するデータやコードは、フォルダ名にprefix「\_」を付けて管理
- ChatGPT/Geminiで行った初回のアイディア検討は `_rough-idea/` 以下にマークダウンで記録
- GitHub Copilotで行った仕様決定と詳細設計に関するアイディアの記録（`_rough-idea/`より後のアイディア検討）は、`_ideas/` 以下にマークダウンで記録
- ロールプレイ用プロンプトの改善は `_roleplay-datas/` 以下で管理
- キャラクターデータへの直接編集は行わず、サブモジュール経由で参照のみ行う
- Copilotにより生成された一時的なファイルは、git管轄外である`.cache`以下に保存し必要に応じて削除する
- Botのコードは、実装が進むにつれて`src/`以下に配置予定
- ドキュメントは`docs/`以下に配置予定
