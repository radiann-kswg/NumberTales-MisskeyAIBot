#!/usr/bin/env node
/**
 * VM 内ウォッチドッグ — PM2 プロセスの死活とハートビート鮮度を監視して自動復旧する。
 *
 * systemd timer（毎分）から実行される想定。以下の3条件で pm2 再起動を行う:
 *   1. pm2 上のプロセスが存在しない / online でない（errored・stopped 等）
 *   2. ハートビートファイル（.cache/heartbeat.json）の ts が STALE_MS 以上古い
 *      → イベントループのハング（プロセスは生きているが応答不能）
 *   3. wsConnected=false かつ lastConnectedAt から WS_DEAD_MS 以上経過
 *      → WebSocket 自動再接続の失敗が長時間継続
 *
 * フラッピング防止: 直近 WINDOW_MS 以内の再起動が MAX_RESTARTS 回に達したら
 * 再起動せずエラーログのみ残す（無限再起動ループの抑止）。
 *
 * 使い方:
 *   node tools/vm-watchdog.mjs             # 監視 + 必要なら再起動
 *   node tools/vm-watchdog.mjs --dry-run   # 判定のみ（再起動しない）
 *
 * すべての判定結果は .cache/watchdog.log に NDJSON で追記される。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- 設定（環境変数で上書き可能） ----
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_NAME = process.env.WATCHDOG_APP_NAME ?? 'numbertales-bot';
const HEARTBEAT_PATH = resolve(REPO_ROOT, process.env.HEARTBEAT_PATH ?? '.cache/heartbeat.json');
const STATE_PATH = resolve(REPO_ROOT, '.cache/watchdog-state.json');
const LOG_PATH = resolve(REPO_ROOT, '.cache/watchdog.log');
const STALE_MS = Number(process.env.WATCHDOG_STALE_MS ?? 3 * 60 * 1000); // HB停止 3分
const WS_DEAD_MS = Number(process.env.WATCHDOG_WS_DEAD_MS ?? 10 * 60 * 1000); // WS切断 10分
const WINDOW_MS = Number(process.env.WATCHDOG_WINDOW_MS ?? 30 * 60 * 1000); // 上限窓 30分
const MAX_RESTARTS = Number(process.env.WATCHDOG_MAX_RESTARTS ?? 3);
const DRY_RUN = process.argv.includes('--dry-run');

function log(entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    appendFileSync(LOG_PATH, line + '\n');
  } catch {
    /* ログ失敗は無視 */
  }
  console.log(line);
}

function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** pm2 jlist から対象プロセスの状態を取得する */
function getPm2Status() {
  try {
    const out = execFileSync('pm2', ['jlist'], { encoding: 'utf8', timeout: 30_000 });
    const list = JSON.parse(out);
    const proc = list.find((p) => p.name === APP_NAME);
    return proc ? proc.pm2_env?.status ?? 'unknown' : 'missing';
  } catch (err) {
    return `pm2-error: ${err.message}`;
  }
}

/** 再起動理由を判定する。健全なら null を返す */
function diagnose() {
  const pm2Status = getPm2Status();
  if (pm2Status.startsWith('pm2-error')) {
    // pm2 自体が応答しない場合は判定不能（ログのみ）
    log({ level: 'error', event: 'pm2-unreachable', detail: pm2Status });
    return null;
  }
  if (pm2Status !== 'online') return { reason: `pm2-status-${pm2Status}`, pm2Status };

  const hb = readJsonSafe(HEARTBEAT_PATH);
  if (!hb) {
    // 初回起動直後などハートビート未生成は猶予（プロセスが online なら様子見）
    log({ level: 'warn', event: 'heartbeat-missing', pm2Status });
    return null;
  }
  const now = Date.now();
  if (now - hb.ts > STALE_MS) {
    return { reason: 'heartbeat-stale', ageMs: now - hb.ts, pm2Status };
  }
  if (hb.wsConnected === false && now - hb.lastConnectedAt > WS_DEAD_MS) {
    return { reason: 'websocket-dead', disconnectedMs: now - hb.lastConnectedAt, pm2Status };
  }
  return null;
}

/** 直近 WINDOW_MS 内の再起動回数が上限未満なら true */
function underRestartLimit(state, now) {
  const recent = (state.restarts ?? []).filter((t) => now - t < WINDOW_MS);
  state.restarts = recent;
  return recent.length < MAX_RESTARTS;
}

function restart(status) {
  if (status === 'missing') {
    // pm2 管理下に無い → ecosystem から起動し直す
    execFileSync('pm2', ['start', 'ecosystem.config.cjs', '--env', 'production'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 120_000,
    });
  } else {
    execFileSync('pm2', ['restart', APP_NAME], { encoding: 'utf8', timeout: 120_000 });
  }
}

// ---- メイン ----
const problem = diagnose();
if (!problem) {
  // 健全時はログを出さない（毎分実行のためログ肥大を防ぐ）
  process.exit(0);
}

const now = Date.now();
const state = (existsSync(STATE_PATH) ? readJsonSafe(STATE_PATH) : null) ?? { restarts: [] };

if (!underRestartLimit(state, now)) {
  log({ level: 'error', event: 'restart-suppressed', ...problem, restartsInWindow: state.restarts.length });
  process.exit(0);
}

if (DRY_RUN) {
  log({ level: 'warn', event: 'would-restart(dry-run)', ...problem });
  process.exit(0);
}

try {
  restart(problem.pm2Status);
  state.restarts.push(now);
  writeFileSync(STATE_PATH, JSON.stringify(state));
  log({ level: 'warn', event: 'restarted', ...problem });
} catch (err) {
  log({ level: 'error', event: 'restart-failed', ...problem, error: err.message });
  process.exit(1);
}
