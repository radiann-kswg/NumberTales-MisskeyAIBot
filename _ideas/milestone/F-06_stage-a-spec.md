# F-06 Stage A — 数式計算 & ヌメロジー基礎実装仕様

> 作成: 2026-05-26
> 対象フェーズ: 実装予定（Phase 3 先行着手）
> ライブラリ: `mathjs`（インストール済み）
> キャラクター: 000(チトセ)（現時点での単一対応）

---

## 実装スコープ（Stage A）

| 機能               | 説明                                                        |
| ------------------ | ----------------------------------------------------------- |
| 数式計算コマンド   | 算術・三角関数・統計などを `mathjs` で評価して返答          |
| ライフパスナンバー | 生年月日 → 数秘術的縮約（マスターナンバー 11/22/33 で停止） |
| 九星気学 本命星    | 生年 → 一白水星〜九紫火星                                   |
| タロット対応       | ライフパスナンバー結果に大アルカナを付記                    |

---

## Intent 分類の拡張

`src/bot/classifier/intent.ts` に 2 つの新 Intent を追加する。

```typescript
export type Intent =
  | 'greeting'
  | 'form-switch'
  | 'creative-consultation'
  | 'chat'
  | 'calculate' // NEW: 数式計算
  | 'numerology'; // NEW: 数秘術・九星気学
```

`ClassificationResult` に `numerologyType` を追加:

```typescript
export interface ClassificationResult {
  intent: Intent;
  formTarget?: 'core-folder' | 'humanoid';
  numerologyType?: 'life-path' | 'kyusei' | 'tarot'; // numerology intent のときのみ
}
```

### 検知パターン（正規表現）

**`calculate` 検知パターン:**

```
/計算して|計算お願い|を計算|\/calc\s/i
/[0-9＋－×÷\+\-\*\/\^\(\)\s]{3,}/   ← 式っぽい文字列
/sqrt|sin|cos|tan|log|factorial|√|∑/i
```

**`numerology` 検知パターン:**

```
/ライフパス|lifepath|life\s*path|誕生数|運命数/i
/九星|本命星|気学|きゅうせい/i
/タロット.*数秘|数秘.*タロット/i
/\/numerology|\/lp|\/kyusei/i
```

---

## 入力形式（2 方式）

### A. 自然文方式

```
@000chitose ライフパスナンバー教えて！1990年1月15日生まれ
@000chitose 九星気学で本命星を教えて 1990
@000chitose √144 を計算して
@000chitose sin(30) + cos(60) は？
```

ハンドラー内で `event.text` から日付・数式・年を正規表現で抽出する。

**日付抽出パターン:**

```typescript
// YYYY年M月D日 / YYYY/MM/DD / YYYYMMDD / YYYY-MM-DD
const DATE_PATTERN = /(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})日?|(\d{8})/;
```

**年抽出パターン:**

```typescript
const YEAR_PATTERN = /(\d{4})年?/;
```

**数式抽出パターン:**

```typescript
// 計算に使いそうな文字列を残して抽出
const EXPR_PATTERN = /([0-9\.\+\-\*\/\^\(\)√∑sincostanlogsqrt\s]+)/i;
```

### B. スラッシュコマンド方式

```
@000chitose /calc 1 + sin(30deg)
@000chitose /numerology lp 19900115
@000chitose /kyusei 1990
```

コマンドパーサー:

```typescript
// /command [subcommand] [args...]
const SLASH_CMD = /^\/(\w+)(?:\s+(\w+))?(?:\s+(.+))?$/;
```

---

## 実装ファイル構成

```
src/
  features/
    f06/
      calculator.ts     # mathjs ラッパー（数式評価・エラーハンドリング）
      numerology.ts     # ライフパスナンバー・九星気学・タロット計算ロジック
      index.ts          # コマンドディスパッチャー（入力解析 → 各機能に振り分け）
      responder.ts      # 000(チトセ) 専用応答テンプレート
```

> `src/features/` フォルダはすでに存在する（`.gitkeep` のみ）。

---

## 計算ロジック仕様

### 数式計算 (`calculator.ts`)

```typescript
import * as math from 'mathjs';

// 安全評価: 最大200文字・禁止パターン除去
export function safeEvaluate(expr: string): string {
  if (expr.length > 200) throw new Error('式が長すぎるよ');
  const result = math.evaluate(expr);
  return math.format(result, { precision: 10 });
}
```

**禁止パターン（セキュリティ）:**

- `import`, `require`, `process`, `__` 等のキーワードを弾く
- 結果が数値・行列・単位以外（関数オブジェクト等）の場合はエラー

### ライフパスナンバー (`numerology.ts`)

```typescript
const MASTER_NUMBERS = new Set([11, 22, 33]);

export function reduceToSingleDigit(n: number): number {
  while (n > 9 && !MASTER_NUMBERS.has(n)) {
    n = String(n)
      .split('')
      .reduce((a, d) => a + Number(d), 0);
  }
  return n;
}

export function lifePathNumber(year: number, month: number, day: number): number {
  const sum = [...String(year), ...String(month), ...String(day)].reduce(
    (a, d) => a + Number(d),
    0,
  );
  return reduceToSingleDigit(sum);
}
```

### 九星気学 本命星 (`numerology.ts`)

```typescript
const KYUSEI_NAMES = [
  '',
  '一白水星',
  '二黒土星',
  '三碧木星',
  '四緑木星',
  '五黄土星',
  '六白金星',
  '七赤金星',
  '八白土星',
  '九紫火星',
] as const;

export function honmeisei(year: number): string {
  // 立春基準（1〜2月生まれは前年扱い）
  const n = (11 - ((year - 1984) % 9)) % 9 || 9;
  return KYUSEI_NAMES[n]!;
}
```

> ⚠️ 月命星（月生まれ補正）は Stage B で追加予定。現時点は年命星のみ。

### タロット対応表 (`numerology.ts`)

```typescript
export const TAROT_MAP: Record<number, string> = {
  1: '魔術師',
  2: '女教皇',
  3: '女帝',
  4: '皇帝',
  5: '教皇',
  6: '恋人',
  7: '戦車',
  8: '力',
  9: '隠者',
  10: '運命の輪',
  11: '正義',
  12: '吊るされた男',
  13: '死神',
  14: '節制',
  15: '悪魔',
  16: '塔',
  17: '星',
  18: '月',
  19: '太陽',
  20: '審判',
  21: '世界',
  22: '愚者',
  33: '愚者（マスター）',
};
```

---

## 応答テンプレート（000チトセ）

`src/features/f06/responder.ts` に定義する。

### 数式計算

```typescript
// CW なし（結果が短いため）
`000 :aphrnts0_corefolder:「${expr} = ${result}。計算完了だよ」`
// エラー時
`000 :aphrnts0_corefolder:「…その式、うまく読み取れなかった。もう一度書いてみてくれる？」`;
```

### ライフパスナンバー

返答は 100 文字超えるので CW 折りたたみ。CW ラベル: `「000の占い」`

```
【見出し】
000 :aphrnts0_corefolder:「ライフパスナンバーを計算したよ。CW内に詳細をまとめたから見てね」

【CW内 本文】
✦ ライフパスナンバー: {number}
✦ タロット対応: {tarot}

{number}のエネルギーを持つ君は…（LLM生成 or 固定文）
```

> **LLM 生成 or 定型文の選択**: Stage A では各ナンバーの**定型文**（12 種 + マスター 3 種 = 計 15 パターン）を `responder.ts` に持つ。

### 九星気学

```
【見出し】
000 :aphrnts0_corefolder:「九星気学で本命星を出したよ」

【CW内 本文】
✦ 本命星: {year}年生まれ → {kyusei}

{kyusei}の性質… （定型文）
```

---

## intent.ts 更新時の注意

`ClassificationResult` 型を変更した場合、**必ず以下の呼び出し側も同時に更新すること**:

- `src/bot/handlers/mention.ts` — `const { intent, formTarget, numerologyType } = classifyIntent(text)`
- `src/bot/scheduler/index.ts` — 分岐に影響がないか確認

```bash
npm run typecheck
```

---

## テスト確認手順

```bash
npm run build

# 計算テスト
node --input-type=module << 'EOF'
import { safeEvaluate } from './dist/features/f06/calculator.js';
console.log(safeEvaluate('sqrt(144)'));       // 12
console.log(safeEvaluate('sin(pi/6)'));       // 0.5
EOF

# 数秘テスト
node --input-type=module << 'EOF'
import { lifePathNumber, honmeisei } from './dist/features/f06/numerology.js';
console.log(lifePathNumber(1990, 1, 15));  // 7
console.log(honmeisei(1990));              // 四緑木星
EOF
```
