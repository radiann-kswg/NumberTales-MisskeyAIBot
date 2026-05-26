# NumberTales Misskey AI Bot

**ナンバーテールズ0番機 000(チトセ)** を模した生成 AI Bot を [Misskey](https://misskey-hub.net/)（分散型SNS）上で動作させるリポジトリです。

> キャラクター「ナンバーテールズ」は百花繚乱研究所（著作権者: RadianN_kswg）制作の創作シリーズです。
> 本 Bot および関連コードは [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) に従って公開されています。

---

## Bot の概要

| 項目             | 内容                                              |
| ---------------- | ------------------------------------------------- |
| Bot キャラクター | ナンバーテールズ0番機 **000(チトセ)**             |
| 稼働インスタンス | `radiann6631.net`（お一人様 Misskey）             |
| ランタイム       | Node.js v22 / TypeScript 5.x / ESM                |
| AI エンジン      | OpenAI GPT-4o-mini（Gemini 1.5 Flash にも切替可） |
| デプロイ先       | GCP VM（Ubuntu 20.04）/ PM2 管理                  |
| CI/CD            | GitHub Actions → SSH → `pm2 reload`               |

---

## 実装済み機能

### F-01: メンション応答

ユーザーからのメンションに対して 000(チトセ) として返答します。

- **意図分類**（ルールベース正規表現）により 4 種類の挙動を切り替え
  - `greeting` — 挨拶への定型返答
  - `form-switch` — コアフォルダ / ヒューマノイド形態切り替え演出
  - `creative-consultation` — 創作壁打ちモード（専用プロンプトで LLM 生成）
  - `chat` — 通常雑談（セッション履歴付き LLM 生成）
- 返答書式: `000 :aphrnts0_corefolder:「台詞」`（カスタム絵文字付き）
- 100 文字超の返答は CW（ContentWarning）`000の返信` で折りたたみ
- 返信後に元ノートへカスタム絵文字リアクションを自動付与

### F-02: 時間帯別自発投稿

1 日 4 スロットで 000(チトセ) がホーム公開でつぶやきます。

| スロット | 時間帯 (JST) | テーマ             |
| -------- | ------------ | ------------------ |
| 朝       | 6:00〜8:00   | 軽い挨拶・作業開始 |
| 昼       | 12:00〜13:00 | 落ち着いたつぶやき |
| 夕方     | 17:00〜19:00 | 終業・作業まとめ   |
| 深夜     | 23:00〜5:00  | ほっこり・哲学的   |

各スロットのクールダウンはランダム 1〜2 時間。10 分ごとに発火判定。

### F-03: 創作壁打ちモード

「お題ください」「世界観について教えて」などのメンションに対し、
**創作支援専用システムプロンプト**で LLM が応答します（200 文字以内・CW 付き）。

### F-04: リアクション・エモパシー

フォロイーのホームタイムラインを購読し、感情文脈を読み取ってカスタム絵文字リアクションを送ります。

- **対象**: フォロイーのノート（homeTimeline チャンネル）
- **フィルタリング**: 画像添付・高度 MFM・絵文字 3 個以上・50 文字超はスキップ
- **感情カテゴリ** → 絵文字の例:
  - 完成・達成 → `yattaze_aphrnts41`（やったぜ！）
  - 疲労・お疲れ → `otukaresama_aphrnts31`（お疲れ様）
  - 共感・いいね → `iine_aphrnts42`（いいね）
  - 面白い・発見 → `omoshiroi_i_aphrnts65`（面白い！）
  - かわいい・素敵 → `kawaii_aphrnts6`（かわいい）
  - 挨拶系 → 朝/帰宅/出発/夜に応じた絵文字
  - 応援 → `ganbare_aphrnts93`（がんばれ）
- **レートリミット**: 同一ユーザー 1 時間 1 回・全体 20 回/時

---

## ディレクトリ構成

```
src/
  index.ts                    # エントリポイント
  ai/                         # AI プロバイダー抽象レイヤー（OpenAI / Gemini）
  bot/
    classifier/intent.ts      # 意図分類エンジン
    handlers/mention.ts       # メンション受信ハンドラ
    handlers/timeline.ts      # homeTimeline リアクションハンドラ
    ratelimit/                 # レートリミッター
    reactor/                   # リアクション絵文字マップ・感情分類
    responder/                 # 応答書式・絵文字テンプレート
    scheduler/                 # 時間帯別自発投稿スケジューラー
  config/                     # 環境変数・定数
  misskey/client.ts           # Misskey WebSocket クライアントラッパー
  storage/session.ts          # SQLite セッションコンテキスト
  utils/                      # ロガー等
docs/                         # 詳細ドキュメント
  deployment.md               # デプロイ手順（GCP VM + GitHub Actions）
  architecture.md             # 技術アーキテクチャ詳細
  development.md              # ローカル開発ガイド
_ideas/bot-spec/              # 仕様書・設計ドキュメント
_roleplay-datas/              # キャラクタープロンプト・AI 連携情報
_creations-db/                # サブモジュール: 百花繚乱研究所 創作DB（参照専用）
```

---

## セットアップ（簡易）

```bash
# 1. リポジトリをクローン
git clone https://github.com/radiann-kswg/NumberTales-MisskeyAIBot.git
cd NumberTales-MisskeyAIBot
git submodule update --init --recursive

# 2. 依存パッケージのインストール
npm install

# 3. 環境変数の設定
cp .env.example .env
# .env を編集して API トークンを設定

# 4. ビルド & 起動
npm run build
npm start
```

詳細は [docs/development.md](docs/development.md) / [docs/deployment.md](docs/deployment.md) を参照してください。

---

## 今後の予定

- [ ] F-06: 数字・ヌメロジーコマンド（計算・ダイス・数秘占い）
- [ ] マルチキャラクター切り替え（公開済みナンバーテールズ各個体対応）
- [ ] F-05: TL 観測レポート（オプション）

---

## ライセンス・クレジット

- **本 Bot コード**: [CC BY-NC 4.0](LICENCE) — 百花繚乱研究所 / RadianN_kswg
- **キャラクター「ナンバーテールズ」**: 百花繚乱研究所（著作権者: RadianN_kswg）
- **創作 DB サブモジュール** (`_creations-db/`): [100BeautiesLab_CreationsDB](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB) — CC BY-NC 4.0

> 本リポジトリのコードを利用・改変する場合は CC BY-NC 4.0 に従い、
> **非商用・クレジット表記**のうえ公開してください。
