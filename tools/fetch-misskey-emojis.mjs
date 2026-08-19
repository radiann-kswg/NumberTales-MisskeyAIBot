#!/usr/bin/env node
/**
 * Claude Codeデバッグ用: インスタンスのカスタム絵文字一覧を取得して表示する
 * Usage:
 *   node tools/fetch-misskey-emojis.mjs                    # カテゴリ一覧と件数
 *   node tools/fetch-misskey-emojis.mjs --filter Penchant  # 名前/カテゴリ/別名/タグを部分一致で絞り込み
 *   node tools/fetch-misskey-emojis.mjs --category "..."    # カテゴリ完全一致で全件表示
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// .env を手動パース（dotenv 非依存）
const env = {};
try {
  const lines = readFileSync(join(ROOT, '.env'), 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
} catch {
  console.error('エラー: .env ファイルが見つかりません。プロジェクトルートに .env を用意してください。');
  process.exit(1);
}

const { MISSKEY_HOST } = env;
if (!MISSKEY_HOST) {
  console.error('エラー: .env に MISSKEY_HOST が設定されていません。');
  process.exit(1);
}

const argOf = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const filter = argOf('--filter');
const category = argOf('--category');

const res = await fetch(`${MISSKEY_HOST}/api/emojis`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({}),
});
if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`);
const { emojis } = await res.json();
console.log(`総数: ${emojis.length}`);

const matches = (e) => {
  if (category !== null) return (e.category ?? '') === category;
  if (filter === null) return true;
  const hay = [e.name, e.category ?? '', ...(e.aliases ?? []), ...(e.tags ?? [])].join(' ').toLowerCase();
  return hay.includes(filter.toLowerCase());
};

const hits = emojis.filter(matches);

if (filter === null && category === null) {
  // カテゴリ一覧のみ
  const byCategory = new Map();
  for (const e of emojis) {
    const key = e.category ?? '(未分類)';
    byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
  }
  console.log('=== カテゴリ一覧 ===');
  for (const [cat, count] of [...byCategory].sort((a, b) => b[1] - a[1])) {
    console.log(`${String(count).padStart(5)}  ${cat}`);
  }
  process.exit(0);
}

console.log(`=== 一致: ${hits.length} 件 ===`);
for (const e of hits) {
  const aliases = e.aliases?.length ? ` aliases=[${e.aliases.join(',')}]` : '';
  console.log(`:${e.name}:  category=${e.category ?? '(none)'}${aliases}`);
}
