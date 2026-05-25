# Phase 0 キックオフ — 技術スタック確定・環境準備

> 作成日: 2026-05-25
> ステータス: 進行中

---

## 概要

要件定義フェーズの完了を受けて、実装フェーズへ移行する。
Phase 0 では技術スタックの最終確定と開発環境のセットアップを行う。

---

## 技術スタック（確定）

| レイヤー             | 採用技術                        | 決定理由                                                                     |
| -------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| 実行ランタイム       | **Node.js (TypeScript)**        | Misskey.js等APIライブラリの充実度・OpenAI SDKとの統合しやすさ                |
| Misskey連携          | **misskey.js**                  | WebSocket購読・ノート投稿等を統合したライブラリ                              |
| AI API（プライマリ） | **OpenAI GPT-4o-mini**          | 日本語精度・キャラクター維持・コスト効率のバランスが最良                     |
| AI API（セカンダリ） | **Google Gemini 1.5 Flash**     | 差し替え可能な抽象レイヤー経由で維持。コスト優先・大コンテキスト時に切り替え |
| 軽量分類             | ルールベース（正規表現 + 辞書） | 意図分類・感情カテゴリ判定。APIコスト削減                                    |
| 一時ストレージ       | SQLite / メモリキャッシュ       | セッションコンテキストの一時保持（TTL付き）                                  |
| 数式パーサ           | mathjs（未確定）                | F-06 計算コマンド用。eval()禁止のため必須                                    |

---

## Phase 0 タスクリスト

### 0-1: リポジトリ構成設計 ✅

- [x] `src/` 以下のディレクトリ構成を設計・作成する
- [x] `docs/` 以下に技術ドキュメントの配置方針を決める
- [x] `.env.example` の項目を整理する（APIキー・インスタンスURL等）
- [x] `package.json` の初期構成・依存パッケージを確定する

#### src/ ディレクトリ構成（確定）

```
src/
  index.ts                      # エントリポイント
  bot/
    handlers/                   # イベントハンドラ（メンション・TL観測・タイマー）
    classifier/                 # 意図分類エンジン（ルールベース）
    responder/
      templates/                # 定型返答辞書
    ratelimit/                  # 投稿制御・レートリミッタ
    scheduler/                  # タイマー・自発投稿制御（F-02）
  ai/                           # AIプロバイダー抽象レイヤー（OpenAI / Gemini）
  misskey/                      # Misskey WebSocket接続・APIクライアント
  characters/                   # db_Primary.json読み込み・プロンプト動的生成
  features/
    numerology/                 # F-06: 数字・ヌメロジーコマンド
    creative/                   # F-03: 創作支援（壁打ちモード）
    reaction/                   # F-04: リアクション・エモパシー
    observation/                # F-05: TL観測レポート
  storage/                      # セッションコンテキスト一時ストレージ（SQLite）
  config/                       # 環境変数読み込み・定数定義
  utils/                        # ロギング・サニタイズ等ユーティリティ
```

#### docs/ 配置方針（確定）

```
docs/
  setup.md          # 開発環境セットアップガイド（0-2完了後に作成）
  deployment.md     # デプロイガイド（Phase 1完了後に作成）
  architecture.md   # アーキテクチャ解説（必要に応じて）
```

### 0-2: 開発環境セットアップ

- [ ] Node.js バージョン確認（LTS推奨）
- [ ] TypeScript + tsconfig 初期設定
- [ ] ESLint / Prettier 設定（コードスタイル統一）
- [ ] `misskey.js` パッケージのインストール・疎通確認
- [ ] OpenAI SDK (`openai`) のインストール・疎通確認（APIキーは環境変数で管理）
- [ ] Google Generative AI SDK (`@google/generative-ai`) のインストール

### 0-3: 初期アーキテクチャ確認

- [ ] AI APIの抽象レイヤー（AIProviderインターフェース）の設計
- [ ] Bot全体のエントリポイント設計（`src/index.ts`）
- [ ] イベントハンドラの責務分割設計

---

## 参照ドキュメント

- [技術アーキテクチャ案](../bot-spec/03_tech-architecture.md)
- [機能仕様案](../bot-spec/01_feature-specs.md)
- [インタラクション設計](../bot-spec/02_interaction-design.md)

---

## メモ

- `eval()` を使う数式評価は禁止。数式パーサライブラリ（`mathjs` 等）を経由すること
- APIキー・トークンの類は `.env` ファイルで管理し、コミット対象外とする
- プロンプトインジェクション対策として、ユーザー入力をシステムプロンプトに直接展開しないこと
