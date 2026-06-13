import { Stream, ChannelConnection, api as MisskeyApi, entities } from 'misskey-js';
import type { Channels } from 'misskey-js';
import { logger } from '../utils/logger.js';

type Note = entities.Note;

export type MentionCallback = (note: Note) => void | Promise<void>;

/** サーバーに登録されているカスタム絵文字1件の情報 */
export interface EmojiInfo {
  name: string;
  aliases: string[];
  category: string | null;
  tags: string[];
}

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
   * 自発投稿する（返信なし、パブリック公開）
   *
   * フォロワー外のユーザーにも届くよう visibility=public を使用する。
   * 週次担当の就任挨拶や集計結果通知、時間帯スケジューラーからの自発投稿で利用される。
   * @param text 投稿本文
   * @param options.cw CW（ContentWarning）テキスト
   */
  async post(text: string, options?: { cw?: string }): Promise<void> {
    await this.apiClient.request('notes/create', {
      text,
      cw: options?.cw ?? undefined,
      visibility: 'public',
    });
  }

  /**
   * 投票（Poll）付きノートを投稿する（パブリックに公開）
   * @param text 投稿本文
   * @param choices 選択肢テキストの配列（2〜10件）
   * @param expiredAfterMs 締め切りまでのミリ秒（省略時は無期限）
   * @returns 作成されたノートの ID
   */
  async postPoll(
    text: string,
    choices: string[],
    expiredAfterMs?: number,
  ): Promise<string> {
    // misskey-js の notes/create は poll フィールドの型定義を公開していないため、
    // 実行時に正しく動作する形で型アサーションを使用する。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (this.apiClient.request as (endpoint: string, params: unknown) => Promise<unknown>)(
      'notes/create',
      {
        text,
        visibility: 'public',
        poll: {
          choices,
          expiredAfter: expiredAfterMs,
          multiple: false,
        },
      },
    );
    return (res as { createdNote: { id: string } }).createdNote.id;
  }

  /**
   * ノートの Poll 選択肢と票数を取得する
   * @param noteId 対象ノート ID
   * @returns 選択肢ごとの { text, votes } 配列。Poll がなければ空配列
   */
  async getPollChoices(noteId: string): Promise<Array<{ text: string; votes: number }>> {
    const note = await this.apiClient.request('notes/show', { noteId });
    const poll = (note as { poll?: { choices: Array<{ text: string; votes: number }> } }).poll;
    return poll?.choices ?? [];
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
   * globalTimeline チャンネルを購読してノートイベントを受け取る。
   * インスタンス設定で無効化されている場合は warn ログを出してスキップする。
   * @param callback ノート受信時のコールバック
   */
  onGlobalTL(callback: (note: Note) => void | Promise<void>): void {
    try {
      const channel = this.stream.useChannel('globalTimeline');
      channel.on('note', (note) => {
        void callback(note);
      });
      logger.info('Subscribed to globalTimeline');
    } catch (err) {
      logger.warn('Failed to subscribe to globalTimeline (may be disabled on this instance):', err);
    }
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

  /**
   * サーバーに登録されているカスタム絵文字の詳細一覧を取得する（認証不要）。
   * name・aliases・category・tags を保持した配列を返す。
   * @returns EmojiInfo の配列
   */
  async fetchEmojis(): Promise<EmojiInfo[]> {
    const res = await (this.apiClient.request as (endpoint: string, params: unknown) => Promise<unknown>)(
      'emojis',
      {},
    );
    const raw = (res as { emojis: Array<{ name: string; aliases?: string[]; category?: string | null; tags?: string[] }> }).emojis ?? [];
    return raw.map((e) => ({
      name: e.name,
      aliases: e.aliases ?? [],
      category: e.category ?? null,
      tags: e.tags ?? [],
    }));
  }

  /**
   * 指定ノートをリノート（セルフリノート用）する。
   *
   * 投票ノートのリマインドなど、パブリック公開のノートを再拡散する用途を想定し
   * visibility=public で投稿する。
   * @param noteId リノート対象のノート ID
   */
  async renote(noteId: string): Promise<void> {
    await (this.apiClient.request as (endpoint: string, params: unknown) => Promise<unknown>)(
      'notes/create',
      { renoteId: noteId, visibility: 'public' },
    );
  }

  /** WebSocket 接続を閉じる */
  close(): void {
    this.stream.close();
  }
}
