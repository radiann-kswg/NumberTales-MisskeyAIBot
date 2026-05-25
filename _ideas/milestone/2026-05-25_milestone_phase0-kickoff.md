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

- [x] Node.js バージョン確認 → **v24.11.0**（npm 11.6.1）
- [x] TypeScript + tsconfig 初期設定 → `tsconfig.json` 作成（target: ES2022, module: Node16）
- [x] ESLint / Prettier 設定 → `.eslintrc.json` / `.prettierrc.json` 作成・動作確認済み
- [x] パッケージインストール完了（脆弱性 0 件）
  - `misskey-js` / `openai` / `@google/generative-ai` / `mathjs@^15.2.0` / `dotenv`
  - `better-sqlite3` は Node.js v24 組み込みの `node:sqlite` に置き換え
- [ ] `misskey-js` 疎通確認（APIトークン取得後に実施）
- [ ] OpenAI SDK 疎通確認（APIキー取得後に実施）
- [ ] Google Generative AI SDK 疎通確認（APIキー取得後に実施）

#### 備考

- `better-sqlite3` はネイティブビルドが必要でビルド失敗 → Node.js v24 組み込みの `node:sqlite` を採用（外部依存なし）
- ESLint v8 + TypeScript 5.9.x の非公式サポート警告が出るが動作に支障なし（将来 ESLint v9 移行を検討）

### 0-3: 初期アーキテクチャ確認

- [x] AI APIの抽象レイヤー（AIProviderインターフェース）の設計 → `src/ai/`
- [x] Bot全体のエントリポイント設計（`src/index.ts`）→ 初期化フロー実装
- [x] イベントハンドラの責務分割設計 → `src/bot/handlers/` 3本作成

#### 作成ファイル一覧（0-3）

| ファイル | 内容 |
|---------|------|
| `src/config/env.ts` | 環境変数の読み込み・バリデーション |
| `src/config/constants.ts` | Bot定数（文字数・トリガーキーワード等）|
| `src/utils/logger.ts` | シンプルなロガー（console ラッパー）|
| `src/ai/provider.ts` | `AIProvider` インターフェース定義 |
| `src/ai/openai.ts` | OpenAI GPT-4o-mini 実装 |
| `src/ai/gemini.ts` | Gemini 1.5 Flash 実装 |
| `src/ai/index.ts` | `createAIProvider` ファクトリ（openai/gemini 切り替え）|
| `src/bot/handlers/mention.ts` | メンションハンドラ（Phase 1 実装予定）|
| `src/bot/handlers/timeline.ts` | TL観測ハンドラ（Phase 2 実装予定）|
| `src/bot/handlers/scheduler.ts` | 自発投稿スケジューラー（Phase 2 実装予定）|
| `src/index.ts` | エントリポイント（初期化フロー）|

`tsc --noEmit` による型チェック: **エラー 0 件** ✅

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
