/**
 * 週次担当キャラクター選出 — Poll 投稿・集計・就任処理（前提機能 B）
 *
 * スケジュール:
 *   土曜0:00 JST → 候補3名の Poll ノートを投稿（B-2）
 *   月曜0:00 JST → 投票集計・担当キャラクター確定（B-3）
 *   月曜07:00 JST → 就任挨拶投稿（B-4 連携）
 *
 * 担当キャラクターは BotStateStore の STATE_KEY_SCHEDULER_CHAR に保存する。
 */

import type { AIProvider } from '../../ai/index.js';
import type { MisskeyClient, EmojiInfo } from '../../misskey/client.js';
import { getReleasedCharacters, getDefaultCharacterProfile } from '../character/loader.js';
import type { CharacterRecord } from '../character/loader.js';
import {
  BotStateStore,
  STATE_KEY_SCHEDULER_CHAR,
  STATE_KEY_POLL_NOTE_ID,
  STATE_KEY_POLL_CANDIDATES,
  STATE_KEY_PREV_POLL_CANDIDATES,
} from '../../storage/bot-state.js';
import { formatSpeech, resolveCoreFolderEmoji } from '../responder/emoji.js';
import { logger } from '../../utils/logger.js';

// ----------------------------------------------------------------
// 候補選出ユーティリティ
// ----------------------------------------------------------------

/**
 * Poll 候補として除外する固定キャラクター番号（文字列）のセット。
 * 000(チトセ)・1(ハジメ)・10(ミツル) および 0・00（開発者相当キャラ）を対象とする。
 */
const FIXED_EXCLUDE_NUMS = new Set(['000', '0', '00', '1', '10']);

/** キャラクター番号が Poll 候補として有効な形式かどうかを判定する */
function isEligibleNum(num: string | number): boolean {
  const s = String(num).trim();
  // 固定除外リスト
  if (FIXED_EXCLUDE_NUMS.has(s)) return false;
  // ハイフン含む特殊番号（2-alt, 10-alt, 67-old など）
  if (s.includes('-')) return false;
  return true;
}

/** Progress が公開済み（候補対象）かどうかを判定する */
function isEligibleProgress(progress?: string): boolean {
  return progress === 'released' || progress === 'released(beta)';
}

// resolveCoreFolderEmoji は emoji.ts に一元化済み

/**
 * キャラクターのコアフォルダ絵文字がサーバーに登録されているかを確認する。
 * emojis が空（取得失敗時）の場合はチェックをスキップして true を返す。
 */
function hasCoreFolderEmoji(num: string | number, emojis: EmojiInfo[]): boolean {
  if (emojis.length === 0) return true;
  return resolveCoreFolderEmoji(String(num), emojis) !== null;
}

/**
 * Tier ごとの抽選重み（各キャラクターへの相対的な選出しやすさ）。
 *   Tier 1 (ConversationPattern あり): 高め
 *   Tier 2 (Character/Summary 等あり): 低め
 *   Tier 3 (基本情報のみ):           最小
 */
const TIER_WEIGHTS: Record<1 | 2 | 3, number> = { 1: 15, 2: 3, 3: 1 };

/**
 * キャラクターの口調情報充実度に応じて優先度 Tier を返す。
 *   Tier 1: ConversationPattern が収録されている（最優先）
 *   Tier 2: Character / Summary / Relation.Commented のいずれかで口調補完が可能
 *   Tier 3: それ以外（基本情報のみ）
 */
function getCharTier(c: CharacterRecord): 1 | 2 | 3 {
  if (c.ConversationPattern) return 1;
  if ((c.Character_JP ?? c.Character) ?? (c.Summary_JP ?? c.Summary) ?? c.Relation?.Commented) return 2;
  return 3;
}

/**
 * 重み付きランダムサンプリング（重複なし）。
 * 各要素の weight に比例した確率で count 件選出する。
 */
function weightedSampleWithoutReplacement<T>(
  items: Array<{ item: T; weight: number }>,
  count: number,
): T[] {
  const pool = [...items];
  const result: T[] = [];
  while (result.length < count && pool.length > 0) {
    const totalWeight = pool.reduce((sum, e) => sum + e.weight, 0);
    let rand = Math.random() * totalWeight;
    let chosen = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      rand -= pool[i]!.weight;
      if (rand <= 0) { chosen = i; break; }
    }
    result.push(pool[chosen]!.item);
    pool.splice(chosen, 1);
  }
  return result;
}

/**
 * 重み付き抽選でキャラクター候補を選出する。
 * @param count 選出する件数
 * @param validEmojiNames 有効な絵文字名セット
 * @param excludeNums 除外するキャラクター番号セット（前週候補など）
 */
function pickTieredCandidates(
  count: number,
  emojis: EmojiInfo[],
  excludeNums: Set<string> = new Set(),
): CharacterRecord[] {
  const buildPool = (excluded: Set<string>) =>
    getReleasedCharacters().filter(
      (c) =>
        isEligibleNum(c.Num) &&
        isEligibleProgress(c.Progress) &&
        hasCoreFolderEmoji(c.Num, emojis) &&
        !excluded.has(String(c.Num)),
    );

  let pool = buildPool(excludeNums);

  // 除外後にプールが count 未満になった場合は除外なしで再構築
  if (pool.length < count) {
    logger.info('[WeeklyPoll] 前週候補を除外後の候補数が不足したため、除外なしで選出します。');
    pool = buildPool(new Set());
  }

  if (pool.length === 0) return [];

  const weighted = pool.map((c) => ({ item: c, weight: TIER_WEIGHTS[getCharTier(c)] }));
  return weightedSampleWithoutReplacement(weighted, Math.min(count, pool.length));
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
  /** Bot 起動時に取得したカスタム絵文字詳細配列（サイズ 0 = 取得失敗 = チェックスキップ） */
  private cachedEmojis: EmojiInfo[] = [];
  /** 二重発火防止用の処理済みキーセット（土曜0時にリセット） */
  private processedKeys: Set<string> = new Set();

  constructor(private readonly deps: WeeklyPollDeps) {}

  start(): void {
    // 絵文字一覧をキャッシュ（失敗しても起動は継続）
    void this.deps.misskeyClient.fetchEmojis().then((list) => {
      this.cachedEmojis = list;
      logger.info(`[WeeklyPoll] Emoji cache loaded: ${list.length} emojis`);
    }).catch((err: unknown) => {
      logger.warn('[WeeklyPoll] 絵文字一覧の取得に失敗しました。絵文字チェックをスキップします。', err);
    });

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

    // 土曜0:00 → processedKeys リセット + Poll 投稿
    if (dayOfWeek === 6 && hour === 0 && minute < 10) {
      const key = this.makeActionKey('poll_post');
      if (!this.processedKeys.has(key)) {
        this.processedKeys.clear(); // 新しい週のためリセット
        this.processedKeys.add(key);
        await this.handlePollPost();
      }
      return;
    }

    // 土曜 or 日曜の 7〜23 時の整時 → セルフリノート
    if ((dayOfWeek === 6 || dayOfWeek === 0) && hour >= 7 && hour < 24 && minute < 10) {
      // 土曜0時の投票直後（hour === 0）はリノートしない（上のブロックで処理済み）
      // ただし土曜0時はこのブロックには入らない（hour >= 7 の条件で除外されている）
      const key = this.makeActionKey('poll_renote');
      if (!this.processedKeys.has(key)) {
        this.processedKeys.add(key);
        await this.handlePollRenote();
      }
      return;
    }

    // 月曜0:00〜0:09 → 集計・担当確定（Poll 期間 48h 終了直後）
    if (dayOfWeek === 1 && hour === 0 && minute < 10) {
      const key = this.makeActionKey('poll_tally');
      if (!this.processedKeys.has(key)) {
        this.processedKeys.add(key);
        await this.handlePollTally();
      }
      return;
    }

    // 月曜07:00 → 担当フラグのログ（就任挨拶は PostScheduler が担当）
    if (dayOfWeek === 1 && hour === 7 && minute < 10) {
      const key = this.makeActionKey('inauguration_log');
      if (!this.processedKeys.has(key)) {
        this.processedKeys.add(key);
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
      // 前週候補を読み込み、今週の選出対象から除外する
      const prevJson = this.deps.botState.getState(STATE_KEY_PREV_POLL_CANDIDATES);
      const prevNums: Set<string> = prevJson
        ? new Set(JSON.parse(prevJson) as string[])
        : new Set();

      const candidates = pickTieredCandidates(3, this.cachedEmojis, prevNums);
      if (candidates.length === 0) {
        logger.warn('[WeeklyPoll] 候補キャラクターが見つかりません。000(チトセ)をデフォルト担当に設定します。');
        this.deps.botState.setState(STATE_KEY_SCHEDULER_CHAR, '000');
        return;
      }

      const choiceLabels = candidates.map((c) => {
        const emojiName = resolveCoreFolderEmoji(String(c.Num), this.cachedEmojis)
          ?? `aphrnts${String(c.Num)}_corefolder`;
        return `${c.Name ?? `${String(c.Num)}番機`} :${emojiName}:`;
      });
      const candidateNums = candidates.map((c) => String(c.Num));

      // 今週の候補を保存（集計時参照 + 次週の除外用）
      this.deps.botState.setState(STATE_KEY_POLL_CANDIDATES, JSON.stringify(candidateNums));
      this.deps.botState.setState(STATE_KEY_PREV_POLL_CANDIDATES, JSON.stringify(candidateNums));

      const pollText =
          '000 :aphrnts0_corefolder: 「クライアント君！今週の投稿担当は誰がいい？\n最多票のキャラクターが翌週の担当になるよ」\n<small>※投票締め切り：日曜23:59\n※同数票もしくは投票なしの場合は、同数票の中から抽選で選出されます。</small>';

      // 投票期間: 48時間（土曜0:00 → 日曜23:59）
      const expiredAfterMs = 48 * 60 * 60 * 1000;

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

  /** 集計結果の通知投稿（000(チトセ) として投稿） */
  private async postTallyResult(winnerNum: string): Promise<void> {
    try {
      const characters = getReleasedCharacters();
      const winner = characters.find((c) => String(c.Num) === winnerNum);
      const winnerName = winner?.Name ?? `${winnerNum}番機`;
      const text = formatSpeech(
        '000',
        `今週のつぶやき担当は${winnerName}に決まったよ！よろしくね`,
      );
      await this.deps.misskeyClient.post(text);
    } catch (err) {
      logger.error('[WeeklyPoll] 集計結果投稿エラー:', err);
    }
  }

  // ----------------------------------------------------------------
  // セルフリノート（投票中のリマインド）
  // ----------------------------------------------------------------

  /**
   * 投票中の Poll ノートをセルフリノートしてリマインドする。
   * Poll ノートが存在しない（投票期間外）場合は何もしない。
   */
  private async handlePollRenote(): Promise<void> {
    const noteId = this.deps.botState.getState(STATE_KEY_POLL_NOTE_ID);
    if (!noteId) return; // 投票ノートが存在しない場合はスキップ

    try {
      await this.deps.misskeyClient.renote(noteId);
      logger.info(`[WeeklyPoll] Poll リノート完了: noteId=${noteId}`);
    } catch (err) {
      logger.error('[WeeklyPoll] Poll リノートエラー:', err);
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
    const winnerName = winner.Name_JP ?? winner.Name ?? `${winnerNum}番機`;

    try {
      const result = await this.deps.ai.chat(
        [
          {
            role: 'system',
            content: `あなたはナンバーテールズの「${winnerName}」として、今週の担当キャラクターとして就任の一言を投稿します。
このキャラクターの性格概要: ${(winner.Character_JP ?? winner.Character) ?? '中性的でフレンドリー'}
一人称: ${typeof (winner.FirstPersonCalling_JP ?? winner.FirstPersonCalling) === 'string' ? (winner.FirstPersonCalling_JP ?? winner.FirstPersonCalling)!.split('\n')[0]!.split('※')[0]!.trim().split(/[,/]/)[0]!.trim() : '私'}
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

      const speechLine = formatSpeech(winnerNum, result.text.trim());
      const greetingText = `【今週の担当: ${winnerName}】\n${speechLine}`;
      await this.deps.misskeyClient.post(greetingText);
      logger.info(`[WeeklyPoll] 就任挨拶投稿: ${winnerName}`);
    } catch (err) {
      logger.error('[WeeklyPoll] 就任挨拶投稿エラー:', err);
    }
  }
}
