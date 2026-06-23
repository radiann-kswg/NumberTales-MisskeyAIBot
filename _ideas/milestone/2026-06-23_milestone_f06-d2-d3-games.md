# F-06 Stage D-2a/D-2b/D-3 ゲーム実装完了

> 作成日: 2026-06-23
> ステータス: **完了** ✅（typecheck 確認済み）

---

## 概要

Secvier シリーズのトランプ絵文字・ダイス絵文字の登録完了を受けて、
F-06 Stage D の残ゲーム（ポーカー・ヨット・ヒット＆ブロウ）を一括実装した。
ターン制ゲームのセッション管理基盤（`game_sessions` テーブル）も同時に新設。

---

## D3-2a: ポーカー（5枚ドロー）

### 概要

標準 52 枚デッキ（A〜K × S/H/D/C）から 5 枚をシャッフルして引き、
役判定結果を Secvier トランプ絵文字で表示するワンショットゲーム。

### 使用絵文字

| パターン | 例 |
|---------|---|
| `sv_card_{S\|H\|D\|C}_{A\|2-10\|J\|Q\|K}` | `:sv_card_S_A:` `:sv_card_H_10:` |

### 役パターン

| 役名 | 条件 |
|-----|-----|
| ロイヤルフラッシュ！！！ | A-K-Q-J-10 同スート |
| ストレートフラッシュ！！ | 5連続・同スート |
| フォーカインド！ | 4枚同ランク |
| フルハウス！ | 3枚 + 2枚 |
| フラッシュ！ | 5枚同スート |
| ストレート！ | 5連続（A-low 対応） |
| スリーカード | 3枚同ランク |
| ツーペア | 2ペア |
| ワンペア | 1ペア |
| ハイカード | 上記以外 |

### セッション管理

不要（ワンショット）。

---

## D3-2b: ヨット（ヤッツィー系）

### 概要

5d6 を振り、役判定結果を Secvier ダイス絵文字で表示するターン制ゲーム。
最大 3 回（初回ロール + 2 回振り直し）。キープしたダイスは色が変わる演出あり。

### 使用絵文字

| 状態 | 色 | 例 |
|-----|---|---|
| 新たに振ったダイス | 白磁（hakuji） | `:sv_dice_hakuji_d6_3:` |
| キープしたダイス（前ターン保持） | 翠玉（suigyoku・緑） | `:sv_dice_suigyoku_d6_3:` |

### 役パターン

| 役名 | 条件 |
|-----|-----|
| ヤッツィー！！ | 5つ同値 |
| フォーカインド！ | 4つ同値 |
| フルハウス！ | 3+2 |
| ラージストレート！ | 5連続（1-5 または 2-6） |
| スモールストレート！ | 4連続を含む |
| スリーカード | 3つ同値 |
| チャンス | 上記以外（合計点を表示） |

### コマンド（ゲーム中）

| コマンド例 | 動作 |
|---------|------|
| 「振り直し 2 4」 | 2番・4番ダイスを振り直し（1-indexed） |
| 「1 3」 | 1番・3番ダイスを振り直し |
| 「全部」 | 全5個振り直し |
| 「このまま」「キープ」「確定」 | 現状で確定（ゲーム終了） |
| 「やめ」「終了」「キャンセル」 | ゲームを中断 |
| 2回振り直し完了時 | 自動的にゲーム終了 |

### セッション管理

- TTL: 60分
- 状態: `YachtState { dice: number[], rerollCount: number, keptIndices: number[] }`

---

## D3-3: ヒット＆ブロウ

### 概要

Bot が 4 桁（デフォルト）または 3 桁の重複なし数字を設定し、
ユーザーが予想するターン制数当てゲーム。最大 10 回。

### ゲームフロー

1. 「ヒット＆ブロウやって」→ Bot が秘密の数字を設定（`crypto.randomInt` 使用）
2. ユーザーが「1234」のように数字を送信 → Hit 数・Blow 数を返す
3. 全桁 Hit で正解・10 回で Game Over（正解を公開）
4. 「やめ」「終了」「キャンセル」で中断（正解を公開）

### 桁数指定

- デフォルト: 4桁
- 「3桁でやって」「3桁のヒット＆ブロウ」: 3桁

### セッション管理

- TTL: 60分
- 状態: `HitBlowState { secret: number[], guessCount: number, maxGuesses: number, digits: number }`

---

## 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/storage/game-session.ts` | **新規** GameSessionStore クラス（`game_sessions` テーブル・TTL 付き SQLite） |
| `src/features/f06/poker.ts` | **新規** 52枚デッキ・役判定・絵文字表示ロジック |
| `src/features/f06/yacht.ts` | **新規** 5d6・役判定・振り直し・絵文字表示・コマンド解析ロジック |
| `src/features/f06/hitblow.ts` | **新規** 秘密数列生成（crypto.randomInt）・Hit/Blow 計算・予想解析ロジック |
| `src/features/f06/index.ts` | ゲームハンドラ 8 関数を追加（handlePoker / handleYachtStart / handleYachtReroll / handleYachtKeep / handleYachtAbandon / handleHitBlowStart / handleHitBlowGuess / handleHitBlowAbandon） |
| `src/bot/classifier/intent.ts` | `Intent` 型に `game-poker` / `game-yacht` / `game-hitblow` を追加・パターン定義 |
| `src/bot/reactor/emoji-reaction-map.ts` | `game-poker` / `game-yacht` / `game-hitblow` リアクション追加 |
| `src/bot/handlers/mention.ts` | GameSessionStore deps 追加・ゲームセッションチェック（4-pre セクション）・ゲームインテント dispatch・並行ゲーム禁止チェック |
| `src/index.ts` | GameSessionStore インスタンス作成・pruneExpired 呼び出し・shutdown 時 close |

---

## 安全設計

- ランダム値生成: ゲームロジック（コード側）が担当。LLM には委ねない
- LTL 汚染防止: ゲーム返信は `home` 可視性（Bot のデフォルト設定に準拠）
- 並行ゲーム禁止: 同一ユーザーのゲームセッションは 1 つまで
- セッション TTL: 60分で自動期限切れ

---

## 動作確認結果

| 確認項目 | 結果 |
|---------|------|
| `npm run typecheck` | エラーなし ✅ |
| `game_sessions` テーブル設計 | 確認 ✅ |
| `evaluatePokerHand()` 役判定 | 確認 ✅ |
| `evaluateYacht()` 役判定 | 確認 ✅ |
| `calculateHitBlow()` H/B 計算 | 確認 ✅ |
| `parseRerollCommand()` コマンド解析 | 確認 ✅ |
| `parseGuess()` 予想解析 | 確認 ✅ |
| `game-poker` / `game-yacht` / `game-hitblow` インテント | 確認 ✅ |
| mention.ts ディスパッチ | 確認 ✅ |
| 並行ゲーム禁止ロジック | 確認 ✅ |

---

## 残タスク（次ステップ候補）

- **F-06 Stage D-4a 牌引き占い**: 麻雀牌絵文字登録後に着手可能（セッション管理不要）
- **F-06 Stage D-5 ルーレット**: 麻雀牌絵文字 + CreationsDB 連携
- **F-10 エンジェルナンバー占い**: 着手 🔧（milestone 仕様策定済み）
- **F-12 リマインダー機能**: 着手 🔧（milestone 仕様策定済み）
