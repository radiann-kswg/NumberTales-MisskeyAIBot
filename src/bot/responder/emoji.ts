/**
 * 絵文字付与ユーティリティ
 *
 * コアフォルダ絵文字の解決と、ナンバーテールズの発言書式への整形を行う。
 */
import type { EmojiInfo } from '../../misskey/client.js';

// ----------------------------------------------------------------
// コアフォルダ絵文字解決
// ----------------------------------------------------------------

/** Bot 起動時に設定するカスタム絵文字キャッシュ */
let _emojiCache: EmojiInfo[] = [];

/**
 * 絵文字キャッシュを設定する（Bot 起動時に一度だけ呼ぶ）。
 * @param emojis fetchEmojis() で取得した EmojiInfo 配列
 */
export function setEmojiCache(emojis: EmojiInfo[]): void {
  _emojiCache = emojis;
}

/**
 * キャラクター番号に対応するコアフォルダ絵文字を解決する。
 *
 * 解決優先度:
 *   1. `aphrnts{Num}_corefolder` という標準エイリアスが name / aliases に存在する
 *   2. `aphrnts{Num}` プレフィックスを持ち category または tags に `corefolder` を含む絵文字
 *   3. `aphrnts{Num}` プレフィックスを持つ絵文字の先頭一件
 *   4. 解決不能なら null
 *
 * @param num キャラクター番号文字列（例: '2', '30'）
 * @param emojis 参照する絵文字リスト（省略時はキャッシュを使用）
 */
export function resolveCoreFolderEmoji(num: string, emojis: EmojiInfo[] = _emojiCache): string | null {
  const n = parseInt(num, 10);
  const numStr = String(n);

  if (emojis.length === 0) {
    // キャッシュ未取得時は標準名でフォールバック
    return `aphrnts${numStr}_corefolder`;
  }

  const standardName = `aphrnts${numStr}_corefolder`;

  // 1. 標準エイリアスの完全一致
  for (const e of emojis) {
    if (e.name === standardName || e.aliases.includes(standardName)) return e.name;
  }

  const prefix = `aphrnts${numStr}`;

  // 2. 同プレフィックス + category または tags に 'corefolder' を含む
  for (const e of emojis) {
    if (!e.name.startsWith(prefix) && !e.aliases.some((a) => a.startsWith(prefix))) continue;
    const inCategory = e.category?.toLowerCase().includes('corefolder') ?? false;
    const inTags = e.tags.some((t) => t.toLowerCase().includes('corefolder'));
    if (inCategory || inTags) return e.name;
  }

  // 3. 同プレフィックスの先頭一件
  const fallback = emojis.find(
    (e) => e.name.startsWith(prefix) || e.aliases.some((a) => a.startsWith(prefix)),
  );
  if (fallback) return fallback.name;

  // 4. 解決不能
  return null;
}

/**
 * ナンバーテールズの発言書式に整形する
 *
 * 書式: `{num} :{解決済み絵文字名}:「{text}」`
 * 例:  `000 :aphrnts0_corefolder:「私は元気だよ！」`
 *
 * 絵文字名はキャッシュを参照して解決する。標準名が存在しない場合はタグ・エイリアスから補完する。
 * @param num キャラクター番号文字列（例: '000', '2'）
 * @param text 台詞テキスト
 */
export function formatSpeech(num: string, text: string): string {
  const n = parseInt(num, 10);
  const emojiName = resolveCoreFolderEmoji(String(n)) ?? `aphrnts${n}_corefolder`;
  return `${num} :${emojiName}:「${stripOuterQuote(text)}」`;
}

/**
 * LLM が自分で付けてきた外側の鉤括弧を1組だけ剥がす。
 *
 * 各プロンプトは「台詞テキストのみ返す」と指示しているが、モデルは低確率で
 * 「〜」ごと返してくる。formatSpeech が必ず「」を付けるため、そのままだと
 * `52 :emoji:「「おはよう」」` と二重になる。全発話がこの関数を通るのでここで一度だけ潰す。
 *
 * 先頭の開き括弧が**末尾で閉じている**ときだけ剥がすので、`「あ」と「い」` のような
 * 「外側1組ではない」文字列は壊さない。
 */
function stripOuterQuote(text: string): string {
  const t = text.trim();
  for (const [open, close] of [['「', '」'], ['『', '』']] as const) {
    if (!t.startsWith(open) || !t.endsWith(close)) continue;
    let depth = 0;
    for (let i = 0; i < t.length; i += 1) {
      if (t[i] === open) depth += 1;
      else if (t[i] === close && (depth -= 1) === 0) {
        return i === t.length - 1 ? t.slice(1, -1).trim() : t;
      }
    }
  }
  return t;
}
