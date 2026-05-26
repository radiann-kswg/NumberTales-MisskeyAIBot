# マルチキャラクター切り替え — 設計・実装方針（将来実装）

> 作成: 2026-05-26
> 対象フェーズ: 将来実装（F-06 Stage A 完了後）
> 前提: `_creations-db` サブモジュール（`db_Primary.json`）が参照可能であること

---

## 概要

現在 000(チトセ) に固定されているシステムプロンプトを、
`db_Primary.json` の公開済みキャラクターデータから**動的に生成**できるように変更する。

ユーザーがメンションで「○○になって」「#N に切り替えて」と指定すると
Bot の応答人格をそのキャラクターに切り替える。

---

## 対象キャラクター

`db_Primary.json` の `Progress: "released"` のエントリのみ対応。
現時点で **39 体以上**が公開済み。

切り替えコマンド例:

```
@000chitose 1(ハジメ)になって
@000chitose #3 に切り替えて
@000chitose 元に戻って   ← 000(チトセ) にリセット
```

---

## 設計方針

### 1. キャラクターローダー（`src/characters/loader.ts`）

```typescript
import db from '../_creations-db/data/Works_NumberTales/DataBases/db_Primary.json' assert { type: 'json' };

export interface CharacterData {
  Num: number;
  Name: string;
  FirstPersonCalling: string;
  SecondPersonCalling: string;
  Character: string;
  Summary: string;
  Hobby: string;
  Favor: string;
  Unlike: string;
  Height_cm: number;
  TailsUnit: string;
}

export function getCharacter(num: number): CharacterData | undefined {
  return (db as CharacterData[]).find((c) => c.Num === num && c.Progress === 'released');
}

export function getAllReleased(): CharacterData[] {
  return (db as CharacterData[]).filter((c) => c.Progress === 'released');
}
```

> ⚠️ サブモジュール (`_creations-db/`) は参照専用。直接編集しないこと。

### 2. プロンプトビルダー（`src/characters/prompt-builder.ts`）

`CharacterData` からシステムプロンプト文字列を動的生成する。

```typescript
export function buildSystemPrompt(char: CharacterData): string {
  return `あなたはナンバーテールズ${char.Num}番機「${char.Name}」として Misskey 上で会話する Bot です。

【キャラクター設定】
- 一人称: 「${char.FirstPersonCalling}」
- 二人称: 「${char.SecondPersonCalling}」
- 性格: ${char.Character}
- 好み: ${char.Favor}
- 苦手: ${char.Unlike}
- 身体: ${char.TailsUnit}・${char.Height_cm}cm（人型形態）

【概要】
${char.Summary}

【制約】
- 反社会的・著しく性的な表現は絶対に行わない
- 未公開のキャラクター設定・台詞・ストーリーを自動生成しない
- 返答は簡潔に（できれば 80 文字以内）
- ガイドライン（CC BY-NC 4.0）を遵守する`;
}
```

### 3. アクティブキャラクター状態管理

**方針: Bot 全体でシングルトン管理（メモリ内）**

```typescript
// src/characters/active.ts
let activeCharacterNum = 0; // 0 = 000(チトセ)（デフォルト）

export function getActiveNum(): number {
  return activeCharacterNum;
}
export function setActiveNum(num: number): void {
  activeCharacterNum = num;
}
export function resetToDefault(): void {
  activeCharacterNum = 0;
}
```

> **設計上の判断**: セッション単位（ユーザーごと）に切り替えるか、Bot 全体で 1 キャラクターにするかは要検討。
> 現状はシンプルに「Bot 全体で 1 体」とし、後で拡張する。

### 4. `intent.ts` への `character-switch` 分岐追加

```typescript
export type Intent =
  | 'greeting'
  | 'form-switch'
  | 'creative-consultation'
  | 'chat'
  | 'calculate'
  | 'numerology'
  | 'character-switch'; // NEW

export interface ClassificationResult {
  intent: Intent;
  formTarget?: 'core-folder' | 'humanoid';
  numerologyType?: 'life-path' | 'kyusei' | 'tarot';
  characterNum?: number; // character-switch のときのみ
}
```

検知パターン:

```
/#(\d+)\s*に切り替え|#(\d+)\s*になって/
/(\d+)\(.*?\).*?になって/
/元に戻って|リセット|デフォルトに/i
```

---

## 応答書式のキャラクター別対応

キャラクターに合わせて `formatSpeech()` の絵文字名も変更する必要がある。

```typescript
// 現在の 000(チトセ) 専用書式
`000 :aphrnts0_corefolder:「${text}」`
// 汎用書式（キャラクターデータから生成）
`${char.Num} :aphrnts${char.Num}_corefolder:「${text}」`;
```

> ⚠️ カスタム絵文字名 `:aphrntsN_corefolder:` が全キャラクター分インスタンスに登録されているか事前確認が必要。

---

## スケジューラー対応

`PostScheduler` の自発投稿もアクティブキャラクターのプロンプトに切り替える。

```typescript
// scheduler/index.ts での変更箇所
const char = getCharacter(getActiveNum());
const systemPrompt = char ? buildSystemPrompt(char) : DEFAULT_SYSTEM_PROMPT;
const response = await ai.chat([...], { systemPrompt });
```

---

## 実装手順（推奨順序）

1. `src/characters/loader.ts` — JSON ローダー作成
2. `src/characters/prompt-builder.ts` — プロンプトビルダー作成
3. `src/characters/active.ts` — アクティブキャラクター状態管理
4. `intent.ts` — `character-switch` 分岐追加
5. `mention.ts` — `character-switch` ハンドラー実装
6. `scheduler/index.ts` — アクティブキャラクター対応
7. 絵文字の存在確認（インスタンスに登録済みか確認）

---

## 注意事項

- `_creations-db/` の JSON を直接インポートする場合、TypeScript の `assert { type: 'json' }` が必要（ESM）
- または `fs.readFileSync` + `JSON.parse` でファイル読み込みする方が型安全に扱いやすい
- `db_Primary.json` のフィールドのうち `ConversationPattern` が存在しない場合があるので `Character` フィールドで代替する
- プロンプトインジェクション対策: `Summary` 等のユーザー入力由来でないフィールドも、意図的な悪意ある値が入っていないかスキーマ検証を行う
