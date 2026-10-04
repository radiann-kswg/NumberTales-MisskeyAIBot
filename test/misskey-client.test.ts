import { describe, it, expect, vi } from 'vitest';
import { MisskeyClient } from '../dist/misskey/client.js';

describe('MisskeyClient.reply — Drive ファイル不在時だけ本文を送り直す', () => {
  // コンストラクタは WebSocket を張るので、prototype から作って apiClient だけ差し込む
  const make = (request: ReturnType<typeof vi.fn>) =>
    Object.assign(Object.create(MisskeyClient.prototype), { apiClient: { request } }) as MisskeyClient;

  const missingFile = { code: 'NO_SUCH_FILE', message: 'Some files are not found.' };

  it('NO_SUCH_FILE なら fileIds なしで一度だけ再送し、本文・返信先・CW・公開範囲を保つ', async () => {
    const request = vi.fn().mockRejectedValueOnce(missingFile).mockResolvedValueOnce({});
    await make(request).reply('本文', 'note1', { cw: '注釈', fileIds: ['f1'] });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenNthCalledWith(1, 'notes/create', {
      text: '本文', replyId: 'note1', cw: '注釈', visibility: 'home', fileIds: ['f1'],
    });
    expect(request).toHaveBeenNthCalledWith(2, 'notes/create', {
      text: '本文', replyId: 'note1', cw: '注釈', visibility: 'home', fileIds: undefined,
    });
  });

  it.each([
    new TypeError('fetch failed'),
    new DOMException('Timed out', 'TimeoutError'),
    { code: 'INTERNAL_ERROR', kind: 'server' },
    { code: 'RATE_LIMIT_EXCEEDED', kind: 'client' },
    { code: 'NO_SUCH_REPLY_TARGET' },
    new Error('NO_SUCH_FILE'),
    null,
    undefined,
  ])('添付があってもファイル不在以外のエラーは再送せず投げ直す: %s', async (error) => {
    const request = vi.fn().mockRejectedValue(error);
    await expect(make(request).reply('本文', 'note1', { fileIds: ['f1'] })).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('再送が失敗したらそのエラーを投げ、三度目は送らない', async () => {
    const error = new Error('down');
    const request = vi.fn().mockRejectedValueOnce(missingFile).mockRejectedValueOnce(error);
    await expect(make(request).reply('本文', 'note1', { fileIds: ['f1'] })).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('添付が空のときは NO_SUCH_FILE でも再送しない', async () => {
    const request = vi.fn().mockRejectedValue(missingFile);
    await expect(make(request).reply('本文', 'note1', { fileIds: [] })).rejects.toBe(missingFile);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('添付なしの失敗はそのまま投げる（再送しない）', async () => {
    const request = vi.fn().mockRejectedValue(new Error('down'));
    await expect(make(request).reply('本文', 'note1')).rejects.toThrow('down');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
