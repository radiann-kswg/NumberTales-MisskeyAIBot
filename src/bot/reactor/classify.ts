import type { entities } from 'misskey-js';
import type { ReactionCategory } from './emoji-reaction-map.js';

type Note = entities.Note;

/**
 * テキストを前処理してフィルタリング・分類に使えるクリーンなテキストに変換する。
 * メンション・URL・カスタム絵文字を除去し、空白を正規化する。
 */
function cleanText(text: string): string {
  return text
    .replace(/@[\w@.-]+/g, '')          // メンション除去 (@user@host 形式も対応)
    .replace(/https?:\/\/\S+/g, '')     // URL除去
    .replace(/:[\w_]+(?:@\.)?:/g, '')   // カスタム絵文字除去
    .replace(/\s+/g, ' ')               // 空白正規化
    .trim();
}

/**
 * リアクションを送るべきでないノートを判定する。
 *
 * スキップ条件:
 * - ファイル・画像の添付あり
 * - 高度なMFM（$[ や ?[ の使用）
 * - カスタム絵文字が3個以上（絵文字だらけの投稿）
 * - クリーン後テキストが50文字超（文脈が長く分類が困難）
 * - テキストが空
 */
export function shouldSkipReaction(note: Note): boolean {
  const text = note.text ?? '';

  // 1. ファイル・画像添付あり
  if (note.files && note.files.length > 0) return true;

  // 2. 高度なMFM（$[ = 変形アニメーション, ?[ = カスタムUI）
  if (/\$\[|\?\[/.test(text)) return true;

  // 3. カスタム絵文字が3個以上
  const emojiCount = (text.match(/:[\w_]+(?:@\.)?:/g) ?? []).length;
  if (emojiCount >= 3) return true;

  // 4. クリーン後テキスト長チェック
  const cleaned = cleanText(text);
  if (cleaned.length === 0 || cleaned.length > 50) return true;

  return false;
}

/**
 * ノートのテキストから感情・文脈カテゴリを判定する。
 *
 * 優先度順にパターンマッチし、最初にマッチしたカテゴリを返す。
 * いずれにもマッチしない場合は null（リアクション不要）を返す。
 */
export function classifyNoteEmotion(note: Note): ReactionCategory | null {
  const text = cleanText(note.text ?? '');

  // 挨拶系（文脈が最も明確なので最初に判定）
  if (/おはよ[うーぅ]?|おっはよ|おはようございます/i.test(text)) {
    return 'greeting_morning';
  }
  if (/おやすみ(なさい)?|就寝|そろそろ寝|寝(ます|るね|ちゃう)|寝落ち/.test(text)) {
    return 'greeting_night';
  }
  if (/ただいま|帰った|帰宅|帰ってきた/.test(text)) {
    return 'greeting_return';
  }
  if (/いってきます|いってきま[すっ]|行ってきます|出かけ(ます|るね)/.test(text)) {
    return 'greeting_leave';
  }

  // 完成・達成・成功報告
  if (/完成(した|しました|！|☆)?|できた(よ|！|ー)?|仕上げた|公開(した|しました)|リリース(した|しました)|終わった(よ|！)?|やった[！!ー]|成功(した)?|達成(した)?/.test(text)) {
    return 'achievement';
  }

  // 疲労・お疲れ
  if (/お?疲れ[様さ]?(でした)?|おつかれ|疲れた|ねむ[いっ]|眠[いっ]|仕事終わり|作業終わ/.test(text)) {
    return 'tired';
  }

  // 応援・気合い
  if (/頑張(ります|るぞ|るよ|るね)|やるぞ|いくぞ|作業(開始|はじめ|します|するよ)|今日も(よろしく|がんばる)/.test(text)) {
    return 'cheer';
  }

  // かわいい・素敵
  if (/かわい[いーっ！]|可愛い|素敵|きれい|キレイ|美しい|尊い|たいせつ|大切(だな|です)?/.test(text)) {
    return 'cute';
  }

  // 面白い・発見・知見
  if (/面白[いっ]|おもしろ[いっ]|発見|知見|閃いた|ひらめいた|天才|すごい発見/.test(text)) {
    return 'interesting';
  }

  // どのカテゴリにもマッチしない（リアクション不要）
  return null;
}
