/**
 * 絵文字付与ユーティリティ
 *
 * 意図・コンテキストに応じてインスタンスのカスタム絵文字をテキストに付与する。
 */
import { EMOJI_POOL, type EmojiContext } from './templates/emoji-map.js';

/**
 * コンテキストに対応する絵文字プールからランダムに1つ選ぶ
 */
export function pickEmoji(context: EmojiContext): string {
  const pool = EMOJI_POOL[context];
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx] as string;
}

/**
 * テキストの末尾に絵文字を付与する（Misskey カスタム絵文字形式）
 */
export function appendEmoji(text: string, emojiName: string): string {
  return `${text} :${emojiName}:`;
}

/**
 * ナンバーテールズの発言書式に整形する
 *
 * 書式: `{num} :{aphrnts{n}_corefolder}:「{text}」`
 * 例:  `000 :aphrnts0_corefolder:「私は元気だよ！」`
 *
 * @param num キャラクター番号文字列（例: '000'）
 * @param text 台詞テキスト
 */
export function formatSpeech(num: string, text: string): string {
  const n = parseInt(num, 10);
  return `${num} :aphrnts${n}_corefolder:「${text}」`;
}
