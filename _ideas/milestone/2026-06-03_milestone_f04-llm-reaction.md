# F-04 改修 — リアクション感情分類の LLM 駆動化

> 作成日: 2026-06-03
> ステータス: **未着手** ⏳

---

## 概要

F-04 のリアクション判定（`src/bot/reactor/classify.ts`）は現状ルールベース（正規表現）で実装されており、
文脈・ニュアンスを考慮できないため誤反応が発生している。
LLM によるカテゴリ分類に切り替えることで判定精度を向上させる。

## 発生した問題（背景）

- 対象投稿: 「描きたいものの解像度や知見がどれも低すぎて創作者として打ちのめされてる」
- Bot の誤反応: `:omoshiroi_i_aphrnts65:`（おもしろい！）
- 原因: テキスト中の「知見」が `interesting` カテゴリの正規表現 `/知見/` にマッチし、
  否定的な文脈（「打ちのめされてる」）を無視してしまった

## 改修方針

挨拶系（おはよう・おやすみ・ただいまなど）は従来どおり正規表現で先行判定し、
それ以外の感情カテゴリのみ LLM に渡す **ハイブリッド方式** を採用する。

```
現状: cleanText() → 正規表現マッチ → ReactionCategory | null
改修: cleanText() → 挨拶正規表現（先行） → マッチなし → LLM分類 → ReactionCategory | 'skip'
```

LLM への入力は `cleanText()` 済みの短文（50 文字以内フィルター後）、
出力は決められたカテゴリ名の 1 単語のみに制約する（コスト最小化）。

## タスク詳細

### M-D1-1: 挨拶系先行判定を関数として分離

- `classify.ts` の挨拶正規表現ブロックを `classifyGreeting(text): ReactionCategory | null` として切り出す
- 挨拶判定ヒット時はそのまま返し、LLM を呼ばない

### M-D1-2: LLM 感情分類プロンプトの設計

- 入力: `cleanText()` 済みの投稿テキスト（50 字以内）
- 出力制約: 以下の 1 単語のみを返すよう指示する
  - `achievement` / `tired` / `agree` / `interesting` / `cute` / `cheer` / `sympathy` / `skip`
- `skip` の定義: 否定文脈・怒り・悩み・感情が複雑または読み取れない投稿
- システムプロンプトはキャラクター非依存（感情分類特化）とし、コンテキスト外のLLM使用

### M-D1-3: `sympathy` カテゴリの追加

- `emoji-reaction-map.ts` に `sympathy` カテゴリを追加
- 対応絵文字候補: `murisinaide_aphrnts20`（無理しないで）など
- `classifyNoteEmotion()` の戻り値型 `ReactionCategory` に `sympathy` を追加

### M-D1-4: `classify.ts` のリファクタリング

- `classifyGreeting(text)` → 挨拶先行判定（同期・正規表現）
- `classifyEmotionByLLM(text, ai)` → LLM 分類（非同期・AI インスタンスを DI で受け取る）
- `classifyNoteEmotion(note, ai)` → 上記 2 関数を統合するオーケストレーター（async 化）

### M-D1-5: `timeline.ts` ハンドラ側の更新

- `classifyNoteEmotion()` が `async` になるため、呼び出し側を `await` に変更
- LLM 呼び出し失敗時のフォールバック: エラーログを残したうえで `null`（スキップ）を返す

### M-D1-6: 動作確認

- 「描きたいものの解像度や知見がどれも低すぎて打ちのめされてる」系の投稿で `skip` になることを確認
- おはよう・完成報告・お疲れ系は従来どおりリアクションが送られることを確認
- LLM 呼び出し失敗時にクラッシュしないことを確認

## 依存関係

- `src/ai/` の AIProvider 抽象レイヤー（DI でハンドラに渡す形式は既存実装に準じる）
- D2（グローバルTL タグ検出）も `classifyNoteEmotion()` を流用するため、本タスク完了後に着手すること

## 注意事項

- LLM コストは微小（50 字以内テキスト 1 件 = 数トークン）だが、TL 流量によってはリクエスト数が増える
  → `shouldSkipReaction()` によるフィルタリングを必ず先行させ、LLM を呼ぶ件数を最小化する
- `classifyNoteEmotion()` が async 化されることで、F-04 全体の呼び出しフローが変わる
  → `timeline.ts` 以外に `classifyNoteEmotion()` を呼んでいる箇所がある場合も一括更新すること
