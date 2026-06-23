# 創作 DB 参照解決の手段拡張

> 作成日: 2026-05-27
> 更新日: 2026-06-21（Cloudflare Workers 実 API 稼働を反映）
> ステータス: **アイディアP（HTTPフォールバック）着手可能** ✅

---

## 概要

現在 Bot は `_creations-db/` サブモジュールをファイルシステム経由で直接読む「物理参照」方式を採用している。
このファイルは、**参照解決の手段を増やす**（置き換えではなく補完）ための将来計画を記録する。

---

## 現状の参照方式

`src/bot/character/loader.ts` の `initializeCharacterDB()` が
`_creations-db/pkg/nodejs/index.mjs` の `CreationsDBClient` を使って物理ファイルを読む。

| 項目 | 内容 |
| ---- | ---- |
| 方式 | サブモジュール物理参照（ファイルシステム） |
| 安定性 | ネットワーク不要・確実 |
| データ鮮度 | デプロイ時点のスナップショット |
| 運用手間 | `git submodule update` + デプロイが必要 |

---

## アイディアP: Cloudflare API HTTPフォールバック対応

### 背景

2026-06-21 に Cloudflare Workers 実 API（ADR-0001）が初回デプロイ完了し、
`database.numbertales-radiann.net/api/v1/` で Node.js から直接 `fetch` できる
正式なエンドポイントが稼働した。

以前は `database.numbertales-radiann.net` の API が Service Worker ベースの擬似 API であり、
Node.js から呼び出せないという制約があったが、これが解消された。

これにより「着手条件: 正式 API 整備またはアクセス動作確認済み」が満たされた。

### 方針

物理参照への**フォールバック補完**として HTTP 取得を追加する。
主軸は物理参照のまま維持し、失敗時のみ HTTP に切り替える。

```
① 物理参照（サブモジュール・現状のまま主軸）
  ↓ 失敗時（サブモジュール未更新・パス異常など）
② Cloudflare API（HTTP fetch）
  ↓ 失敗時（ネットワーク障害など）
③ デフォルトプロンプト（FALLBACK_CHARACTER）
```

### 実装イメージ（`src/bot/character/loader.ts`）

```typescript
export async function initializeCharacterDB(): Promise<void> {
  // ① 物理参照（現状のまま）
  try {
    const mod = await import('../../../_creations-db/pkg/nodejs/index.mjs');
    const client = new mod.CreationsDBClient(CREATIONS_DB_ROOT);
    const records = await client.getRecords('NumberTales', 'Primary');
    cachedReleasedCharacters = (records as CharacterRecord[]).filter(
      (entry) => entry.Progress === 'released',
    );
    return;
  } catch (err) {
    logger.warn('物理参照失敗、Cloudflare API にフォールバック', err);
  }

  // ② Cloudflare API
  try {
    const res = await fetch(
      'https://database.numbertales-radiann.net/api/v1/NumberTales/Primary/records'
    );
    const records = await res.json() as CharacterRecord[];
    cachedReleasedCharacters = records.filter(
      (entry) => entry.Progress === 'released',
    );
    logger.info(`Cloudflare API からキャラクター DB ロード: ${cachedReleasedCharacters.length} 件`);
    return;
  } catch (err) {
    logger.warn('Cloudflare API も失敗、デフォルトプロンプトを使用', err);
  }

  // ③ デフォルト
  cachedReleasedCharacters = [FALLBACK_CHARACTER];
}
```

### Cloudflare Workers 実 API の主要エンドポイント

| メソッド | パス | 説明 |
| -------- | ---- | ---- |
| GET | `/api/v1/:work/:db/records` | レコード一覧（`_Commons` 適用・`isPrivate` 除外済み） |
| GET | `/api/v1/:work/:db/records/:idx` | 1 件取得（`?idxKey=Num` でフィールド指定） |
| GET | `/api/v1/:work/:db/search?q=` | DB 内全文検索 |

**注意**: SW 疑似 API とは URL 書式が異なる（`/api/v1/:work/:db/` vs `/api/v1/works/:work/db/:db/`）。

### 留意点

- Cloudflare Workers 実 API は現時点で `_Commons` 適用・`isPrivate` 除外のみ対応
  （`_DBLink` / `_Jump` 解決は次フェーズ予定）
- ネットワーク障害リスクがあるためあくまでフォールバックとして位置づける
- フォールバック時はログに `warn` を出すことで運用時の検知を容易にする

---

## ステータス履歴

| 日付 | 内容 |
| ---- | ---- |
| 2026-05-27 | 将来計画として記録。着手条件: 正式 API 整備 |
| 2026-06-21 | Cloudflare Workers 実 API（ADR-0001）デプロイ完了 → 着手条件が満たされた |

---

## 関連ファイル

- `src/bot/character/loader.ts` — 実装対象
- `_creations-db/docs/api-sw-spec.md` — Cloudflare Workers 実 API 仕様
- `_ideas/future-plan/creations-db-mcp-llm-integration.md` — さらなる拡張（MCPサーバー連携）
