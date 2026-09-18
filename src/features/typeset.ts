// F-17C 数式画像の清書基盤 — PenchantManufacture_ImagePipeline（Python）を execFile で呼ぶ
// TS には移植しない（docs/adr/0001-python-typeset-via-execfile.md）。
// 画像は常に上乗せ。失敗・タイムアウト・Python 不在のときは null を返し、利用側はプレーン式で成立させること。

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';

const TYPESET_SCRIPT = '_calcimage-pipeline/scripts/typeset.py';
const CACHE_DIR = '.cache/typeset';
const TIMEOUT_MS = 3000;

/** 式の TeX 文字列 → キャッシュのキー（Drive の一意化にも同じ値を使う） */
export function typesetKey(tex: string): string {
  return createHash('sha1').update(tex).digest('hex');
}

/**
 * TeX 風の式を PenchantManufacture の字形で組んだ PNG にする。
 * 同じ式は `.cache/typeset/<sha1>.png` を再利用する。
 * @param tex パイプラインが受け付ける TeX サブセットの式
 * @param python Python 実行ファイル（`TYPESET_PYTHON`）。空なら描画しない
 * @returns PNG。描けなければ null（利用側はプレーン式にフォールバックする）
 */
export async function renderMathPng(tex: string, python: string): Promise<Buffer | null> {
  if (!python) return null;
  const out = join(CACHE_DIR, `${typesetKey(tex)}.png`);
  try {
    return await readFile(out);
  } catch {
    // キャッシュ無し → 描画する
  }
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await new Promise<void>((resolve, reject) => {
      execFile(
        python,
        [TYPESET_SCRIPT, tex, '-o', out, '--bg', 'white', '--cell', '3'],
        { timeout: TIMEOUT_MS },
        (err, _stdout, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve()),
      );
    });
    return await readFile(out);
  } catch (err) {
    logger.warn(`typeset failed (${tex}):`, err);
    return null;
  }
}

/**
 * 画像を Drive に 1 回だけ上げてファイル ID を返す。同じ sha1 の画像は再利用する。
 * @param kv `driveimg:<sha1>` → fileId を持つ KV（bot-state）
 * @param upload 実際のアップロード（MisskeyClient.uploadFile）
 */
export async function ensureDriveFile(
  tex: string,
  png: Buffer,
  alt: string,
  kv: { getState(key: string): string | null; setState(key: string, value: string): void },
  upload: (data: Buffer, name: string, comment?: string) => Promise<string>,
): Promise<string | null> {
  const key = `driveimg:${typesetKey(tex)}`;
  const cached = kv.getState(key);
  if (cached) return cached;
  try {
    const id = await upload(png, `calc-${typesetKey(tex).slice(0, 8)}.png`, alt);
    kv.setState(key, id);
    return id;
  } catch (err) {
    logger.warn('drive upload failed:', err);
    return null;
  }
}

/** テスト・手動確認用: `node dist/features/typeset.js "<tex>"` で描画結果のバイト数を出す */
if (process.argv[1]?.endsWith('typeset.js') && process.argv[2]) {
  const png = await renderMathPng(process.argv[2], process.env['TYPESET_PYTHON'] ?? '');
  console.log(png ? `${png.length} bytes` : 'null');
  await writeFile('.cache/typeset-cli.png', png ?? Buffer.alloc(0));
}
