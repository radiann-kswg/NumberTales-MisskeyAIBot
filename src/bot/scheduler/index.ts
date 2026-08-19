// 時間帯別自発投稿スケジューラー（F-02: 深夜雑談モード拡張）

import type { AIProvider } from '../../ai/index.js';
import type { MisskeyClient } from '../../misskey/client.js';
import { getReleasedCharacterByNum, getDefaultCharacterProfile } from '../character/loader.js';
import { buildCharacterSystemPrompt } from '../character/prompt-builder.js';
import type { FormTarget } from '../classifier/intent.js';
import {
  BotStateStore,
  STATE_KEY_SCHEDULER_CHAR,
  STATE_KEY_CALC_QUIZ_LAST_SLOT,
  STATE_KEY_CALC_QUIZ_PUBLIC,
} from '../../storage/bot-state.js';
import { getReleasedCharacters } from '../character/loader.js';
import {
  generateQuestion,
  generateNumberQuestion,
  publicQuestionText,
  parsePublicCalcQuiz,
  type CalcLevel,
  type PublicCalcQuiz,
} from '../../features/f06/calc-quiz.js';
import type { TaskStore } from '../../storage/task.js';
import type { TrustStore } from '../../storage/trust.js';
import type { ActiveCharacterStore } from '../character/store.js';
import { WeeklyPollScheduler } from './weekly-poll.js';
import { TaskScheduler } from './task-scheduler.js';
import { formatSpeech } from '../responder/emoji.js';
import { logger } from '../../utils/logger.js';
import { BOT_CONSTANTS } from '../../config/constants.js';

// ----------------------------------------------------------------
// 時間帯スロット定義
// ----------------------------------------------------------------

interface TimeSlot {
  /** JST 開始時刻（0〜23） */
  readonly startHour: number;
  /** JST 終了時刻（exclusive）。startHour より小さい場合は0時をまたぐ */
  readonly endHour: number;
  /** ログ用ラベル */
  readonly label: string;
  /** AI プロンプトに付加する時間帯固有の指示 */
  readonly promptAddendum: string;
}

const TIME_SLOTS: readonly TimeSlot[] = [
  {
    startHour: 6,
    endHour: 8,
    label: '朝',
    promptAddendum:
      '朝の時間帯（6〜8時）です。夜のあいだコアフォルダ形態で休んでいたのがヒューマノイド形態に変形して起動したところ、という体で、元気でテキパキした口調の軽い挨拶や作業開始の声かけをひとことつぶやいてください。',
  },
  {
    startHour: 12,
    endHour: 13,
    label: '昼',
    promptAddendum:
      '昼の時間帯（12〜13時）です。落ち着いた口調で、お昼らしい短いつぶやきをひとことしてください。',
  },
  {
    startHour: 17,
    endHour: 19,
    label: '夕方',
    promptAddendum:
      '夕方の時間帯（17〜19時）です。お疲れ様の声かけや夕方らしいつぶやきをひとことしてください。',
  },
  {
    startHour: 23,
    endHour: 5, // 0時をまたぐ（翌5時まで）
    label: '深夜',
    promptAddendum:
      '深夜の時間帯（23〜翌5時）です。ほっこり・哲学的・少し眠そうなトーンで、作業中のフォロワーに寄り添う言葉をひとことつぶやいてください。',
  },
];

/**
 * F-16 計算問題の定期出題スロット（JST）。
 *
 * 8時・16時・20時は TIME_SLOTS のどれにも属さないため、tick() では
 * getActiveSlot() の判定より**必ず前**にこの分岐を置くこと。
 * 12時だけは昼スロット（12〜13時）と重なるので、出題したら lastPostedAt を更新して
 * その日の昼の自発投稿を抑止する（連投回避）。
 */
const CALC_QUIZ_SLOTS: readonly { hour: number; level: CalcLevel; numberMode: boolean }[] = [
  { hour: 8, level: 1, numberMode: false },
  { hour: 12, level: 2, numberMode: true },
  { hour: 16, level: 3, numberMode: false },
  { hour: 20, level: 4, numberMode: true },
];

// ----------------------------------------------------------------
// AI プロンプト
// ----------------------------------------------------------------

/**
 * 担当キャラクターのシステムプロンプトを構築する。
 * botState から担当番号を取得し、DB のプロフィールを使って動的生成する。
 * 担当が未設定の場合は 000(チトセ) のデフォルトプロンプトにフォールバックする。
 */
function buildSchedulerSystemPrompt(botState: BotStateStore, formTarget: FormTarget = 'humanoid'): string {
  const charNum = botState.getState(STATE_KEY_SCHEDULER_CHAR) ?? BOT_CONSTANTS.CHITOSE_NUM;
  const profile = getReleasedCharacterByNum(charNum) ?? getDefaultCharacterProfile();
  const base = buildCharacterSystemPrompt(profile, 'chat', formTarget);

  return `${base}

【自発投稿の制約】
- 台詞部分のみ出力すること（書式は呼び出し元が付与するため、台詞テキストだけ返す）
- 50文字以内
- 反社会的・著しく性的な表現は絶対に行わない
- 未公開のナンバーテールズ設定・台詞・ストーリーを自動生成しない`;
}

// ----------------------------------------------------------------
// ユーティリティ
// ----------------------------------------------------------------

/** 現在の JST 時刻（時）を返す */
function getJSTHour(): number {
  return (new Date().getUTCHours() + 9) % 24;
}

/** 現在の JST 日付とスロット時刻を 'YYYY-MM-DD:HH' 形式で返す（定期出題の重複防止キー） */
function getCalcQuizSlotKey(hour: number): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}:${String(hour).padStart(2, '0')}`;
}

/** 1〜2時間のランダムなクールダウン（ms）を返す */
function randomCooldownMs(): number {
  const range = BOT_CONSTANTS.SCHEDULER_MAX_COOLDOWN_MS - BOT_CONSTANTS.SCHEDULER_MIN_COOLDOWN_MS;
  return BOT_CONSTANTS.SCHEDULER_MIN_COOLDOWN_MS + Math.random() * range;
}

/**
 * 指定時刻がいずれかのスロットに該当すれば、そのスロットを返す
 * 0時またぎスロット（endHour < startHour）も正しく判定する
 */
function getActiveSlot(hour: number): TimeSlot | null {
  for (const slot of TIME_SLOTS) {
    if (slot.endHour <= slot.startHour) {
      // 0時またぎスロット（例: 23〜5）
      if (hour >= slot.startHour || hour < slot.endHour) return slot;
    } else {
      if (hour >= slot.startHour && hour < slot.endHour) return slot;
    }
  }
  return null;
}

// ----------------------------------------------------------------
// PostScheduler クラス
// ----------------------------------------------------------------

export interface SchedulerDeps {
  ai: AIProvider;
  misskeyClient: MisskeyClient;
  botState: BotStateStore;
  taskStore: TaskStore;
  trustStore: TrustStore;
  activeCharacterStore: ActiveCharacterStore;
}

/**
 * 時間帯別自発投稿スケジューラー
 *
 * 動作:
 * - SCHEDULER_CHECK_INTERVAL_MS（10分）ごとに JST 時刻を確認
 * - 定義済みスロット（朝/昼/夕方/深夜）に該当し、クールダウンが切れていれば投稿
 * - クールダウンはスロット横断で共有（1〜2時間ランダム）
 * - 週次 Poll スケジューラー（WeeklyPollScheduler）も内包して同時管理
 */
export class PostScheduler {
  private lastPostedAt: number | null = null;
  private nextCooldownMs: number;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private readonly weeklyPoll: WeeklyPollScheduler;
  private readonly taskScheduler: TaskScheduler;

  constructor(private readonly deps: SchedulerDeps) {
    this.nextCooldownMs = randomCooldownMs();
    this.weeklyPoll = new WeeklyPollScheduler({
      ai: deps.ai,
      misskeyClient: deps.misskeyClient,
      botState: deps.botState,
    });
    this.taskScheduler = new TaskScheduler({
      ai: deps.ai,
      misskeyClient: deps.misskeyClient,
      taskStore: deps.taskStore,
      trustStore: deps.trustStore,
      activeCharacterStore: deps.activeCharacterStore,
    });
  }

  start(): void {
    this.intervalHandle = setInterval(
      () => void this.tick(),
      BOT_CONSTANTS.SCHEDULER_CHECK_INTERVAL_MS,
    );
    this.weeklyPoll.start();
    this.taskScheduler.start();
    logger.info('Post scheduler started');
  }

  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.weeklyPoll.stop();
    this.taskScheduler.stop();
  }

  /**
   * F-16 定期出題を公開ノートで投稿する。
   * 出題は担当キャラの口調で行い、回答は「このノートへのリプライ」で受け付ける
   * （現在の問題は BotStateStore に1件だけ保持し、次の出題で上書きする）。
   */
  private async postCalcQuiz(
    slot: { hour: number; level: CalcLevel; numberMode: boolean },
    slotKey: string,
  ): Promise<void> {
    try {
      const charNum =
        this.deps.botState.getState(STATE_KEY_SCHEDULER_CHAR) ?? BOT_CONSTANTS.CHITOSE_NUM;
      const question = slot.numberMode
        ? (generateNumberQuestion(slot.level, getReleasedCharacters()) ??
           generateQuestion(slot.level))
        : generateQuestion(slot.level);

      const previous = parsePublicCalcQuiz(
        this.deps.botState.getState(STATE_KEY_CALC_QUIZ_PUBLIC),
      );
      const body = publicQuestionText(question, previous?.answer ?? null);
      const noteId = await this.deps.misskeyClient.post(formatSpeech(charNum, body));

      const record: PublicCalcQuiz = {
        noteId,
        expr: question.expr,
        answer: question.answer,
        level: question.level,
        charNum: question.charNum ?? null,
        posterNum: charNum,
        postedAt: Date.now(),
        answeredUserIds: [],
      };
      this.deps.botState.setState(STATE_KEY_CALC_QUIZ_PUBLIC, JSON.stringify(record));
      this.deps.botState.setState(STATE_KEY_CALC_QUIZ_LAST_SLOT, slotKey);
      logger.info(`[計算問題] Scheduled quiz posted (${slotKey}): ${question.expr}`);
    } catch (err) {
      logger.error('Calc quiz scheduled post error:', err);
    }
  }

  private isOnCooldown(): boolean {
    if (this.lastPostedAt === null) return false;
    return Date.now() - this.lastPostedAt < this.nextCooldownMs;
  }

  private async tick(): Promise<void> {
    const hour = getJSTHour();

    // F-16 定期出題（8/12/16/20時）。8時・16時・20時は TIME_SLOTS に属さないため、
    // getActiveSlot() の null 判定より前に置く必要がある。
    const quizSlot = CALC_QUIZ_SLOTS.find((entry) => entry.hour === hour);
    if (quizSlot && !this.isOnCooldown()) {
      const slotKey = getCalcQuizSlotKey(hour);
      if (this.deps.botState.getState(STATE_KEY_CALC_QUIZ_LAST_SLOT) !== slotKey) {
        await this.postCalcQuiz(quizSlot, slotKey);
        this.lastPostedAt = Date.now();
        this.nextCooldownMs = randomCooldownMs();
        return;
      }
    }

    const slot = getActiveSlot(hour);
    if (slot === null) return;
    if (this.isOnCooldown()) return;

    // 月曜7時: 就任挨拶（B-4）— 就任挨拶を送ったら通常スロット投稿はスキップ
    const dayOfWeek = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay();
    if (dayOfWeek === 1 && hour === 7) {
      await this.weeklyPoll.postInaugurationGreeting();
      this.lastPostedAt = Date.now();
      this.nextCooldownMs = randomCooldownMs();
      return;
    }

    try {
      // 深夜スロットはコアフォルダ形態の身体性・口調で投稿する（F-15 項目3）
      const systemPrompt = buildSchedulerSystemPrompt(
        this.deps.botState,
        slot.label === '深夜' ? 'core-folder' : 'humanoid',
      );
      const charNum = this.deps.botState.getState(STATE_KEY_SCHEDULER_CHAR) ?? BOT_CONSTANTS.CHITOSE_NUM;
      const result = await this.deps.ai.chat(
        [
          {
            role: 'system',
            content: `${systemPrompt}\n\n【現在の時間帯】\n${slot.promptAddendum}`,
          },
          { role: 'user', content: 'つぶやきをひとつ投稿してください。' },
        ],
        { maxTokens: 80, temperature: 0.9 },
      );
      const speechText = formatSpeech(charNum, result.text.trim());
      await this.deps.misskeyClient.post(speechText);
      this.lastPostedAt = Date.now();
      this.nextCooldownMs = randomCooldownMs();
      logger.info(`[${slot.label}] Scheduled post sent: "${speechText.slice(0, 40)}..."`);
    } catch (err) {
      logger.error('Scheduler post error:', err);
    }
  }
}
