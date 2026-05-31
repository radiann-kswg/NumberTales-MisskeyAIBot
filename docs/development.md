# ローカル開発ガイド — NumberTales Misskey AI Bot

> 対象: ローカル環境での開発・動作確認

---

## 前提条件

- Node.js v24 以上（`node -v` で確認）
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
DEFAULT_CHARACTER_NUM=000
ADMIN_USER_IDS=your_admin_user_id
```

マルチキャラクター機能を使う場合の追加設定:

- `DEFAULT_CHARACTER_NUM`: 個別指定のない相手に返答する標準担当キャラクター番号
- `ADMIN_USER_IDS`: 管理者コマンドを許可する Misskey ユーザー ID のカンマ区切り一覧
  - 全体デフォルト変更: `全体のデフォルトを3番機にして`
  - 自発投稿担当変更: `週の投稿担当も29にして`、`来週担当を変更して（名前）`、`自発投稿担当を2番機に切り替えて`
  - 一般ユーザーは自分専用の担当切り替えのみ可能

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
      mention.ts               # メンション受信ハンドラ（切り替え / F-06 / 雑談）
      timeline.ts              # homeTimeline リアクションハンドラ
      follow.ts                # フォローバックハンドラ（followed イベント受信 → 自動フォロー）
    character/
      loader.ts                # 公開済みキャラクターDBの読み込み
      prompt-builder.ts        # キャラクタープロンプト動的生成
      store.ts                 # アクティブキャラクター状態ストア（SQLite永続化）
      switch.ts                # 切り替え解決・ヘルプ文・フォーム文面生成
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
      weekly-poll.ts           # WeeklyPollScheduler（週次 Poll 担当選出）
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
    bot-state.ts               # BotStateStore（bot_state テーブル）
  utils/
    logger.ts                  # ロガー（enableFileOutput でファイル出力有効化）
    incident-logger.ts         # IncidentLogger（ハラスメント検知ファイルログ）
```

### 重要な型定義

```typescript
// src/bot/classifier/intent.ts
export type Intent =
  | 'greeting'
  | 'form-switch'
  | 'creative-consultation'
  | 'chat'
  | 'calculate'
  | 'numerology'
  | 'dice'
  | 'trivia' // F-06
  | 'harassment'; // F-07

export interface ClassificationResult {
  intent: Intent;
  formTarget?: 'core-folder' | 'humanoid'; // form-switch のときのみ
  numerologyType?: 'life-path' | 'kyusei'; // numerology のときのみ
  harassmentLevel?: 1 | 2 | 3; // harassment のときのみ
}

// classifyIntent の返り値は ClassificationResult（文字列ではない）
// 呼び出し側でデストラクチャリングすること
const { intent, formTarget, numerologyType, harassmentLevel } = classifyIntent(text);
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

### スケジューラー担当切り替えコマンドのテスト

```bash
node --input-type=module --eval "
import { resolveSchedulerCharTarget } from './dist/bot/character/switch.js';
console.log(resolveSchedulerCharTarget('週の投稿担当も29にして'));  // 29(ニトク)
console.log(resolveSchedulerCharTarget('自発投稿担当を2番機に切り替えて'));  // 2(ツグ)
console.log(resolveSchedulerCharTarget('1番機と話したい'));  // null
"
```

### 絵文字補完のテスト

```bash
node --input-type=module --eval "
import { resolveCoreFolderEmoji, setEmojiCache } from './dist/bot/responder/emoji.js';
// キャッシュなし（フォールバック動作確認）
console.log(resolveCoreFolderEmoji('2'));  // aphrnts2_corefolder
// エイリアス補完のモック
console.log('エイリアス補完テストは .cache/smoke-test.mjs を参照');
"
```

### マルチキャラクター切り替えのテスト

```bash
node --input-type=module << 'EOF'
import { resolveCharacterSwitchTarget, isCharacterSwitchResetRequest } from './dist/bot/character/switch.js';
console.log(resolveCharacterSwitchTarget('1番機と話したい'));
console.log(resolveCharacterSwitchTarget('ハジメちゃんをコアフォルダにして'));
console.log(isCharacterSwitchResetRequest('担当を標準に戻して'));
EOF
```

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

### ハラスメント検知のテスト（F-07）

```bash
node --input-type=module << 'EOF'
import { detectHarassmentLevel } from './dist/bot/classifier/intent.js';
console.log(detectHarassmentLevel('死ね'));         // 3
console.log(detectHarassmentLevel('裸になれ'));     // 2
console.log(detectHarassmentLevel('黙れ'));         // 1
console.log(detectHarassmentLevel('おはよう'));     // null
EOF
```

---

## ログファイルの確認

Bit起動後は `.cache/` 配下に 2 種類のログファイルが生成される。

```bash
# インシデントログ（ハラスメント検知）
tail -n 20 .cache/incident.log
grep '"level":3' .cache/incident.log      # L3 のみ

# エラーログ
tail -n 20 .cache/error.log
grep '"level":"error"' .cache/error.log   # error のみ
```

ログファイルの出力先は環境変数で変更できる（`INCIDENT_LOG_PATH` / `ERROR_LOG_PATH`）。

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
