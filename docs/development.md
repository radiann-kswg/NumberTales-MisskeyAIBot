# ローカル開発ガイド — NumberTales Misskey AI Bot

> 対象: ローカル環境での開発・動作確認

---

## 前提条件

- Node.js v22 以上（`node -v` で確認）
- Git（サブモジュール対応）
- Misskey インスタンスのアカウントと API トークン
- OpenAI または Gemini の API キー

---

## 初回セットアップ

```bash
# 1. クローン（サブモジュール込み）
git clone --recurse-submodules https://github.com/radiann-kswg/NumberTales-MisskeyAIBot.git
cd NumberTales-MisskeyAIBot

# サブモジュールを後から初期化する場合
git submodule update --init --recursive

# 2. 依存パッケージのインストール
npm install

# 3. 環境変数ファイルの作成
cp .env.example .env
```

`.env` を編集して最低限以下を設定する:

```env
MISSKEY_HOST=https://your-instance.example.com
MISSKEY_TOKEN=your_api_token_here
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
NODE_ENV=development
LOG_LEVEL=debug
```

---

## ビルドと起動

```bash
# TypeScript をコンパイル（dist/ に出力）
npm run build

# Bot を起動
npm start

# 型チェックのみ（ビルドなし）
npm run typecheck

# Lint
npm run lint
npm run lint:fix
```

---

## 開発時の注意事項

### `.env` ファイルの取り扱い

- `.env` は `.gitignore` に含まれており、リポジトリには含まれない
- **ターミナルで `.env` の内容を確認する際は必ず `-E` フラグ付きで `grep` を使用すること**

```bash
# ✅ 正しい（API キー・トークンを除外して表示）
grep -vE "TOKEN|KEY|SECRET" .env

# ❌ 間違い（-E なしでは | がリテラル文字として扱われ全行が通過する）
grep -v "TOKEN|KEY" .env
```

### ソースツリーの構造

```
src/
  index.ts                     # エントリポイント（起動・接続・シャットダウン）
  ai/
    index.ts                   # AIProvider 抽象レイヤー
    openai.ts                  # OpenAI 実装
    gemini.ts                  # Gemini 実装
  bot/
    classifier/
      intent.ts                # メンション意図分類（返り値: ClassificationResult）
    handlers/
      mention.ts               # メンション受信ハンドラ（4 分岐）
      timeline.ts              # homeTimeline リアクションハンドラ
    ratelimit/
      index.ts                 # RateLimiter クラス
    reactor/
      classify.ts              # TL ノートフィルタリング・感情分類
      emoji-reaction-map.ts    # 感情カテゴリ → 絵文字名マッピング
    responder/
      emoji.ts                 # 発言書式 formatSpeech()
      templates/
        greeting.ts            # 挨拶定型返答テンプレート
        emoji-map.ts           # EMOJI_POOL 定義
    scheduler/
      index.ts                 # PostScheduler（時間帯別自発投稿）
  features/
    f06/
      calculator.ts            # mathjs ラッパー（safeEvaluate）
      numerology.ts            # ライフパスナンバー・九星気学・タロット計算
      responder.ts             # F-06 応答テンプレート + LLM プロンプト定数
      index.ts                 # ディスパッチャー（4 ハンドラ + extractTriviaNumber）
  config/
    constants.ts               # BOT_CONSTANTS 定数
    env.ts                     # 環境変数の読み込みと検証
  misskey/
    client.ts                  # MisskeyClient WebSocket ラッパー
  storage/
    session.ts                 # SessionStore（better-sqlite3）
  utils/
    logger.ts                  # ロガー
```

### 重要な型定義

```typescript
// src/bot/classifier/intent.ts
export type Intent =
  | 'greeting' | 'form-switch' | 'creative-consultation' | 'chat'
  | 'calculate' | 'numerology' | 'dice' | 'trivia';  // F-06

export interface ClassificationResult {
  intent: Intent;
  formTarget?: 'core-folder' | 'humanoid';   // form-switch のときのみ
  numerologyType?: 'life-path' | 'kyusei';   // numerology のときのみ
}

// classifyIntent の返り値は ClassificationResult（文字列ではない）
// 呼び出し側でデストラクチャリングすること
const { intent, formTarget, numerologyType } = classifyIntent(text);
```

### 新しい絵文字を追加する際

インスタンスの絵文字一覧は Misskey API から取得できる:

```powershell
# PowerShell でカテゴリ別に確認
Invoke-RestMethod -Uri "https://radiann6631.net/api/emojis" -Method Post `
  -ContentType "application/json" -Body "{}" `
  | Select-Object -ExpandProperty emojis `
  | Where-Object { $_.category -like "*10*" } `
  | Select-Object name, aliases
```

---

## 動作確認のポイント

### メンション意図分類のテスト

`src/bot/classifier/intent.ts` の `classifyIntent()` は純粋関数なので、
Node.js の REPL で単独テスト可能:

```bash
node --input-type=module << 'EOF'
import { classifyIntent } from './dist/bot/classifier/intent.js';
console.log(classifyIntent('おはよう！'));
console.log(classifyIntent('お題をください'));
console.log(classifyIntent('コアフォルダになって'));
EOF
```

### TL リアクション分類のテスト

```bash
node --input-type=module << 'EOF'
import { shouldSkipReaction, classifyNoteEmotion } from './dist/bot/reactor/classify.js';
const note = { text: '絵が完成した！', files: [], userId: 'test' };
console.log(shouldSkipReaction(note));   // false
console.log(classifyNoteEmotion(note));  // 'achievement'
EOF
```

---

## よくある問題

### `npm run build` でエラーが出る

```bash
npm run typecheck
```

で型エラーの詳細を確認する。`classifyIntent` の返り値型変更など、
**呼び出し側のすべてのファイルを同時に更新すること**。

### Bot が起動するがメンションに応答しない

1. `.env` の `RATE_LIMIT_REPLY_COOLDOWN_MS` が大きな値になっていないか確認
2. `LOG_LEVEL=debug` にしてログを確認
3. `MISSKEY_TOKEN` が有効か確認（インスタンスの管理画面で再発行できる）

### PM2 で管理している場合の確認方法

```bash
pm2 logs numbertales-bot --lines 50
pm2 list
```
