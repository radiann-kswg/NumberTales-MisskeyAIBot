/**
 * 復旧通知（ダウンタイム明けの自発投稿）
 *
 * Bot が一定時間停止した状態から再起動したとき、000(チトセ) が「●時間ぶりに戻ってきた／
 * 寝てました」的な復旧通知を home で1回だけ自発投稿する。稼働可視化＋キャラ演出。
 *
 * ダウンタイムは「HeartbeatWriter が上書きする前に退避した前回 ts」と現在時刻から算出する
 * （呼び出し側が readLastHeartbeat の結果を prevHeartbeatTs として渡す）。停止時間の数値表記は
 * コード側で確定し、フレーバー文のみ LLM 生成・失敗時は固定テンプレへフォールバックする。
 */
import type { AIProvider } from '../ai/index.js';
import type { MisskeyClient } from '../misskey/client.js';
import type { BotStateStore } from '../storage/bot-state.js';
import { getReleasedCharacterByNum, getDefaultCharacterProfile } from '../bot/character/loader.js';
import { buildCharacterSystemPrompt } from '../bot/character/prompt-builder.js';
import { formatSpeech } from '../bot/responder/emoji.js';
import { BOT_CONSTANTS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

/** クールダウン記録用の bot_state キー（多重投稿防止） */
const STATE_KEY_LAST_DOWNTIME_NOTICE = 'last_downtime_notice_at';

export interface RecoveryNoticeDeps {
  ai: AIProvider;
  misskeyClient: MisskeyClient;
  botState: BotStateStore;
  /** これ未満の停止は無言復帰 */
  thresholdMs: number;
  /** この期間内は再投稿しない（クラッシュループ対策） */
  cooldownMs: number;
  /** これを超える停止は投稿しない（古い heartbeat 復活の誤検知除け） */
  maxMs: number;
}

/**
 * ダウンタイムをコード側で「●分」「●時間」「●日と●時間」に整形する（LLM には計算させない）。
 */
export function formatDowntime(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return hours > 0 ? `${days}日と${hours}時間` : `${days}日`;
  if (hours > 0) return `${hours}時間`;
  return `${mins}分`;
}

/** WebSocket 接続が確立するまで待つ（timeoutMs 以内に接続しなければ false） */
async function waitForConnection(client: MisskeyClient, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (client.isConnected()) return true;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return client.isConnected();
}

/** 000(チトセ) の復旧通知テキストを生成する（フレーバーのみ LLM・失敗時は固定テンプレ） */
async function buildRecoveryText(downtimeLabel: string, ai: AIProvider): Promise<string> {
  const num = BOT_CONSTANTS.CHITOSE_NUM;
  const fallback = formatSpeech(num, `ただいま。${downtimeLabel}ぶりに目が覚めたよ。少し眠ってたみたい。`);
  try {
    const profile = getReleasedCharacterByNum(num) ?? getDefaultCharacterProfile();
    const systemPrompt = buildCharacterSystemPrompt(profile, 'chat');
    const result = await ai.chat(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            `あなた（000/チトセ）は Bot が約${downtimeLabel}停止したあと復帰しました。フォロワーへ` +
            `「${downtimeLabel}ぶりに戻ってきた（寝ていた/落ちていた）」と軽く報告する一言を、あなたの口調で` +
            `40文字以内で返してください（台詞のみ。停止時間の表記「${downtimeLabel}」はそのまま使うこと）。`,
        },
      ],
      { maxTokens: 100, temperature: 0.9 },
    );
    const line = result.text.trim();
    return line.length > 0 ? formatSpeech(num, line) : fallback;
  } catch (err) {
    logger.error('[RecoveryNotice] AI generation error, using fallback:', err);
    return fallback;
  }
}

/**
 * ダウンタイム明けの復旧通知を、条件を満たすときのみ1回投稿する。
 *
 * @param prevHeartbeatTs HeartbeatWriter が上書きする前に readLastHeartbeat で退避した ts（無ければ null）
 * @param nowMs 現在時刻（epoch ミリ秒）
 */
export async function postRecoveryNoticeIfNeeded(
  prevHeartbeatTs: number | null,
  nowMs: number,
  deps: RecoveryNoticeDeps,
): Promise<void> {
  // 1. 前回ハートビート無し（初回起動・パース不能）→ 投稿しない
  if (prevHeartbeatTs === null) return;

  const downtimeMs = nowMs - prevHeartbeatTs;

  // 2. 負値（時計巻き戻り）・閾値未満（reload/ウォッチドッグ再起動の数分）→ 無言復帰
  if (downtimeMs < 0 || downtimeMs < deps.thresholdMs) return;

  // 3. 上限超過（スナップショット復元で古い heartbeat が蘇る誤検知）→ 投稿しない
  if (downtimeMs > deps.maxMs) {
    logger.warn(`[RecoveryNotice] downtime ${downtimeMs}ms exceeds max ${deps.maxMs}ms; skip.`);
    return;
  }

  // 4. クールダウン内（クラッシュループでの連投）→ 投稿しない
  const lastRaw = deps.botState.getState(STATE_KEY_LAST_DOWNTIME_NOTICE);
  if (lastRaw) {
    const last = parseInt(lastRaw, 10);
    if (!Number.isNaN(last) && nowMs - last < deps.cooldownMs) {
      logger.info('[RecoveryNotice] within cooldown; skip.');
      return;
    }
  }

  // 5. WebSocket 接続確立を待つ（未接続なら投稿しない）
  const connected = await waitForConnection(deps.misskeyClient, 30_000);
  if (!connected) {
    logger.warn('[RecoveryNotice] WebSocket not connected; skip recovery notice.');
    return;
  }

  const downtimeLabel = formatDowntime(downtimeMs);
  const text = await buildRecoveryText(downtimeLabel, deps.ai);

  try {
    await deps.misskeyClient.post(text, { visibility: BOT_CONSTANTS.DEFAULT_VISIBILITY });
    deps.botState.setState(STATE_KEY_LAST_DOWNTIME_NOTICE, String(nowMs));
    logger.info(`[RecoveryNotice] posted recovery notice (downtime=${downtimeLabel}).`);
  } catch (err) {
    logger.error('[RecoveryNotice] failed to post recovery notice:', err);
  }
}
