import type { entities } from 'misskey-js';
import type { AIProvider } from '../../ai/provider.js';
import type { ReactionCategory } from './emoji-reaction-map.js';

type Note = entities.Note;

/** LLM が返せるカテゴリ（skip = リアクション不要） */
type LLMEmotionCategory = ReactionCategory | 'skip';

const LLM_VALID_CATEGORIES: ReadonlySet<string> = new Set<LLMEmotionCategory>([
  'achievement', 'tired', 'agree', 'interesting', 'cute', 'cheer', 'sympathy', 'skip',
]);

const LLM_SYSTEM_PROMPT = `You are an emotion classifier for short Japanese social media posts.
Classify the given post into exactly one category. Respond with ONLY the category name — no explanation, no punctuation.

Categories:
- achievement: 完成・達成・成功・公開などポジティブな報告
- tired: 疲れた・眠い・仕事終わりなど疲労の表現
- agree: 共感・同意・「わかる」系
- interesting: 面白い・発見・閃き・知的な気づき（ポジティブ文脈に限る）
- cute: かわいい・素敵・好き・尊い
- cheer: 頑張るぞ・作業開始・気合い
- sympathy: 悲しい・落ち込んでいる・辛い状況（優しく寄り添えるもの）
- skip: 否定的文脈・怒り・自己否定・複雑な感情・中傷・議論・長い愚痴・分類困難`;

/**
 * テキストを前処理してフィルタリング・分類に使えるクリーンなテキストに変換する。
 * メンション・URL・カスタム絵文字を除去し、空白を正規化する。
 */
function cleanText(text: string): string {
  return text
    .replace(/@[\w@.-]+/g, '')        // メンション除去 (@user@host 形式も対応)
    .replace(/https?:\/\/\S+/g, '')   // URL除去
    .replace(/:[\w_]+(?:@\.)?:/g, '') // カスタム絵文字除去
    .replace(/\s+/g, ' ')             // 空白正規化
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

  if (note.files && note.files.length > 0) return true;
  if (/\$\[|\?\[/.test(text)) return true;

  const emojiCount = (text.match(/:[\w_]+(?:@\.)?:/g) ?? []).length;
  if (emojiCount >= 3) return true;

  const cleaned = cleanText(text);
  if (cleaned.length === 0 || cleaned.length > 50) return true;

  return false;
}

/**
 * 挨拶系のみを正規表現で先行判定する（同期・LLM 不使用）。
 * 挨拶は文脈が最も明確なためルールベースで処理する。
 */
export function classifyGreeting(text: string): ReactionCategory | null {
  if (/おはよ[うーぅ]?|おっはよ|おはようございます/i.test(text)) return 'greeting_morning';
  if (/おやすみ(なさい)?|就寝|そろそろ寝|寝(ます|るね|ちゃう)|寝落ち/.test(text)) return 'greeting_night';
  if (/ただいま|帰った|帰宅|帰ってきた/.test(text)) return 'greeting_return';
  if (/いってきます|いってきま[すっ]|行ってきます|出かけ(ます|るね)/.test(text)) return 'greeting_leave';
  return null;
}

/**
 * LLM に感情カテゴリを分類させる（非同期）。
 * 失敗時は null を返す（スキップ扱い）。
 */
export async function classifyEmotionByLLM(
  text: string,
  ai: AIProvider,
): Promise<LLMEmotionCategory | null> {
  try {
    const response = await ai.chat(
      [
        { role: 'system', content: LLM_SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      { maxTokens: 20, temperature: 0 },
    );

    const raw = response.text.trim().toLowerCase();
    if (LLM_VALID_CATEGORIES.has(raw)) {
      return raw as LLMEmotionCategory;
    }
    // LLM が想定外の出力をした場合はスキップ
    return 'skip';
  } catch {
    return null;
  }
}

/**
 * ノートのテキストから感情・文脈カテゴリを判定するオーケストレーター（非同期）。
 *
 * 処理フロー:
 *   1. 挨拶系を正規表現で先行判定（LLM 不使用）
 *   2. 挨拶なし → LLM で感情カテゴリを判定
 *   3. LLM が 'skip' または失敗 → null（リアクション不要）
 */
export async function classifyNoteEmotion(
  note: Note,
  ai: AIProvider,
): Promise<ReactionCategory | null> {
  const text = cleanText(note.text ?? '');

  const greetingCategory = classifyGreeting(text);
  if (greetingCategory !== null) return greetingCategory;

  const llmCategory = await classifyEmotionByLLM(text, ai);
  if (llmCategory === null || llmCategory === 'skip') return null;
  return llmCategory;
}
