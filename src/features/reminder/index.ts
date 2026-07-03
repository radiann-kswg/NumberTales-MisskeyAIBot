/**
 * F-12 リマインダー機能 — 自然文からのリクエスト抽出・一覧整形・キャンセル対象特定
 */
import type { AIProvider } from '../../ai/index.js';
import type { ReminderRecord } from '../../storage/reminder.js';

/** 最短リマインド時間: 5分後以上 */
const MIN_LEAD_MS = 5 * 60 * 1000;
/** 最長リマインド時間: 30日以内 */
const MAX_LEAD_MS = 30 * 24 * 60 * 60 * 1000;

export type ExtractReminderResult =
  | { ok: true; content: string; remindAtMs: number }
  | { ok: false; reason: 'unparseable' | 'too-soon' | 'too-far' };

/** 現在時刻を JST の可読な文字列に整形する（LLM プロンプトへの文脈埋め込み用） */
function formatJstNow(nowMs: number): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(nowMs));
}

function buildExtractionSystemPrompt(nowMs: number): string {
  return `あなたは日本語の自然文からリマインダー登録情報を抽出するアシスタントです。
現在日時（JST）: ${formatJstNow(nowMs)}

ユーザーの発話から「リマインドしてほしい内容」と「リマインドすべき日時」を読み取り、
必ず以下の JSON 形式のみを出力してください（説明文・コードブロック記法は一切付けないこと）:

{"content": "リマインド内容（体言止めや短い動詞句で簡潔に）", "remindAt": "YYYY-MM-DDTHH:mm:ss+09:00"}

- 相対指定（「3時間後」「明日」「来週月曜」等）は現在日時を基準に絶対日時へ変換すること。
- 日時が全く読み取れない場合は remindAt を空文字列にすること。
- 内容が読み取れない場合は content を空文字列にすること。`;
}

/**
 * 自然文からリマインダー登録情報（内容・日時）を LLM で抽出する。
 * JSON パース不可・日時不明・許容幅（5分後〜30日以内）外の場合はそれぞれ理由付きで失敗を返す。
 */
export async function extractReminderRequest(
  text: string,
  ai: AIProvider,
  nowMs: number,
): Promise<ExtractReminderResult> {
  let raw: string;
  try {
    const result = await ai.chat(
      [
        { role: 'system', content: buildExtractionSystemPrompt(nowMs) },
        { role: 'user', content: text },
      ],
      { maxTokens: 150, temperature: 0.2 },
    );
    raw = result.text.trim();
  } catch {
    return { ok: false, reason: 'unparseable' };
  }

  // コードブロック記法（```json ... ```）で返ってきた場合に備えて中身だけ取り出す
  const jsonMatch = /\{[\s\S]*\}/.exec(raw);
  if (!jsonMatch) return { ok: false, reason: 'unparseable' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return { ok: false, reason: 'unparseable' };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)['content'] !== 'string' ||
    typeof (parsed as Record<string, unknown>)['remindAt'] !== 'string'
  ) {
    return { ok: false, reason: 'unparseable' };
  }

  const content = ((parsed as Record<string, string>)['content']).trim();
  const remindAtStr = ((parsed as Record<string, string>)['remindAt']).trim();
  if (!content || !remindAtStr) return { ok: false, reason: 'unparseable' };

  const remindAtMs = new Date(remindAtStr).getTime();
  if (Number.isNaN(remindAtMs)) return { ok: false, reason: 'unparseable' };

  const leadMs = remindAtMs - nowMs;
  if (leadMs < MIN_LEAD_MS) return { ok: false, reason: 'too-soon' };
  if (leadMs > MAX_LEAD_MS) return { ok: false, reason: 'too-far' };

  return { ok: true, content, remindAtMs };
}

/** pending リマインダー一覧を表示用テキストに整形する（1-indexed） */
export function formatReminderList(reminders: ReminderRecord[]): string {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return reminders
    .map((r, i) => `${i + 1}. ${formatter.format(new Date(r.remindAt))} — ${r.content}`)
    .join('\n');
}

export type CancelTarget = { type: 'index'; value: number } | { type: 'content'; value: string };

/**
 * キャンセル対象の指定を解析する。
 * 「○番」のような番号指定を優先し、なければトリガーキーワードを除いた残りを内容検索クエリとする。
 */
export function extractCancelTarget(text: string): CancelTarget {
  const indexMatch = /(\d+)\s*番/.exec(text);
  if (indexMatch?.[1]) {
    return { type: 'index', value: parseInt(indexMatch[1], 10) };
  }
  const query = text
    .replace(/の?リマインダー/g, '')
    .replace(/を?(キャンセル|削除|消して|取り消[しす])(して)?/g, '')
    .trim();
  return { type: 'content', value: query };
}
