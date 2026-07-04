/**
 * F-12 タスク＆スケジュール管理 — 自然文からのタスク抽出・進捗計算・一覧整形・対象特定
 */
import type { AIProvider } from '../../ai/index.js';
import type { TaskRecord, TaskRemindType, TaskPriority, TaskDifficulty } from '../../storage/task.js';

/** remind_at 指定時の許容幅: 最短1分後 */
const MIN_LEAD_MS = 60 * 1000;
/** remind_at 指定時の許容幅: 最長365日以内 */
const MAX_LEAD_MS = 365 * 24 * 60 * 60 * 1000;

export type ExtractTaskResult =
  | {
      ok: true;
      title: string;
      dueAtMs: number | null;
      remindAtMs: number | null;
      remindType: TaskRemindType;
      priority: TaskPriority;
      difficulty: TaskDifficulty;
    }
  | { ok: false; reason: 'too_short' | 'too_far' | 'unparseable' };

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
  return `あなたは日本語の自然文からタスク登録情報を抽出するアシスタントです。
現在日時（JST）: ${formatJstNow(nowMs)}

ユーザーの発話を読み取り、必ず以下の JSON 形式のみを出力してください（説明文・コードブロック記法は付けないこと）:

{
  "title": "タスク名（短くまとめた自然文・30文字以内）",
  "remind_at_iso": "通知日時 ISO 8601（例: 2026-07-04T10:00:00+09:00）。不要なら null",
  "due_at_iso": "期日 ISO 8601。不要なら null",
  "remind_type": "todo | alert | schedule",
  "priority": "1(高) | 2(中) | 3(低)",
  "difficulty": "1(易) | 2(普通) | 3(難)"
}

- remind_type の判定基準: 「〇〇をやるのを忘れないようにして」「〇時に〇〇を教えて」のような通知希望は alert、
  「〇〇がある」「打ち合わせ/会議/イベント」のような予定・スケジュールは schedule、
  期日・時刻指定が特にない単純な ToDo は todo。
- priority（優先度）: 1=高（「急ぎ」「緊急」「重要」等） 2=中（デフォルト） 3=低（「後でいい」「余裕あり」等）
- difficulty（難易度）: 1=易（「簡単」「すぐできる」等） 2=普通（デフォルト） 3=難（「大変」「難しい」「複雑」等）
- 相対指定（「3時間後」「明日」「来週月曜」等）は現在日時を基準に絶対日時へ変換すること。
- 日時が全く読み取れない場合は remind_at_iso・due_at_iso ともに null にすること。`;
}

/**
 * 自然文からタスク登録情報を LLM で抽出する。
 * JSON パース不可・タイトル不明の場合は unparseable、remind_at の許容幅（1分後〜365日以内）外は
 * too_short / too_far を返す。
 */
export async function extractTaskRequest(
  text: string,
  ai: AIProvider,
  nowMs: number,
): Promise<ExtractTaskResult> {
  let raw: string;
  try {
    const result = await ai.chat(
      [
        { role: 'system', content: buildExtractionSystemPrompt(nowMs) },
        { role: 'user', content: text },
      ],
      { maxTokens: 200, temperature: 0.2 },
    );
    raw = result.text.trim();
  } catch {
    return { ok: false, reason: 'unparseable' };
  }

  const jsonMatch = /\{[\s\S]*\}/.exec(raw);
  if (!jsonMatch) return { ok: false, reason: 'unparseable' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return { ok: false, reason: 'unparseable' };
  }

  if (typeof parsed !== 'object' || parsed === null) return { ok: false, reason: 'unparseable' };
  const obj = parsed as Record<string, unknown>;

  const title = typeof obj['title'] === 'string' ? obj['title'].trim() : '';
  if (!title) return { ok: false, reason: 'unparseable' };

  const remindAtStr = typeof obj['remind_at_iso'] === 'string' ? obj['remind_at_iso'].trim() : '';
  const dueAtStr = typeof obj['due_at_iso'] === 'string' ? obj['due_at_iso'].trim() : '';

  const remindAtMs = remindAtStr ? new Date(remindAtStr).getTime() : NaN;
  const dueAtMs = dueAtStr ? new Date(dueAtStr).getTime() : NaN;

  if (remindAtStr && Number.isNaN(remindAtMs)) return { ok: false, reason: 'unparseable' };
  if (dueAtStr && Number.isNaN(dueAtMs)) return { ok: false, reason: 'unparseable' };

  if (!Number.isNaN(remindAtMs)) {
    const leadMs = remindAtMs - nowMs;
    if (leadMs < MIN_LEAD_MS) return { ok: false, reason: 'too_short' };
    if (leadMs > MAX_LEAD_MS) return { ok: false, reason: 'too_far' };
  }

  const remindTypeRaw = obj['remind_type'];
  const remindType: TaskRemindType =
    remindTypeRaw === 'alert' || remindTypeRaw === 'schedule' ? remindTypeRaw : 'todo';

  const priorityRaw = Number(obj['priority']);
  const priority: TaskPriority = priorityRaw === 1 || priorityRaw === 3 ? priorityRaw : 2;

  const difficultyRaw = Number(obj['difficulty']);
  const difficulty: TaskDifficulty = difficultyRaw === 1 || difficultyRaw === 3 ? difficultyRaw : 2;

  return {
    ok: true,
    title,
    dueAtMs: Number.isNaN(dueAtMs) ? null : dueAtMs,
    remindAtMs: Number.isNaN(remindAtMs) ? null : remindAtMs,
    remindType,
    priority,
    difficulty,
  };
}

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { 1: 3, 2: 2, 3: 1 };
const DIFFICULTY_WEIGHT: Record<TaskDifficulty, number> = { 1: 1, 2: 2, 3: 3 };

export interface TaskProgress {
  percent: number;
  doneCount: number;
  totalCount: number;
}

/**
 * 重み付き進捗％を計算する（キャンセル除外済みの todo+done タスク一覧を渡す）。
 * done は常に100%扱い、todo はタスクごとの progressPercent（未更新なら0）をそのまま使う。
 */
export function calculateProgress(tasks: TaskRecord[]): TaskProgress {
  if (tasks.length === 0) return { percent: 0, doneCount: 0, totalCount: 0 };

  let totalWeight = 0;
  let doneWeight = 0;
  let doneCount = 0;
  for (const t of tasks) {
    const weight = PRIORITY_WEIGHT[t.priority] * DIFFICULTY_WEIGHT[t.difficulty];
    const effectivePercent = t.status === 'done' ? 100 : t.progressPercent;
    totalWeight += weight;
    doneWeight += weight * (effectivePercent / 100);
    if (t.status === 'done') {
      doneCount++;
    }
  }
  const percent = totalWeight > 0 ? Math.floor((doneWeight / totalWeight) * 100) : 0;
  return { percent, doneCount, totalCount: tasks.length };
}

const PRIORITY_LABEL: Record<TaskPriority, string> = { 1: '高', 2: '中', 3: '低' };
const DIFFICULTY_LABEL: Record<TaskDifficulty, string> = { 1: '易', 2: '普', 3: '難' };
const CIRCLE_NUMS = ['①', '②', '③', '④', '⑤'] as const;

/**
 * アクティブなタスク一覧を CW 表示用に整形する（上位5件）。
 * 引数の並び順（TaskStore.listActive() の優先度→期日順）をそのまま番号に使う。
 * ここで独自に並び替えると、①②③の表示順と「○番」返信の解決順（listActive基準）が
 * ズレて別タスクを操作してしまうため、絶対に再ソートしないこと。
 */
export function formatTaskList(tasks: TaskRecord[]): string {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
  });
  const top = tasks.slice(0, 5);
  return top
    .map((t, i) => {
      const label = `[${PRIORITY_LABEL[t.priority]}・${DIFFICULTY_LABEL[t.difficulty]}]`;
      const dueLabel = t.dueAt !== null ? `（期日: ${formatter.format(new Date(t.dueAt))}）` : '';
      const progressLabel = t.progressPercent > 0 ? `（進捗${t.progressPercent}%）` : '';
      return `${CIRCLE_NUMS[i] ?? `${i + 1}.`} ${label} ${t.title}${dueLabel}${progressLabel}`;
    })
    .join('\n');
}

export type TaskTarget = { type: 'index'; value: number } | { type: 'query'; value: string };

/** タスク完了トリガーの語句除去用パターン（意図分類側の TASK_DONE_PATTERNS と活用形を揃えること） */
export const DONE_ACTION_PATTERN =
  /(が|を)?(終わ(った|り(ました|ます)?|って(る|います)?)|完了(した|しました|してる|しています)?|でき(た|ました|てる|ています)|やり終え(た|ました))/g;
/** タスクキャンセルトリガーの語句除去用パターン */
export const CANCEL_ACTION_PATTERN = /を?(キャンセル|削除|消して|取り消[しす])(して)?/g;
/** 進捗更新トリガーの語句除去用パターン（対象タスクのタイトル検索クエリを作るために剥がすノイズ） */
export const PROGRESS_ACTION_PATTERN =
  /(の)?進捗を?|(\d{1,3}\s*[%％])|に(?:して|する)|まで進(?:んだ|めた)|くらい|ぐらい/g;

/** 発話から進捗％の指定値（0-100）を抽出する。見つからなければ null */
export function extractProgressPercent(text: string): number | null {
  const match = /(\d{1,3})\s*[%％]/.exec(text);
  if (!match) return null;
  const value = parseInt(match[1]!, 10);
  if (Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, value));
}

/**
 * タスク特定対象を解析する。
 * 「○番」の番号指定を優先し、なければアクション語句を除いた残りを内容検索クエリとする。
 */
export function extractTaskTarget(text: string, actionPattern: RegExp): TaskTarget {
  const indexMatch = /(\d+)\s*番/.exec(text);
  if (indexMatch?.[1]) {
    return { type: 'index', value: parseInt(indexMatch[1], 10) };
  }
  const query = text
    .replace(/の?タスク/g, '')
    .replace(actionPattern, '')
    .replace(/[、。！？!?\s]/g, '')
    .trim();
  return { type: 'query', value: query };
}

/** title の部分一致候補を整形する（複数ヒット時の再入力促し用） */
export function formatCandidateList(candidates: TaskRecord[]): string {
  return candidates.map((t, i) => `${CIRCLE_NUMS[i] ?? `${i + 1}.`} ${t.title}`).join('\n');
}
