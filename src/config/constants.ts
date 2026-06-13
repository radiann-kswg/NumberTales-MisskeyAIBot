export const BOT_CONSTANTS = {
  /** 日常投稿の最大文字数（仕様: 100文字以内） */
  MAX_NOTE_LENGTH: 100,

  /** 000(チトセ) のキャラクター番号 */
  CHITOSE_NUM: '000',

  /** 10(ミツル) のキャラクター番号（ハラスメント L3 仲介担当） */
  MITSURU_NUM: '10',

  /** 自発投稿のデフォルト公開範囲（ホーム投稿: フォロワーのみTLに流れる） */
  DEFAULT_VISIBILITY: 'home' as const,

  /** コアフォルダ形態へのキーワードトリガー（暫定） */
  CORE_FOLDER_TRIGGERS: ['もふもふ', 'コアフォルダ', '球体型', 'ぷに', 'ぽてぽて'] as const,

  /** ヒューマノイド形態へのキーワードトリガー */
  HUMANOID_TRIGGERS: ['人型モード', 'ヒューマノイド'] as const,

  /** グローバルTL監視対象ハッシュタグ（F-03） */
  NT_RELATED_HASHTAGS: ['ナンバーテールズ', 'ナンバーテールズの主人より'] as const,

  /**
   * グローバルTL即時スキップワード。
   * LLM を呼ぶ前段階で確実に除外すべき語を列挙する。
   * 運用環境に応じて追加・調整すること。
   */
  NT_BLOCKLIST: [] as string[],

  /** スケジューラーの投稿チェック間隔（10分） */
  SCHEDULER_CHECK_INTERVAL_MS: 10 * 60 * 1000,

  /** スケジューラークールダウン: 最短1時間 */
  SCHEDULER_MIN_COOLDOWN_MS: 60 * 60 * 1000,

  /** スケジューラークールダウン: 最長2時間 */
  SCHEDULER_MAX_COOLDOWN_MS: 2 * 60 * 60 * 1000,
} as const;
