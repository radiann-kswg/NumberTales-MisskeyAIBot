import { Stream, api as MisskeyApi, entities } from 'misskey-js';
import { logger } from '../utils/logger.js';

type Note = entities.Note;

export type MentionCallback = (note: Note) => void | Promise<void>;

/**
 * Misskey WebSocket クライアントラッパー
 * - WebSocket ストリーミング接続（自動再接続付き）
 * - main チャンネルのメンションイベント購読
 * - ノート返信投稿
 */
export class MisskeyClient {
  private readonly stream: Stream;
  private readonly apiClient: MisskeyApi.APIClient;

  constructor(
    private readonly origin: string,
    token: string,
  ) {
    this.apiClient = new MisskeyApi.APIClient({ origin, credential: token });
    this.stream = new Stream(origin, { token });

    this.stream.on('_connected_', () => {
      logger.info(`Misskey WebSocket connected: ${this.origin}`);
    });

    this.stream.on('_disconnected_', () => {
      logger.debug('Misskey WebSocket disconnected. Reconnecting...');
    });
  }

  /**
   * main チャンネルを購読してメンションイベントを受け取る
   * @param callback メンション受信時のコールバック
   */
  onMention(callback: MentionCallback): void {
    const channel = this.stream.useChannel('main');
    channel.on('mention', (note) => {
      void callback(note);
    });
    logger.info('Subscribed to mentions via main channel');
  }

  /**
   * ノートに返信投稿する
   * @param text 投稿本文
   * @param replyId 返信先ノート ID
   * @param options.cw CW（ContentWarning）テキスト。設定すると本文が折りたたまれる
   */
  async reply(
    text: string,
    replyId: string,
    options?: { cw?: string },
  ): Promise<void> {
    await this.apiClient.request('notes/create', {
      text,
      replyId,
      cw: options?.cw ?? undefined,
      visibility: 'home',
    });
  }

  /**
   * 自発投稿する（返信なし、ホーム公開）
   * @param text 投稿本文
   * @param options.cw CW（ContentWarning）テキスト
   */
  async post(text: string, options?: { cw?: string }): Promise<void> {
    await this.apiClient.request('notes/create', {
      text,
      cw: options?.cw ?? undefined,
      visibility: 'home',
    });
  }

  /**
   * 自分のユーザー ID を取得（自己メンション除外用）
   */
  async getMyUserId(): Promise<string> {
    const me = await this.apiClient.request('i', {});
    return me.id;
  }

  /** WebSocket 接続を閉じる */
  close(): void {
    this.stream.close();
  }
}
