# F-10: 今日のエンジェルナンバー占い — 実装仕様

> 作成日: 2026-06-23
> 更新日: 2026-07-03（絵文字演出・前提機能A/D3-6-7との整合確認を追記）
> ステータス: **着手** 🔧
> 元アイデア: [`future-plan/confirmed-milestone/F-10-angel-number-fortune.md`](../future-plan/confirmed-milestone/F-10-angel-number-fortune.md)
> 安全設計参照: [`bot-spec/05_bot-safety-design.md`](../bot-spec/05_bot-safety-design.md)

---

## 概要

毎日 1 回、ユーザーがメンションすることで「今日のエンジェルナンバー」をランダムに引く占い機能。
数字・ヌメロジーの世界観を「毎日の習慣」として定着させる。

---

## 既存機能との整合確認（2026-07-03）

- **前提機能A（キャラクタープロンプト個性化強化）**: 下記ステップ[5]の `buildCharacterSystemPrompt()` 呼び出しにより、
  `NumerospecAbout`（ヌメロジー上の役割・特性）を含む専門性セクションは自動的にシステムプロンプトへ組み込まれる。
  F-10 側で追加対応は不要（[`_ideas/milestone/completed/2026-06-16_milestone_character-specialization-and-numerology-consultation.md`](./completed/2026-06-16_milestone_character-specialization-and-numerology-consultation.md) 参照）。
- **D3-6（Secvier絵文字活用強化案）**: 下記「絵文字演出」節で、[`F-06_stage-d-minigames.md`](../future-plan/F-06_stage-d-minigames.md) の
  「Secvier 絵文字アセット 全量棚卸し」で判明した英数字絵文字（6色×36文字）を用いた表示を追加検討する。
- **D3-7（継続コマンド対応）**: F-10の「1日1回制限」時の断り方（下記チェックリスト）は、D3-7で確立した
  「キャラクターの口調で自然に誘導する」という方針と一貫しており、追加のルール変更は不要。

---

## 安全設計チェックリスト

| 項目 | 方針 |
|-----|-----|
| 公開範囲 | `home`（フォロイーの HTL にのみ流す） |
| ランダム値生成 | コード側で `weightedRandom()` による重み付き抽選（LLM に任せない） |
| 利用制限 | 1 ユーザー 1 日 1 回（JST 日付単位でリセット） |
| 制限時の応答 | キャラクターの口調で自然に断る（ルール提示しない） |
| LLM にユーザーデータを委ねない | 日付チェックは SQLite で行い、LLM には渡さない |
| グローバルレートリミッタ | 既存の `RATE_LIMIT_GLOBAL_PER_HOUR` の対象に含める |

---

## 意図分類

`src/bot/classifier/intent.ts` に追加:

```typescript
// Intent 型に追加
'angel-number-fortune'

// トリガーパターン
const ANGEL_NUMBER_PATTERNS: RegExp[] = [
  /おみくじ/,
  /今日の数字(は|を|占い)?/,
  /エンジェルナンバー(を|引いて|教えて)/,
  /数字を引いて/,
  /今日の運勢/,
  /今日のナンバー/,
  /\/angel\b/i,
];
```

---

## エンジェルナンバープール（重み付き）

`src/features/f10/angel-number-data.ts` に定義:

```typescript
export interface AngelNumberEntry {
  number: number;
  weight: number;
  message: string;       // メッセージ（例: 「願いは叶います」）
  keywords: string[];    // キーワード（例: ['表現', '創造', '拡張']）
  detail: string;        // 詳細解釈文（CW 内に表示）
}

export const ANGEL_NUMBER_POOL: AngelNumberEntry[] = [
  // 1桁: weight 4（基本エネルギー）
  { number: 1, weight: 4, message: '新しい始まり', keywords: ['独立', 'パイオニア', '意志'], detail: '...' },
  // ... 2〜9
  // マスターナンバー: weight 3/2
  { number: 11, weight: 3, ... },
  { number: 22, weight: 3, ... },
  { number: 33, weight: 2, ... },
  // 2桁ゾロ目: weight 2
  { number: 44, weight: 2, ... },
  // ... 55〜99
  // 3桁ゾロ目: weight 1（レア）
  { number: 111, weight: 1, ... },
  // ... 222〜999
  // 4桁ゾロ目: weight 0.5（超レア）
  { number: 1111, weight: 0.5, ... },
  { number: 7777, weight: 0.5, ... },
  { number: 8888, weight: 0.5, ... },
];

export function weightedRandom(pool: AngelNumberEntry[]): AngelNumberEntry {
  const total = pool.reduce((sum, e) => sum + e.weight, 0);
  let rand = Math.random() * total;
  for (const entry of pool) {
    rand -= entry.weight;
    if (rand <= 0) return entry;
  }
  return pool[pool.length - 1]!;
}
```

> ※ 0 はプールから除外（「今日の数字」として引き当てると違和感があるため）

---

## セッション DB 拡張

`src/storage/session.ts` に `user_fortune` テーブルを追加:

```sql
CREATE TABLE IF NOT EXISTS user_fortune (
  user_id     TEXT PRIMARY KEY,
  last_date   TEXT NOT NULL,   -- 'YYYY-MM-DD' (JST)
  last_number INTEGER NOT NULL
);
```

---

## ゲームフロー

```
[1] angel-number-fortune インテント検出

[2] SQLite で今日の利用済みチェック（JST 日付）
    → 済みの場合: キャラクターの口調で「今日はもう出たよ」と返す

[3] weightedRandom(ANGEL_NUMBER_POOL) でコード側抽選

[4] SQLite に last_date・last_number を記録

[5] LLM 呼び出し:
    システムプロンプト: buildCharacterSystemPrompt(activeCharacter, 'chat', activeFormTarget)
    ユーザーメッセージ: 抽選された数字・メッセージ・キーワード → キャラとして一言（40文字以内）

[6] 返信:
    本文（公開 home）: キャラの口調で今日のナンバー + 一言
    CW 内: 数字の意味・キーワード・詳細解釈文
```

---

## 絵文字演出（2026-07-03 追加検討・仕様未確定）

D3-6の棚卸しで判明した英数字絵文字（`sv_{色}_{0〜9,A〜Z}`、6色×36文字）を使い、
エンジェルナンバーの桁数・レア度に応じて色を変えて表示する案。

| プール区分 | weight | 表示色（案） |
| --- | --- | --- |
| 1桁（基本エネルギー） | 4 | `hakuji`（白磁・日常的） |
| マスターナンバー（11/22/33） | 3 / 2 | `suigyoku`（翠玉） |
| 2桁ゾロ目（44〜99） | 2 | `suigyoku`（翠玉、マスターナンバーと共通） |
| 3桁ゾロ目（111〜999） | 1 | `kougyoku`（紅玉・レア） |
| 4桁ゾロ目（1111/7777/8888） | 0.5 | `seiyuu`（星幽・超レア） |

- 表示例: 77 なら `:sv_suigyoku_7::sv_suigyoku_7:` のように桁ごとに絵文字を並べる。
- `kokuji`（黒磁）は今回未使用のまま据え置き（将来の特別演出用に温存する案もあり）。
- 本文中に絵文字を並べ、CW内はテキストのみで詳細を補足する形を想定（麻雀配牌チャレンジと同様の構成）。
- 仕様は未確定。実装時にユーザー確認を挟む。

---

## 出力フォーマット

```
【本文（100文字以内目安）】
今日の数字は :sv_suigyoku_7::sv_suigyoku_7: だよ。精神の豊かさと内なる知恵が輝く日…。CW に詳しいこと書いたよ。

【CW ラベル】
「今日のエンジェルナンバー」

【CW 内】
✦ エンジェルナンバー: 77
✦ メッセージ: 精神の目覚めと豊かな知恵
✦ キーワード: ラッキー・精神性・探求・直観

{詳細解釈文}
```

---

## 実装ファイル構成

```
src/
  features/
    f10/
      angel-number-data.ts    # AngelNumberEntry 型・ANGEL_NUMBER_POOL・weightedRandom()
      angel-number-fortune.ts # 日付チェック・抽選・LLM 呼び出し・返信構築
  storage/
    session.ts                # user_fortune テーブル追加
  bot/
    classifier/intent.ts      # angel-number-fortune インテント追加
    handlers/mention.ts       # angel-number-fortune ディスパッチ追加
    reactor/emoji-reaction-map.ts  # angel-number-fortune リアクション追加
```

---

## 実装ステップ

1. `src/features/f10/angel-number-data.ts` — プールデータ・`weightedRandom()` 実装
2. `src/storage/session.ts` — `user_fortune` テーブル追加・日付チェック関数追加
3. `src/features/f10/angel-number-fortune.ts` — メインロジック実装
4. `src/bot/classifier/intent.ts` — `angel-number-fortune` インテント追加
5. `src/bot/handlers/mention.ts` — ディスパッチ追加
6. `src/bot/reactor/emoji-reaction-map.ts` — リアクション追加
7. `npm run typecheck` で確認

---

## 拡張案（2026-07-20 追記）: 非ゾロ目2桁の出目追加＋NumerospecAbout 連携

user の提案により、出目プールを従来案（1桁基本＋ゾロ目）から**2桁全域**へ拡張する案を検討する。

- **出目プール拡張**: 非ゾロ目の2桁ナンバー（例: 12, 34, 78…）もプールに含める。
  解釈は参照元サイト系の一般的なエンジェルナンバー解釈を**要約・独自文に書き起こして**
  プールデータに収録する（解釈文の転載はしない・user 監修必須）。
- **NumerospecAbout 連携**: 引いた2桁ナンバーが公開済みナンバーテールズの `Num` と一致する場合、
  該当キャラの `NumerospecAbout`（公開設定）をフレーバーとして解釈に添える。
  例: 78 を引いたら「78(ナナハ) のヌメロスペック『経験・報酬を反省から生む』」を絡めた一言。
- **キャラカメオ演出**: 一致キャラのコアフォルダ絵文字（`resolveCoreFolderEmoji`）を表示し、
  そのキャラが一言添える演出も可能（F-14 ゲスト召喚・F-15 お供演出との連携候補。
  アフィニティ微加算のフックにもなり得る）。
- **重み設計**: ゾロ目・キャラ番号一致・その他で weight を調整（キャラ番号一致をやや優遇すると
  「推しが出た」体験が生まれる）。プール件数が増えるため `weightedRandom()` はそのまま流用可。
- **段階導入**: F-10 本体（従来プール）を先に完成させ、本拡張は Phase 2 として
  プールデータ差し替えのみで対応できる構造にしておく（`AngelNumberEntry` に
  `linkedCharNum?: string` を追加する程度に留める）。
