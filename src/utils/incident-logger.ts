/**
 * インシデントロガー
 *
 * ハラスメント検知時の投稿情報を NDJSON 形式でファイルに追記する。
 * ファイルパスは環境変数 INCIDENT_LOG_PATH で設定可能（デフォルト: .cache/incident.log）。
 *
 * ログ確認コマンド例:
 *   tail -n 20 .cache/incident.log
 *   grep '"level":3' .cache/incident.log
 *   cat .cache/incident.log | jq '.'   # jq がある場合
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { logger } from './logger.js';

export interface IncidentRecord {
  /** ログ記録日時 (ISO 8601) */
  timestamp: string;
  /** ハラスメントレベル (1=軽度 / 2=繰り返し不適切 / 3=暴言・脅迫) */
  level: 1 | 2 | 3;
  /** Misskey 内部ノート ID */
  noteId: string;
  /** Misskey 内部ユーザー ID */
  userId: string;
  /**
   * @username 形式の表示用ハンドル
   * - ローカルユーザー: @username
   * - リモートユーザー: @username@instance.example
   */
  userHandle: string;
  /** 投稿日時 (note.createdAt そのまま) */
  noteCreatedAt: string;
  /** @mention 除去後の投稿本文 */
  text: string;
}

export class IncidentLogger {
  constructor(private readonly logPath: string) {
    try {
      mkdirSync(dirname(logPath), { recursive: true });
    } catch {
      // ディレクトリが既に存在する場合は無視
    }
  }

  /**
   * インシデントをファイルに記録し、ターミナルログにも warn レベルで出力する。
   */
  log(record: IncidentRecord): void {
    const line = JSON.stringify(record) + '\n';
    try {
      appendFileSync(this.logPath, line, 'utf8');
    } catch (err) {
      logger.error('Failed to write incident log:', err);
    }

    // ターミナル（pm2 logs）でも確認できるよう warn で出力
    logger.warn(
      `[INCIDENT L${record.level}] handle=${record.userHandle} userId=${record.userId}` +
        ` noteId=${record.noteId} createdAt=${record.noteCreatedAt}` +
        ` text="${record.text.slice(0, 80)}"`,
    );
  }
}
