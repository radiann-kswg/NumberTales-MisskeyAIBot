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
    character/                # マルチキャラクター切り替え・動的プロンプト生成
    classifier/intent.ts      # 意図分類（返り値: ClassificationResult）
    handlers/mention.ts       # メンション受信ハンドラ（切り替え / F-06 / 雑談）
    handlers/timeline.ts      # homeTimeline リアクションハンドラ
    handlers/follow.ts        # フォローバックハンドラ
    ratelimit/                 # RateLimiter クラス
    reactor/                   # 絵文字マップ・感情分類
    responder/                 # 発言書式・テンプレート
    scheduler/                 # 時間帯別自発投稿
  features/f06/               # 数字・ヌメロジーコマンド（F-06）
  config/                     # 環境変数・定数
  misskey/client.ts           # Misskey WebSocket クライアントラッパー
  storage/session.ts          # SQLite セッションコンテキスト
  utils/                      # ロガー等
docs/                         # 詳細ドキュメント（architecture / development / deployment）
_ideas/
  bot-spec/                   # 仕様書・設計ドキュメント
  milestone/                  # 実装予定マイルストーン（着手待ち・進行中）
  future-plan/                # 将来的な機能・改修の検討メモ
  archived/                   # 完了・破棄済みアイデアのアーカイブ
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

| 機能 ID   | 内容                                                                      | 状態        |
| --------- | ------------------------------------------------------------------------- | ----------- |
| Phase 1   | WebSocket 接続・メンション受信・LLM 返信・CW 制御                         | ✅ 完了     |
| Phase 1   | SQLite セッション会話履歴（TTL 30分・最大3往復）                          | ✅ 完了     |
| F-01 拡張 | 意図分類 4 分岐（greeting / form-switch / creative-consultation / chat）  | ✅ 完了     |
| F-02      | 時間帯別自発投稿スケジューラー（朝/昼/夕方/深夜）                         | ✅ 完了     |
| F-02拡張  | 週次担当選出（土曜 0:00 Poll 投稿・48h投票・重み付き Tier 抽選・連続除外）       | ✅ 完了     |
| F-02拡張  | 投票ノートのセルフリノート（投票期間中の毎時リマインド）                     | ✅ 完了     |
| F-03      | 創作壁打ちモード（creative-consultation ブランチ）                        | ✅ 完了     |
| F-04      | TL リアクション（homeTimeline 購読 + カスタム絵文字感情分類）             | ✅ 完了     |
| F-06      | 数字・ヌメロジーコマンド                                                  | ✅ 完了     |
| —         | マルチキャラクター切り替え                                                | ✅ 実装済み |
| —         | 返答 LLM 化（切替メッセージ・DB呈稱パース・挨拶時間帯・結果フレーミング） | ✅ 実装済み |
| —         | フォローバック（followed イベント受信時に自動フォロー）                   | ✅ 実装済み |
| F-07      | ハラスメント仲介（L1/L2/L3 分類・担当キャラ・000/10(ミツル) 介入）        | ✅ 実装済み |
| —         | インシデントロガー（ハラスメント検知時に NDJSON ファイル出力）            | ✅ 実装済み |
| —         | エラーロガー（error/warn レベルを NDJSON ファイルに永続化）               | ✅ 実装済み |
| —         | 絵文字補完（標準名不存在時にエイリアス/タグから解決・`resolveCoreFolderEmoji` 一元化） | ✅ 実装済み |
| F-02改修 | 週次集計タイミング修正（日曜23:55→月曜0:00）・集計/就任挨拶を formatSpeech 形式に統一 | ✅ 実装済み |
| —         | 管理者コマンド: 自発投稿担当切り替え（投票結果告知と同形式で公開投稿）          | ✅ 実装済み |

### 検討中のBot機能アイデア

初期アイデアは [`_rough-idea/`](./_rough-idea/) を参照。詳細仕様・実装計画は [`_ideas/`](./_ideas/) を参照:


- **Phase 3 後続機能**: ヌメロジー相談モード / 自発投稿キャラローテーション
  → [`_ideas/future-plan/`](./_ideas/future-plan/)
- **内部処理改修（将来）**: 創作DB参照手段の拡張（HTTP動的フェッチ検討）
  → [`_ideas/future-plan/creations-db-reference-expansion.md`](./_ideas/future-plan/creations-db-reference-expansion.md)

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
