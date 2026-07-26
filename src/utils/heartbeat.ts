import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { logger } from './logger.js';

/** ハートビートファイルに書き出す状態のスナップショット */
export interface HeartbeatStatus {
  /** 書き込み時刻（epoch ミリ秒） */
  ts: number;
  /** Misskey WebSocket が現在接続中かどうか */
  wsConnected: boolean;
  /** 最後に WebSocket 接続が確立していた時刻（epoch ミリ秒） */
  lastConnectedAt: number;
  /** プロセス起動からの経過秒数 */
  uptimeSec: number;
}

/**
 * VM 内ウォッチドッグ（tools/vm-watchdog.mjs）向けのハートビートライター。
 *
 * 一定間隔で JSON ファイルを更新し続けることで「プロセスは生きているが
 * イベントループが固まっている／WebSocket が沈黙している」状態を
 * 外部プロセスから検知可能にする。
 * - ファイル更新が止まる → イベントループのハング
 * - wsConnected が false のまま → WebSocket 再接続の失敗
 */
export class HeartbeatWriter {
  private timer: NodeJS.Timeout | null = null;
  private lastConnectedAt = Date.now();

  /**
   * @param filePath 出力先ファイルパス（例: .cache/heartbeat.json）
   * @param intervalMs 書き込み間隔ミリ秒（デフォルト 30 秒）
   * @param isConnected WebSocket 接続状態を返すコールバック
   */
  constructor(
    private readonly filePath: string,
    private readonly intervalMs: number,
    private readonly isConnected: () => boolean,
  ) {}

  /** ハートビートの定期書き込みを開始する（多重開始は無視） */
  start(): void {
    if (this.timer) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    this.beat(); // 起動直後に1回書く
    this.timer = setInterval(() => this.beat(), this.intervalMs);
    // ハートビートがプロセスの終了を妨げないようにする
    this.timer.unref();
    logger.info(`Heartbeat started: ${this.filePath} (interval ${this.intervalMs}ms)`);
  }

  /** 定期書き込みを停止する */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private beat(): void {
    const connected = this.isConnected();
    if (connected) this.lastConnectedAt = Date.now();
    const status: HeartbeatStatus = {
      ts: Date.now(),
      wsConnected: connected,
      lastConnectedAt: this.lastConnectedAt,
      uptimeSec: Math.floor(process.uptime()),
    };
    try {
      writeFileSync(this.filePath, JSON.stringify(status));
    } catch (err) {
      // 書き込み失敗で Bot 本体を止めない（ログのみ）
      logger.warn('Failed to write heartbeat file:', err);
    }
  }
}

/**
 * 直近のハートビートファイルを読み取り、前回プロセスが最後に生存していた状態を返す。
 * 復旧通知のダウンタイム算出に使う。**必ず HeartbeatWriter.start() が最初の beat() で
 * 上書きする前に呼ぶこと**（さもないと今回起動の ts を読んでしまいダウンタイムが 0 になる）。
 * ファイル無し・パース不能・`ts` が数値でない等はすべて null を返す。
 */
export function readLastHeartbeat(filePath: string): HeartbeatStatus | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf-8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as HeartbeatStatus).ts === 'number'
    ) {
      return parsed as HeartbeatStatus;
    }
    return null;
  } catch {
    return null;
  }
}
