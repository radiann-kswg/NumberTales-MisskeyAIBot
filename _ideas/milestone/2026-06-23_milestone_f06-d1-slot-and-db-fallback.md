# F-06 Stage D-1（数字スロット）& CreationsDB HTTP フォールバック 実装完了

> 作成日: 2026-06-23
> ステータス: **完了** ✅（typecheck 確認済み）

---

## 概要

Secvier 系カスタム絵文字（数字・トランプ・ダイス）の Misskey インスタンスへの登録完了を受けて、
長期保留中だった **F-06 Stage D-1: 数字スロット** の実装に着手・完了した。

あわせて CreationsDB 参照の信頼性向上のため、
**アイディアP（Cloudflare API HTTP フォールバック）** を `loader.ts` に追加した。

---

## F-06 Stage D-1: 数字スロット

### 概要

「スロット回して」等のメンションで 0〜9 の 3 桁を抽選し、
役判定結果を Secvier 系カスタム絵文字で表示するミニゲーム。
LLM フレーミング（既存 `generateF06Framing()` 流用）でキャラクターの個性を添える。

### 使用絵文字（Secvier 数字シリーズ）

| 数字 | 絵文字名 | 色 |
|-----|---------|---|
| 0 | `sv_suigyoku_0` | 緑 |
| 1 | `sv_sakin_1` | 黄 |
| 2 | `sv_hakuji_2` | 白 |
| 3 | `sv_kougyoku_3` | 赤 |
| 4 | `sv_seiyuu_4` | 青 |
| 5 | `sv_suigyoku_5` | 緑 |
| 6 | `sv_hakuji_6` | 白 |
| 7 | `sv_kougyoku_7` | 赤 |
| 8 | `sv_sakin_8` | 黄 |
| 9 | `sv_seiyuu_9` | 青 |

### 役パターン

| 役名 | 条件 |
|-----|-----|
| ナンバーテールズ！！ ゾロ目大当たり！ | 3桁すべて同じ |
| リーチ！ | 2桁が同じ |
| 昇順！ | 連番昇順（例: 1-2-3） |
| 降順！ | 連番降順（例: 9-8-7） |
| バラバラ…… | 上記以外 |

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/bot/classifier/intent.ts` | `Intent` 型に `'game-slot'` を追加・`SLOT_PATTERNS` 定義・`classifyIntent()` への組み込み |
| `src/features/f06/responder.ts` | `SlotRole` 型・`SLOT_DIGIT_EMOJIS` マップ・`slotResultText()` を追加 |
| `src/features/f06/index.ts` | `handleSlot()` と `determineSlotRole()` を追加 |
| `src/bot/reactor/emoji-reaction-map.ts` | `'game-slot'` リアクション追加（`yattaze` / `omoshiroi`） |
| `src/bot/handlers/mention.ts` | F-06 ブロックへの `game-slot` ディスパッチ・framing ラベル追加・`handleSlot` import |

### トリガーパターン

```
「スロット回して」「スロットしよう」「スロットやって」「スロットして」
「スロット」（単体）
/slot
```

---

## アイディアP: Cloudflare API HTTP フォールバック

### 概要

`src/bot/character/loader.ts` の `initializeCharacterDB()` にフォールバックチェーンを追加。
サブモジュール物理参照が失敗した場合でも Cloudflare Workers API から自動的にキャラクター DB を取得できるようにした。

### フォールバック順序

```
① サブモジュール物理参照（現行ロジック・主軸）
  ↓ 失敗時
② Cloudflare Workers API（HTTP fetch）
   https://database.numbertales-radiann.net/api/v1/NumberTales/Primary/records
  ↓ 失敗時
③ FALLBACK_CHARACTER（000 チトセのデフォルト定義）のみ
```

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/bot/character/loader.ts` | `initializeCharacterDB()` を 3 段階フォールバック構成に変更 |

---

## 動作確認結果

| 確認項目 | 結果 |
|---------|------|
| `npm run typecheck` | エラーなし ✅ |
| `SLOT_DIGIT_EMOJIS` マップ（0〜9） | 確認 ✅ |
| `game-slot` インテント定義 | 確認 ✅ |
| `handleSlot()` 役判定ロジック | 確認 ✅ |
| `mention.ts` ディスパッチ | 確認 ✅ |
| `loader.ts` フォールバックチェーン | 確認 ✅ |

---

## 残タスク（次ステップ候補）

- **F-06 Stage D-2a ポーカー / D-2b ヨット**: セッション管理（`game_sessions` テーブル）の実装が前提
- **F-06 Stage D-3 ヒット＆ブロウ**: `crypto.randomInt()` での重複なし数列生成が必要
- **F-10 エンジェルナンバー占い**: 本マイルストーンに続いて着手
- **F-12 リマインダー機能**: 本マイルストーンに続いて着手
