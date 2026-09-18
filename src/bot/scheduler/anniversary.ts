/**
 * F-11 / F-13 記念日の配信（毎朝1回）
 *
 * 判定ロジックは `features/anniversary.ts`（純関数）側にあり、ここは投稿だけを担当する。
 *   - ユーザーの誕生日 → 本人宛てメンション（会話相手キャラが担当・F-12B のタスク通知と同じ解決）
 *   - キャラクターの記念日 / 季節イベント → 週次担当キャラが公開投稿（1日まとめて1投稿）
 */

import type { AIProvider } from '../../ai/index.js';
import type { MisskeyClient } from '../../misskey/client.js';
import type { ActiveCharacterStore } from '../character/store.js';
import type { UserBirthdayStore } from '../../storage/birthday.js';
import { getReleasedCharacterByNum, getDefaultCharacterProfile, getReleasedCharacters } from '../character/loader.js';
import { buildCharacterSystemPrompt } from '../character/prompt-builder.js';
import {
  birthdayLookupDates,
  birthdayNumber,
  findCalendarEvents,
  findCharacterAnniversaries,
} from '../../features/anniversary.js';
import { formatSpeech } from '../responder/emoji.js';
import { logger } from '../../utils/logger.js';

export interface AnniversaryDeps {
  ai: AIProvider;
  misskeyClient: MisskeyClient;
  birthdayStore: UserBirthdayStore;
  activeCharacterStore: ActiveCharacterStore;
  /** 公開投稿を担当する週次担当キャラの番号 */
  schedulerCharNum: string;
  /** 公開投稿用のシステムプロンプト（担当キャラのカード。呼び出し元が構築して渡す） */
  schedulerSystemPrompt: string;
}

/** LLM で台詞を生成する。失敗したらフォールバック文をそのまま使う（配信自体は落とさない）。 */
async function generate(
  ai: AIProvider,
  systemPrompt: string,
  instruction: string,
  fallback: string,
): Promise<string> {
  try {
    const result = await ai.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: instruction },
      ],
      { maxTokens: 160, temperature: 0.9 },
    );
    return result.text.trim() || fallback;
  } catch (err) {
    logger.error('[Anniversary] LLM generation failed, falling back:', err);
    return fallback;
  }
}

/** JST の年月日を返す */
function jstYmd(nowMs: number): { year: number; month: number; day: number } {
  const jst = new Date(nowMs + 9 * 60 * 60 * 1000);
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1, day: jst.getUTCDate() };
}

/** ユーザーの誕生日を本人宛てに祝う（登録済みのユーザーのみ） */
async function celebrateUserBirthdays(deps: AnniversaryDeps, nowMs: number): Promise<number> {
  const { year, month, day } = jstYmd(nowMs);
  const targets = birthdayLookupDates(year, month, day).flatMap((d) =>
    deps.birthdayStore.listByDate(d.month, d.day),
  );

  let delivered = 0;
  for (const target of targets) {
    try {
      const charNum = deps.activeCharacterStore.resolve(target.userId);
      const profile = getReleasedCharacterByNum(charNum) ?? getDefaultCharacterProfile();
      const systemPrompt = buildCharacterSystemPrompt(profile, 'chat');
      const number = birthdayNumber(target.month, target.day);
      const mention = target.username
        ? `@${target.username}${target.userHost ? `@${target.userHost}` : ''} `
        : '';
      const text = await generate(
        deps.ai,
        systemPrompt,
        `今日は会話相手の誕生日です。お祝いのメッセージを50文字以内で生成してください（台詞のみ）。\n` +
          `誕生月日から出る誕生数は ${number} です。年齢や生年には一切触れないでください。`,
        `誕生日おめでとう！今日という日が君にとって特別な一日になりますように。`,
      );
      await deps.misskeyClient.postToUser(formatSpeech(charNum, `${mention}${text}`), target.userId);
      delivered += 1;
      logger.info(`[Anniversary] Birthday greeting delivered to ${target.userId}`);
    } catch (err) {
      logger.error(`[Anniversary] Failed to greet ${target.userId}:`, err);
    }
  }
  return delivered;
}

/**
 * キャラクターの記念日・季節イベントを 1 件の公開投稿にまとめて出す。
 * 該当が無ければ何も投稿せず false を返す（呼び出し元は通常の朝の自発投稿へフォールスルーする）。
 */
async function postPublicAnniversary(deps: AnniversaryDeps, nowMs: number): Promise<boolean> {
  const { month, day } = jstYmd(nowMs);
  const characters = findCharacterAnniversaries(month, day, getReleasedCharacters());
  const events = findCalendarEvents(month, day);
  if (characters.length === 0 && events.length === 0) return false;

  const topics: string[] = [];
  for (const c of characters) {
    const self = c.charNum === deps.schedulerCharNum;
    topics.push(
      c.isBirthday
        ? `${c.name} の誕生日${self ? '（あなた自身の誕生日です。自分の口から伝えてください）' : ''}`
        : `${c.name} の${c.about}${self ? '（あなた自身の記念日です）' : ''}`,
    );
  }
  for (const e of events) {
    topics.push(`${e.name}（${e.hint}）`);
  }

  const fallback =
    characters.length > 0
      ? `今日は ${characters[0]!.name} の${characters[0]!.isBirthday ? '誕生日' : characters[0]!.about}だよ。おめでとう。`
      : `今日は${events[0]!.name}だね。`;

  const text = await generate(
    deps.ai,
    deps.schedulerSystemPrompt,
    `今日の記念日についてお祝いのつぶやきを1つ投稿してください（台詞のみ・80文字以内）。\n` +
      `今日の記念日:\n- ${topics.join('\n- ')}\n` +
      `未公開の設定・台詞・ストーリーは作らず、上に挙げた事実の範囲でお祝いしてください。`,
    fallback,
  );

  await deps.misskeyClient.post(formatSpeech(deps.schedulerCharNum, text));
  logger.info(`[Anniversary] Public post sent (${month}/${day}): ${topics.join(' / ')}`);
  return true;
}

/**
 * 今日の記念日を配信する。
 * @returns 公開投稿を行ったら true（呼び出し元はその日の通常の朝投稿をスキップする）。
 *          ユーザー誕生日メンションだけの場合は false（宛先が違うので通常の朝投稿は出してよい）。
 */
export async function postTodaysAnniversaries(
  deps: AnniversaryDeps,
  nowMs: number,
): Promise<boolean> {
  await celebrateUserBirthdays(deps, nowMs);
  return postPublicAnniversary(deps, nowMs);
}
