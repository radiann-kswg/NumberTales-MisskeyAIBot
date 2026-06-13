#!/usr/bin/env node
/**
 * Claude Codeデバッグ用: Botの直近Misskey投稿を取得して表示する
 * Usage: node tools/fetch-misskey-notes.mjs [--limit N]
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

const { MISSKEY_HOST, MISSKEY_TOKEN } = env;
if (!MISSKEY_HOST || !MISSKEY_TOKEN) {
  console.error('エラー: .env に MISSKEY_HOST または MISSKEY_TOKEN が設定されていません。');
  process.exit(1);
}

// --limit オプション
const limitIdx = process.argv.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1], 10) : 10;

async function post(endpoint, body) {
  const res = await fetch(`${MISSKEY_HOST}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ i: MISSKEY_TOKEN, ...body }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`);
  return res.json();
}

// Bot 自身のユーザー情報を取得
const me = await post('i', {});
console.log(`Bot: @${me.username}${me.name ? ` (${me.name})` : ''}`);
console.log(`ID : ${me.id}`);
console.log(`=== 直近 ${limit} 件の投稿 ===\n`);

// 直近ノートを取得
const notes = await post('users/notes', { userId: me.id, limit });

if (!notes.length) {
  console.log('（投稿なし）');
  process.exit(0);
}

for (const note of notes) {
  const date = new Date(note.createdAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const visibility = note.visibility !== 'public' ? ` [${note.visibility}]` : '';
  console.log(`[${date}]${visibility}`);
  if (note.cw != null) console.log(`CW: ${note.cw}`);
  console.log(note.text ?? '（テキストなし）');
  if (note.renoteId) console.log(`  ↩ Renote of: ${note.renoteId}`);
  console.log('---');
}
