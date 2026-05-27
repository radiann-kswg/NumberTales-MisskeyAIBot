import { Stream, ChannelConnection, api as MisskeyApi, entities } from 'misskey-js';
import type { Channels } from 'misskey-js';
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
  private readonly mainCh: ChannelConnection<Channels['main']>;

  constructor(
    private readonly origin: string,
    token: string,
  ) {
    this.apiClient = new MisskeyApi.APIClient({ origin, credential: token });
    this.stream = new Stream(origin, { token });
    this.mainCh = this.stream.useChannel('main');

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
    this.mainCh.on('mention', (note) => {
      void callback(note);
    });
    logger.info('Subscribed to mentions via main channel');
  }

  /**
   * main チャンネルのフォローイベントを受け取る
   * @param callback フォロー受信時のコールバック
   */
  onFollowed(callback: (user: entities.UserDetailed | entities.UserLite) => void | Promise<void>): void {
    this.mainCh.on('followed', (user) => {
      void callback(user);
    });
    logger.info('Subscribed to followed events via main channel');
  }

  /**
   * 指定ユーザーをフォローする
   * @param userId フォロー対象のユーザー ID
   */
  async follow(userId: string): Promise<void> {
    await this.apiClient.request('following/create', { userId });
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

  /**
   * homeTimeline チャンネルを購読してノートイベントを受け取る
   * @param callback ノート受信時のコールバック
   */
  onHomeTL(callback: (note: Note) => void | Promise<void>): void {
    const channel = this.stream.useChannel('homeTimeline');
    channel.on('note', (note) => {
      void callback(note);
    });
    logger.info('Subscribed to homeTimeline');
  }

  /**
   * ノートにカスタム絵文字リアクションを付与する
   * @param noteId 対象ノート ID
   * @param emojiName 絵文字名（:と@.なし。例: iine_aphrnts42）
   */
  async react(noteId: string, emojiName: string): Promise<void> {
    await this.apiClient.request('notes/reactions/create', {
      noteId,
      reaction: `:${emojiName}@.:`,
    });
  }

  /** WebSocket 接続を閉じる */
  close(): void {
    this.stream.close();
  }
}
