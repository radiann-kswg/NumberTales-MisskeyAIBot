import { describe, it, expect } from 'vitest';
import { renderMathPng, ensureDriveFile, typesetKey } from '../dist/features/typeset.js';

/**
 * F-17C 数式画像の清書基盤。画像は常に上乗せなので、描けない環境では必ず null で返ること
 * （利用側がプレーン式にフォールバックする）を固定する。実際の描画は VM / WSL で確認する。
 */
describe('F-17C typeset — 描けないときは null', () => {
  it('TYPESET_PYTHON が空なら Python を呼ばずに null', async () => {
    expect(await renderMathPng('\\frac{1}{2}', '')).toBeNull();
  });

  it('Python が無い（実行ファイルが見つからない）なら null', async () => {
    expect(await renderMathPng('\\frac{1}{2}', '/nonexistent/python')).toBeNull();
  });
});

describe('F-17C typeset — Drive の一意化', () => {
  it('同じ式は 2 回目からアップロードしない', async () => {
    const kv = new Map<string, string>();
    const store = { getState: (k: string) => kv.get(k) ?? null, setState: (k: string, v: string) => void kv.set(k, v) };
    let uploads = 0;
    const upload = async () => { uploads++; return 'file-1'; };
    const png = Buffer.from('png');
    expect(await ensureDriveFile('\\frac{1}{2}', png, '1/2', store, upload)).toBe('file-1');
    expect(await ensureDriveFile('\\frac{1}{2}', png, '1/2', store, upload)).toBe('file-1');
    expect(uploads).toBe(1);
    expect(kv.get(`driveimg:${typesetKey('\\frac{1}{2}')}`)).toBe('file-1');
  });

  it('アップロードに失敗したら null（投稿自体は続行できる）', async () => {
    const store = { getState: () => null, setState: () => {} };
    const upload = async () => { throw new Error('boom'); };
    expect(await ensureDriveFile('x', Buffer.alloc(0), 'x', store, upload)).toBeNull();
  });
});
