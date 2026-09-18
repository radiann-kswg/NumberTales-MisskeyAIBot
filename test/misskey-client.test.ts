import { describe, it, expect, vi } from 'vitest';
import { MisskeyClient } from '../dist/misskey/client.js';

describe('MisskeyClient.reply — 添付で落ちたら本文だけ送り直す', () => {
  // コンストラクタは WebSocket を張るので、prototype から作って apiClient だけ差し込む
  const make = (request: ReturnType<typeof vi.fn>) =>
    Object.assign(Object.create(MisskeyClient.prototype), { apiClient: { request } }) as MisskeyClient;

  it('fileIds 付きが失敗したら fileIds なしで再送する', async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error('NO_SUCH_FILE')).mockResolvedValueOnce({});
    await make(request).reply('本文', 'note1', { fileIds: ['f1'] });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][1].fileIds).toEqual(['f1']);
    expect(request.mock.calls[1][1].fileIds).toBeUndefined();
  });

  it('添付なしの失敗はそのまま投げる（再送しない）', async () => {
    const request = vi.fn().mockRejectedValue(new Error('down'));
    await expect(make(request).reply('本文', 'note1')).rejects.toThrow('down');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
