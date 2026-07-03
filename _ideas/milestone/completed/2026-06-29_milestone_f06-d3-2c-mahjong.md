# F-06 Stage D3-2c: 麻雀配牌チャレンジ実装完了

> 作成日: 2026-06-29
> ステータス: **完了** ✅（typecheck 確認済み・push 済み）

---

## 概要

Secvier 麻雀牌絵文字（`sv_mj_*` 34 種）のインスタンス登録確認を受けて、
F-06 Stage D の追加ゲームとして麻雀配牌チャレンジ（D3-2c）を実装した。

136 枚の標準デッキから 14 枚を配牌し、役を判定するワンショットゲーム。
全分解列挙アルゴリズムにより、複数の面子分解が存在する場合でも最高翻数の役構成を正確に採用する。

---

## D3-2c: 麻雀配牌チャレンジ

### 仕様概要

| 項目 | 内容 |
| --- | --- |
| インテント | `game-mahjong` |
| コマンド例 | 「麻雀しよう」「配牌チャレンジ」「まーじゃん」「/mahjong」「/mj」 |
| セッション | なし（ワンショット） |
| 出力形式 | CW（cwLabel=「配牌の内容」/ cwBody=牌絵文字 2 行 / text=役サマリー） |

### 役判定一覧

| 役形 | 役名 | 翻数 |
| --- | --- | --- |
| 特殊 | 国士無双 | 13（役満） |
| 特殊 | 七対子 | 2 |
| 基本形 | 清一色 | 6 |
| 基本形 | 混一色 | 3 |
| 基本形 | 対々和 | 2 |
| 基本形 | 平和 | 1 |
| 基本形 | タンヤオ | 1 |
| 基本形 | 役牌（白/発/中） | 各 1 |

役なし・流局（アガり形不成立）も正しく判定し、ユーザーにメッセージを返す。

### アルゴリズム設計

**全分解列挙（`getAllMentsuDecompositions`）**  
従来の「最初に見つかった面子分解」方式では、刻子分解と順子分解の両方が成立するケースで
対々和や平和が誤判定される問題があった。
全分解を列挙して最高翻数の面子構成を選ぶ方式に変更することで正確な役判定を実現。

例: `111m 222m 333m 444m + 55m`（雀頭）  
→ 最初の分解では順子主体になるケースがあるが、全分解を試すことで  
　全刻子の分解（対々和+清一色=8翻）が正しく採用される。

---

## 絵文字マップ拡充

本実装に合わせて `emoji-reaction-map.ts` にも `_aphrnts` 系カスタム絵文字を追加した。

### REACTION_EMOJI_MAP 追加

| カテゴリ | 追加絵文字 | 意味 |
| --- | --- | --- |
| `achievement` | `completed_aphrnts72` | 完了！ |
| `interesting` | `hirameita_aphrnts62` | ひらめいた！ |
| `cheer` | `sorosoro_yaruka_aphrnts32` | そろそろやるか |
| `sympathy` | `daijoubu_q_aphrnts7`, `araara_aphrnts9` | 大丈夫？ / あらあら |

### MENTION_REACTION_MAP 追加・更新

| インテント | 追加絵文字 |
| --- | --- |
| `greeting` | `mochiron_aphrnts33` |
| `creative-consultation` | `makasete_aphrnts35`, `hirameita_aphrnts62` |
| `chat` | `wakatta_aphrnts52`, `sounano_aphrnts73` |
| `calculate` | `wakatta_aphrnts52` |
| `game-mahjong`（新規） | `yattaze_aphrnts41`, `omoshiroi_i_aphrnts65`, `ee_ooo_aphrnts89` |

---

## 変更ファイル

| ファイル | 変更内容 |
| --- | --- |
| `src/features/f06/mahjong.ts` | **新規**。Tile 型定義・136 枚デッキ・`dealHand()`・`getAllMentsuDecompositions()`・`getAllBasicForms()`・`checkChiitoitsu()`・`checkKokushi()`・`evaluateHand()`・`tileEmoji()`・`handEmojiBlock()`・`mahjongResultText()` |
| `src/features/f06/index.ts` | `handleMahjong()` 追加 |
| `src/bot/classifier/intent.ts` | `Intent` 型に `'game-mahjong'` 追加・`MAHJONG_PATTERNS` 定義・分類ロジック追加 |
| `src/bot/handlers/mention.ts` | `handleMahjong` import・`generateF06Framing` typeLabel 追加・F06 gate 条件追加・`game-mahjong` dispatch・framingType chain 追加 |
| `src/bot/reactor/emoji-reaction-map.ts` | 上記絵文字追加 |

---

## 動作確認結果

| 確認項目 | 結果 |
| --- | --- |
| `npm run typecheck` | エラーなし ✅ |
| 七対子テスト | OK ✅ |
| 国士無双テスト | OK ✅ |
| 平和テスト（全順子判定） | OK ✅ |
| 対々和テスト（全分解列挙） | OK ✅（清一色+対々和=8翻 正確判定） |
| 流局テスト（アガり形なし） | OK ✅ |
| `sv_mj_*` 絵文字 API 確認 | 34 種すべてインスタンス登録済み ✅ |
| `_aphrnts` 新絵文字 33 種 API 確認 | すべてインスタンス登録済み ✅ |

---

## 残タスク（次ステップ候補）

- **D3-4a 牌引き占い**: D3-2c との差別化を検討してから着手判断
- **D3-5 キャラ番号ルーレット**: CreationsDB 連携（アイデア P 実装後）
- **F-10 エンジェルナンバー占い**: milestone 仕様策定済み（着手可能）
- **F-12 リマインダー**: milestone 仕様策定済み（着手可能）
