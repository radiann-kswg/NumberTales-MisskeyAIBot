# F-06 Stage D3-4a/D3-4b: 牌引き占い・手役クイズ — 実装仕様

> 作成日: 2026-07-09
> ステータス: 完了 ✅（実装確認日: 2026-07-09・`npm run typecheck`/`npm run lint` 通過・QuizPatternデータ24件を`evaluateHand()`で機械検証・意図分類/パーサ回帰確認済み）
> 元アイデア: [future-plan/F-06_stage-d-minigames.md](../../future-plan/F-06_stage-d-minigames.md) — D3-4a/D3-4bセクション（2026-07-08 設計確定済み・仕様は変更せずそのまま実装）
> 実装方針: ユーザー了承により D3-4a/D3-4b を1つの milestone として一括実装する

---

## 概要

D3-2c「麻雀配牌チャレンジ」（14枚配って役を判定する**ゲーム**）から派生する2つの追加ミニゲーム。

- **D3-4a 牌引き占い**: 1〜3枚だけ引いて意味を読み解く**占い**。役判定ロジックは持たず、F-10（エンジェル
  ナンバー占い）と同系統の「ランダム抽選＋LLM解釈コメント」構成。
- **D3-4b 手役クイズ**: 固定データの14枚手牌を見て「これは何の役でしょう？」を4択で当てる**クイズ**。

両者とも既存の `mahjong.ts`（Tile型・牌絵文字・`handEmojiBlock()`）を流用するが、D3-2cの役判定
ゲームとは目的・UXが異なるため独立した機能として実装する。関連ドメインが近く、共通基盤（`GameSessionStore`・
`classifyIntent()`・`mention.ts`のディスパッチパターン・CW「めくり」演出）を共有するため、1つの milestone
としてまとめて実装する。

---

## D3-4a: 牌引き占い

### 仕様概要

| 項目 | 内容 |
| --- | --- |
| インテント | `game-tile-fortune` |
| トリガー例 | 「牌占い」「牌を引いて」「牌引き占い」「占い牌」「/tilefortune」 |
| 枚数指定 | 「N枚引いて」でN=1〜3枚（範囲外・無指定は既定1枚にフォールバック） |
| 抽選ロジック | 34種の牌タイプ（各1枚。136枚デッキとは別）から重複なしで一様ランダム抽出 |
| セッション | なし（ワンショット）。`RecentGameType`（D3-7「もう一回」対象）には `tile-fortune` として追加 |
| 出力形式 | CW（ラベル「牌引き占い」／CW内: 牌絵文字＋引いたカテゴリ＋LLM占いコメント） |

### D3-2c配牌チャレンジとの差別化

| 観点 | D3-2c 配牌チャレンジ | D3-4a 牌引き占い |
| --- | --- | --- |
| 位置づけ | ゲーム（役を競う） | 占い（意味を読む） |
| 引く枚数 | 14枚（配牌） | 1〜3枚（指定可・既定1枚） |
| 判定 | `evaluateHand()` による役判定（機械的） | なし。牌種の意味をテーマにLLMが解釈コメント生成 |
| 出力 | 手牌全体＋役名 | 引いた牌＋占いコメント |
| 繰り返し制限 | なし | なし |

### 占いテーマ（コード側で固定定義。LLMには渡すが生成させない）

| 牌種 | テーマ |
| --- | --- |
| 萬子（man） | 力・意志 |
| 筒子（pin） | 縁・調和 |
| 索子（sou） | 成長・試練 |
| 風牌（char のうち east/south/west/north） | 方向性 |
| 三元牌（char のうち haku/hatsu/chun） | 純粋さ |

### LLM演出

`buildCharacterSystemPrompt()` でアクティブキャラのシステムプロンプトを組み、引いた牌の種別＋対応テーマを
渡して短い占いコメントを生成させる（trivia・numerology-consultationと同じ「テーマはコード側で固定・文面は
LLMに委ねる」設計。新規の創作設定・台詞の自動生成には当たらない）。LLM呼び出し失敗時はフォールバック文言を
CW内に埋め込んで続行する（Bot全体を落とさない）。

### 出力例

```
本文: 牌を引いてみるね……
CW ラベル: 「牌引き占い」
CW 内: :sv_mj_man_5::sv_mj_sou_3:
       ✦ 萬子・索子を引いたよ
       {LLM生成コメント}
```

---

## D3-4b: 手役クイズ

### 仕様概要

| 項目 | 内容 |
| --- | --- |
| インテント | `game-mahjong-quiz` |
| トリガー例 | 「手役クイズ」「役当てクイズ」「麻雀クイズ」「/mjquiz」 |
| **判定順序の注意** | 既存 `MAHJONG_PATTERNS` は緩い正規表現（末尾接尾辞が丸ごとoptional）で「麻雀」という部分文字列に一致するため、`MAHJONG_QUIZ_PATTERNS` は `MAHJONG_PATTERNS` より**先に**判定する |
| セッション | あり（`GameType: 'mahjong-quiz'`。1問1回答で即削除） |
| 並行ゲーム禁止 | 対象（`getAnyActiveSession()` + busy-text の `gameNames` マップ） |
| 継続コマンド | `RecentGameType` に `mahjong-quiz` を追加、D3-7「もう一回」対象 |
| 和了判定ロジック | 使わない（固定データのため不要。ただしデータ作成時の検証には `evaluateHand()` を使う） |

### 出題データ

新規ファイル `src/features/f06/mahjong-quiz.ts` に20〜30パターンを固定データとして定義する。

```typescript
export interface QuizPattern {
  tiles: Tile[];       // mahjong.ts の Tile 型を再利用（14枚）
  yaku: string;        // 正解の役名
  note?: string;       // 正解発表時の一言解説（任意）
}
```

役名は標準的な麻雀用語（ナンバーテールズ固有の創作設定ではない）。出題は「静的な14枚の手牌の見た目から
判定できる役」に絞り、立直・自摸などの状況依存の役は対象外。

**役セットの実装上の絞り込み**: future-planの例示役名（タンヤオ・チャンタ・ホンイツ・チンイツ・
トイトイ・イーペーコー等）のうち、現行 `mahjong.ts` の `evaluateHand()` が実際に判定・返却できるのは
国士無双／七対子／清一色／混一色（ホンイツ）／対々和（トイトイ）／平和／タンヤオ／役牌(白・発・中) のみ。
チャンタ・イーペーコーは未実装のため出題に含めると機械検証ができない。標準用語の範囲内でデータ作成して
よいと確認済みのため、対応済みの役セットに絞ってデータを作成する（仕様変更にはあたらない）。

### ゲームフロー

1. `QUIZ_PATTERNS` からランダムに1問選択。
2. 正解1つ＋ダミー3つ（他パターンの `yaku` からランダム抽出、正解と重複除外）をシャッフルして4択
   （①②③④）を作る。
3. `GameSessionStore` に `{ quizIndex, correctChoiceIndex, choices }` を保存。
4. 本文に手牌絵文字（`handEmojiBlock()` 流用）＋4択を表示（正解を知らない段階なのでCW不要、そのまま
   公開）。
5. ユーザーが番号（半角/全角/丸数字、既存 `matchCircledDigit`/`toHalfWidthDigits` 流用）で回答。文中に
   紛れた無関係な数字を誤って回答と解釈しないよう、丸数字／「N番」／単独の1〜4のみを受理する
   （`mahjong.ts` の `parseDiscardCommand()` と同じ設計方針）。
6. 正誤判定 → 正解発表はD3-5/D3-4aと同じCW「めくり」演出（正解役名＋`note`）。誤答時も同じ形で正解を
   開示して終了（複数ターンの再挑戦は無し。1問1回答で完結し、セッションは即削除）。

---

## 実装ファイル一覧

| ファイル | 変更内容 |
| --- | --- |
| `src/features/f06/mahjong.ts` | `drawTileTypes(count)` 追加（34種牌タイプから重複なし抽選、D3-4a専用） |
| `src/features/f06/responder.ts` | D3-4a用CWラベル・見出し・占いテーマ表・LLMユーザープロンプト生成・エラー文言・CW本文組み立て関数を追加 |
| `src/features/f06/index.ts` | `handleTileFortune()`（D3-4a、抽選のみ）、`handleMahjongQuizStart/Answer/Abandon()`（D3-4b）を追加 |
| `src/features/f06/mahjong-quiz.ts` | **新規**。`QuizPattern`型・`QUIZ_PATTERNS`データ・出題/採点/回答パースロジック・CW本文組み立て |
| `src/bot/classifier/intent.ts` | `Intent`型に`'game-tile-fortune'`・`'game-mahjong-quiz'`追加。`TILE_FORTUNE_PATTERNS`・`MAHJONG_QUIZ_PATTERNS`追加（判定順序に注意） |
| `src/storage/game-session.ts` | `GameType`に`'mahjong-quiz'`、`RecentGameType`に`'mahjong-quiz'`・`'tile-fortune'`追加 |
| `src/bot/handlers/mention.ts` | import・`TRUST_BONUS_INTENTS`・`generateF06Framing`のtypeLabel・アクティブセッション処理（手役クイズ回答）・4a.ディスパッチブロック（ゲート条件・並行禁止・LLM分岐/開始処理）を追加 |
| `src/bot/reactor/emoji-reaction-map.ts` | `game-tile-fortune`・`game-mahjong-quiz`のリアクション絵文字セット追加（既存登録済み絵文字を再利用、新規登録不要） |

---

## QuizPatternデータ作成・検証方針

1. `mahjong-quiz.ts` に14枚ぴったりの手牌データを手作業で20〜30件作成する。同じ手牌が意図せず複数の役を
   満たさないよう配慮する（例: タンヤオ用の手には刻子を混ぜて平和が同時成立しないようにする）。
2. ビルド後、一時検証スクリプト（コミットしない）で `QUIZ_PATTERNS` 全件を `evaluateHand()` に通し、
   (a) ちょうど14枚か (b) `agari === true` か (c) 期待する `yaku` 名が結果に含まれるか (d) 複合役に
   なっていないか、を機械的に確認する。
3. 全件パスするまで手牌を調整する。`note` 文言の校正のみ目視で行う。

---

## 動作確認チェックリスト

### 静的検証
- [x] `npm run typecheck` エラーなし
- [x] `npm run lint` エラーなし（既存の指摘事項のみ・新規エラーなし）
- [x] QuizPatternデータ24件の一時検証スクリプトが全件パス（複合役の混入なし）

### 意図分類の回帰確認（一時スクリプトで`classifyIntent()`を直接検証）
- [x] 「牌占いして」「牌を3枚引いて」「牌引き占い」「占い牌お願い」→ `game-tile-fortune`
  （実装時に「牌を3枚引いて」が`chat`に誤分類されるバグを発見・`TILE_FORTUNE_PATTERNS`を修正して解消）
- [x] 「手役クイズやりたい」「役当てクイズ」「麻雀クイズ」→ `game-mahjong-quiz`（**「麻雀クイズ」が`game-mahjong`に誤分類されないことを確認済み**）
- [x] 「麻雀しよう」「配牌チャレンジ」「まーじゃん」→ `game-mahjong`（既存挙動の回帰確認）
- [x] スロット・ポーカー・ヨット・ヒット＆ブロウ・ルーレット・「もう一回」の既存分類も回帰確認

### D3-4a 検証（`handleTileFortune`・`tileFortuneCwBody`を直接呼び出して確認。LLM実呼び出し・Misskey実投稿は未実施）
- [x] 枚数無指定 → 1枚抽選
- [x] 「3枚引いて」→ 指定枚数（重複なしを確認）
- [x] 「5枚引いて」（範囲外）→ 1枚にフォールバック
- [x] 萬子・筒子・索子のカテゴリラベル・テーマ出力を確認（風牌・三元牌は`mahjong.ts`の字牌データ経由で同一ロジック、コードレビューで確認）
- [ ] LLM呼び出し失敗時のフォールバック・「もう一回」実地動作・会話ボーナス加算は、Misskey本番/検証インスタンスへの実メンションでの確認が必要（今回は未実施）

### D3-4b 検証（`pickQuizQuestion`・`quizQuestionText`・`quizAnswerCwBody`・`parseQuizAnswer`を直接200回試行で確認）
- [x] 出題時、手牌14枚＋①②③④の4択（重複なし・正解位置整合）が生成される
- [x] 丸数字・全角数字・半角数字・「N番」いずれの回答形式でも正誤判定される
- [x] 無関係な数字を含む発言・範囲外の数字では回答と誤解釈されない（null判定）
- [x] 正解・不正解いずれもCW本文に正解役名＋noteが正しく表示される
- [ ] 並行ゲーム禁止の誘導文・「もう一回」実地動作・会話ボーナス加算・「やめ」中断は、Misskey本番/検証インスタンスへの実メンションでの確認が必要（今回は未実施。配線はD3-2c/D3-5と同一パターンをコードレビューで確認済み）

### 回帰確認
- [ ] 既存6ゲーム（スロット・ポーカー・ヨット・ヒット＆ブロウ・麻雀配牌チャレンジ・ルーレット）の意図分類・並行ゲーム禁止・継続コマンドが壊れていないこと

---

## 補足: 設計上の注意点

1. `evaluateHand()` はチャンタ・イーペーコー未対応のため、出題役セットは対応済み8種（国士無双／七対子／
   清一色／混一色／対々和／平和／タンヤオ／役牌）に絞る。
2. 複合役混入リスク（1つの手牌が意図せず複数役を満たす）→ ダミー選択肢と衝突しないよう手牌設計で回避。
3. `game-tile-fortune` は `generateF06Framing()` を経由しない（trivia同様、独自LLM演出のため一言の
   二重付与を防ぐ）。
4. `handleMahjongQuizAbandon` はfuture-planに明記はないが、他セッション系ゲームのabandon UX（現在状態を
   開示して終了）との一貫性のための追加。

## 残タスク

- Misskey本番/検証インスタンスへの実メンションによる最終確認（LLM呼び出し・「もう一回」・並行ゲーム禁止の
  誘導文・会話ボーナス加算の実地動作）。静的検証・データ検証・単体でのロジック確認は本milestoneで完了済み。
