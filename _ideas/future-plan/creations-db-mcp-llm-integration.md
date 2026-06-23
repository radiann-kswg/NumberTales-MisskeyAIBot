# CreationsDB MCPサーバー × Bot LLM 連携

> 作成日: 2026-06-21
> ステータス: **検討中**（将来計画）

---

## 概要

`_creations-db/pkg/mcp/server.mjs` が提供する MCP サーバーを、
Bot の LLM（OpenAI/Gemini）に **ツール（function calling / tool use）** として接続するアイディア。

現状の「Bot 起動時に CreationsDB 全件ロード → メモリキャッシュ → プロンプトに埋め込み」から
「メンション受信時に LLM が必要な情報を自律的にリアルタイム参照」へのアーキテクチャ拡張。

---

## 現状との比較

| 項目 | 現状（一括ロード） | 本アイディア（MCP連携） |
| ---- | ---- | ---- |
| データ取得タイミング | Bot 起動時に一括 | LLM がリクエスト時に必要なぶんだけ取得 |
| LLM への渡し方 | システムプロンプトに埋め込み | ツール呼び出し結果として提供 |
| 対応できる情報量 | 起動時のスナップショット | 動的・常に最新 |
| 対応できるクエリ | 起動時に読み込んだキャラ範囲のみ | 全文検索・任意キャラ参照が可能 |
| アーキテクチャ変更幅 | — | 大（AIProvider に tool use 追加が必要） |

---

## MCPサーバーが提供するツール

`_creations-db/pkg/mcp/server.mjs` を起動すると以下のツールが使用できる：

| ツール名 | 説明 |
| -------- | ---- |
| `list_works` | 作品一覧の取得 |
| `list_dbs` | DB 一覧の取得 |
| `get_records` | レコード一覧の取得 |
| `get_record` | インデックス値でレコード 1 件取得 |
| `search_records` | DB 内全文検索 |
| `search_all_records` | 作品横断全文検索 |

---

## 動作イメージ

```
ユーザーメンション: 「78(ナナハ)ってどんな子？」
  ↓
Bot がインテント分類 → character-query と判定
  ↓
LLM 呼び出し時に get_record / search_records ツールを付与して渡す
  ↓
LLM が自律的に get_record('NumberTales', 'Primary', '78', 'Num') を呼び出す
  ↓
取得したレコード（Name, Character, Hobby, SpecialSkill 等）を元に回答文を生成
  ↓
Misskey に投稿
```

---

## 実装上の検討ポイント

### MCP サーバーの起動方法

```
【案 A】子プロセスとして Bot と同時起動（stdio）
  - Bot 起動時に `node _creations-db/pkg/mcp/server.mjs` を子プロセスで起動
  - stdio 経由で通信
  - シンプルだが Bot プロセスとライフサイクルが連動する

【案 B】独立した HTTP サーバーとして常時起動
  - MCP サーバーを別プロセス・別ポートで起動しておく
  - Bot から HTTP 経由で接続
  - より疎結合だがサーバー管理が必要
```

### AIProvider への組み込み

現行の `src/ai/` 抽象レイヤー（OpenAI / Gemini）に tool use / function calling を追加する設計が必要：

```typescript
// イメージ
const tools = buildMCPTools(); // MCPサーバーのツール定義を OpenAI/Gemini 形式に変換
const response = await provider.generateWithTools(messages, tools);
// LLMがツールを呼び出した場合はMCPサーバーに転送して結果を返す
```

---

## 設計上の参考

`100BeautiesLab_GeneratorsAI/src/mcp_server/` の実装が参考になる：

| 参考ポイント | GeneratorsAI での実装 |
| ---- | ---- |
| MCPフレームワーク | FastMCP（Python）→ 同様のパターンを Node.js で応用 |
| 認証設計 | OAuth 2.0（auth.py）→ HTTP 接続時の通信保護参考 |
| トランスポート切り替え | 環境変数で stdio / HTTP を切り替える設計 |
| 非同期ジョブ管理 | 重い処理を非同期化する jobs.py のパターン |

---

## 着手条件

以下がすべて揃った段階で milestone に移動する：

- [ ] OpenAI / Gemini の tool use（function calling）を現行 AIProvider 抽象レイヤーに組み込む設計が固まること
- [ ] MCP サーバーの起動方法（案 A / 案 B）の選定
- [ ] フォールバック対応（アイディアP）の実装完了を確認してから着手

---

## 関連ファイル

- `_creations-db/pkg/mcp/server.mjs` — MCP サーバー実装
- `_creations-db/docs/pkg-client-libraries.md` — クライアントライブラリ解説
- `src/ai/` — 現行の AIProvider 抽象レイヤー
- `_ideas/future-plan/creations-db-reference-expansion.md` — 先行するアイディアP（HTTPフォールバック）
