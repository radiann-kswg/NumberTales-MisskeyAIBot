/**
 * 週次担当キャラクター選出 — Poll 投稿・集計・就任処理（前提機能 B）
 *
 * スケジュール:
 *   日曜22:00 JST → 候補3名の Poll ノートを投稿（B-2）
 *   日曜23:59 JST → 投票集計・担当キャラクター確定（B-3）
 *   月曜07:00 JST → 就任挨拶投稿（B-4 連携）
 *
 * 担当キャラクターは BotStateStore の STATE_KEY_SCHEDULER_CHAR に保存する。
 */

import type { AIProvider } from '../../ai/index.js';
import type { MisskeyClient } from '../../misskey/client.js';
import { getReleasedCharacters, getDefaultCharacterProfile } from '../character/loader.js';
import type { CharacterRecord } from '../character/loader.js';
import {
  BotStateStore,
  STATE_KEY_SCHEDULER_CHAR,
  STATE_KEY_POLL_NOTE_ID,
  STATE_KEY_POLL_CANDIDATES,
} from '../../storage/bot-state.js';
import { logger } from '../../utils/logger.js';

// ----------------------------------------------------------------
// 候補選出ユーティリティ
// ----------------------------------------------------------------

/** released キャラクターからランダムに最大 N 件を重複なく抽出する */
function pickRandomCandidates(count: number): CharacterRecord[] {
  const pool = getReleasedCharacters().filter(
    (c) => String(c.Num) !== '000' && String(c.Num) !== '0' && String(c.Num) !== '00',
  );
  if (pool.length <= count) return pool;

  const result: CharacterRecord[] = [];
  const indices = new Set<number>();
  while (result.length < count) {
    const idx = Math.floor(Math.random() * pool.length);
    if (!indices.has(idx)) {
      indices.add(idx);
      result.push(pool[idx]!);
    }
  }
  return result;
}

// ----------------------------------------------------------------
// WeeklyPollScheduler クラス
// ----------------------------------------------------------------

export interface WeeklyPollDeps {
  ai: AIProvider;
  misskeyClient: MisskeyClient;
  botState: BotStateStore;
}

/**
 * 週次 Poll スケジューラー
 *
 * 10分ごとにチェックし、該当時刻に発火する。
 * 同一時刻での二重発火を防ぐため、各処理の完了フラグを日付 + 処理種別で管理する。
 */
export class WeeklyPollScheduler {
  private lastActionKey: string | null = null;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: WeeklyPollDeps) {}

  start(): void {
    this.intervalHandle = setInterval(
      () => void this.tick(),
      10 * 60 * 1000, // 10分ごと
    );
    logger.info('WeeklyPollScheduler started');
  }

  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /** 現在の JST 時刻 (曜日, 時, 分) を返す */
  private getJSTTime(): { dayOfWeek: number; hour: number; minute: number } {
    const now = new Date();
    // UTC+9
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return {
      dayOfWeek: jst.getUTCDay(), // 0=日, 1=月, ...
      hour: jst.getUTCHours(),
      minute: jst.getUTCMinutes(),
    };
  }

  private makeActionKey(type: string): string {
    const { dayOfWeek, hour } = this.getJSTTime();
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    // 年月日+種別でユニークなキー
    const dateStr = jst.toISOString().slice(0, 10);
    return `${dateStr}_${type}_dow${dayOfWeek}_h${hour}`;
  }

  private async tick(): Promise<void> {
    const { dayOfWeek, hour, minute } = this.getJSTTime();

    // 日曜22:00 → Poll 投稿
    if (dayOfWeek === 0 && hour === 22 && minute < 10) {
      const key = this.makeActionKey('poll_post');
      if (this.lastActionKey !== key) {
        this.lastActionKey = key;
        await this.handlePollPost();
      }
      return;
    }

    // 日曜23:55〜23:59 → 集計・担当確定
    if (dayOfWeek === 0 && hour === 23 && minute >= 55) {
      const key = this.makeActionKey('poll_tally');
      if (this.lastActionKey !== key) {
        this.lastActionKey = key;
        await this.handlePollTally();
      }
      return;
    }

    // 月曜07:00 → 就任挨拶（PostScheduler が担当するため、ここでは担当フラグのログのみ）
    if (dayOfWeek === 1 && hour === 7 && minute < 10) {
      const key = this.makeActionKey('inauguration_log');
      if (this.lastActionKey !== key) {
        this.lastActionKey = key;
        const charNum = this.deps.botState.getState(STATE_KEY_SCHEDULER_CHAR);
        logger.info(`[WeeklyPoll] 今週の担当: ${charNum ?? '000(チトセ)'}`);
      }
    }
  }

  // ----------------------------------------------------------------
  // B-2: Poll ノート投稿
  // ----------------------------------------------------------------

  async handlePollPost(): Promise<void> {
    try {
      const candidates = pickRandomCandidates(3);
      if (candidates.length === 0) {
        logger.warn('[WeeklyPoll] 候補キャラクターが見つかりません。000(チトセ)をデフォルト担当に設定します。');
        this.deps.botState.setState(STATE_KEY_SCHEDULER_CHAR, '000');
        return;
      }

      const choiceLabels = candidates.map((c) => `${String(c.Num)}（${c.Name ?? String(c.Num)}）`);
      const candidateNums = candidates.map((c) => String(c.Num));

      // 候補番号を保存（集計時に参照するため）
      this.deps.botState.setState(STATE_KEY_POLL_CANDIDATES, JSON.stringify(candidateNums));

      const pollText =
        '今週のつぶやき担当はだれにしようかな？\n日曜23:59に締め切り、最多票のキャラクターが翌週の担当になるよ :chitose_hm:';

      // 約2時間後（23:59）に締め切り
      const expiredAfterMs = 2 * 60 * 60 * 1000;

      const noteId = await this.deps.misskeyClient.postPoll(
        pollText,
        choiceLabels,
        expiredAfterMs,
      );

      this.deps.botState.setState(STATE_KEY_POLL_NOTE_ID, noteId);
      logger.info(`[WeeklyPoll] Poll 投稿完了: noteId=${noteId}, 候補=${candidateNums.join('/')}`);
    } catch (err) {
      logger.error('[WeeklyPoll] Poll 投稿エラー:', err);
    }
  }

  // ----------------------------------------------------------------
  // B-3: 集計・担当確定
  // ----------------------------------------------------------------

  async handlePollTally(): Promise<void> {
    try {
      const noteId = this.deps.botState.getState(STATE_KEY_POLL_NOTE_ID);
      const candidatesJson = this.deps.botState.getState(STATE_KEY_POLL_CANDIDATES);

      if (!noteId || !candidatesJson) {
        logger.warn('[WeeklyPoll] Poll ノートID または候補リストが見つかりません。担当をデフォルトに設定します。');
        this.deps.botState.setState(STATE_KEY_SCHEDULER_CHAR, '000');
        return;
      }

      const candidateNums: string[] = JSON.parse(candidatesJson) as string[];

      // Poll 結果取得
      const choices = await this.deps.misskeyClient.getPollChoices(noteId);

      let winnerNum: string;

      if (choices.length > 0 && choices.some((c) => c.votes > 0)) {
        // 最多票を取得
        const maxVotes = Math.max(...choices.map((c) => c.votes));
        const topChoices = choices.filter((c) => c.votes === maxVotes);

        // 同票の場合は抽選
        const winner = topChoices[Math.floor(Math.random() * topChoices.length)]!;
        // choiceラベルから番号を取得（候補番号のインデックスで対応）
        const winnerIdx = choices.indexOf(winner);
        winnerNum = candidateNums[winnerIdx] ?? '000';
      } else {
        // 票ゼロ → 候補から抽選
        winnerNum = candidateNums[Math.floor(Math.random() * candidateNums.length)] ?? '000';
        logger.info('[WeeklyPoll] 票ゼロのため候補から抽選で担当を決定しました。');
      }

      this.deps.botState.setState(STATE_KEY_SCHEDULER_CHAR, winnerNum);

      // 使用済みキーをクリア
      this.deps.botState.deleteState(STATE_KEY_POLL_NOTE_ID);
      this.deps.botState.deleteState(STATE_KEY_POLL_CANDIDATES);

      logger.info(`[WeeklyPoll] 今週の担当キャラクターを確定: ${winnerNum}`);

      // 担当確定投稿（翌朝の就任挨拶はスケジューラーが担当するため、ここでは確定通知のみ）
      await this.postTallyResult(winnerNum);
    } catch (err) {
      logger.error('[WeeklyPoll] 集計エラー:', err);
    }
  }

  /** 集計結果の通知投稿 */
  private async postTallyResult(winnerNum: string): Promise<void> {
    try {
      const characters = getReleasedCharacters();
      const winner = characters.find((c) => String(c.Num) === winnerNum);
      const winnerName = winner?.Name ?? `${winnerNum}番機`;
      const text = `今週のつぶやき担当は **${winnerName}** に決まったよ！よろしくね :chitose_wave:`;
      await this.deps.misskeyClient.post(text);
    } catch (err) {
      logger.error('[WeeklyPoll] 集計結果投稿エラー:', err);
    }
  }

  // ----------------------------------------------------------------
  // 就任挨拶（B-4 から呼び出される）
  // ----------------------------------------------------------------

  /**
   * 担当キャラクターの就任挨拶テキストを LLM で生成して投稿する。
   * PostScheduler の月曜7時スロットから呼び出す想定。
   */
  async postInaugurationGreeting(): Promise<void> {
    const winnerNum = this.deps.botState.getState(STATE_KEY_SCHEDULER_CHAR) ?? '000';
    const characters = getReleasedCharacters();
    const winner = characters.find((c) => String(c.Num) === winnerNum) ?? getDefaultCharacterProfile();
    const winnerName = winner.Name ?? `${winnerNum}番機`;

    try {
      const result = await this.deps.ai.chat(
        [
          {
            role: 'system',
            content: `あなたはナンバーテールズの「${winnerName}」として、今週の担当キャラクターとして就任の一言を投稿します。
このキャラクターの性格概要: ${winner.Character ?? '中性的でフレンドリー'}
一人称: ${typeof winner.FirstPersonCalling === 'string' ? winner.FirstPersonCalling.split('\n')[0]!.split('※')[0]!.trim().split(/[,/]/)[0]!.trim() : '私'}
【制約】
- 台詞テキストのみ出力（書式は呼び出し元が付与する）
- 50文字以内
- 反社会的・性的表現は禁止
- 未公開設定は使用しない`,
          },
          {
            role: 'user',
            content: '今週の担当キャラクターとして、フォロワーへの就任の一言をひとつつぶやいてください。',
          },
        ],
        { maxTokens: 80, temperature: 0.9 },
      );

      const greetingText = `【今週の担当: ${winnerName}】\n${result.text.trim()}`;
      await this.deps.misskeyClient.post(greetingText);
      logger.info(`[WeeklyPoll] 就任挨拶投稿: ${winnerName}`);
    } catch (err) {
      logger.error('[WeeklyPoll] 就任挨拶投稿エラー:', err);
    }
  }
}
