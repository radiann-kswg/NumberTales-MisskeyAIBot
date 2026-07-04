#!/usr/bin/env node
/**
 * Claude Codeデバッグ用: GCP VM上のBot実行ログをSSH経由で取得する
 * Usage:
 *   node tools/fetch-vm-logs.mjs [--lines N] [--target pm2|error|incident|all] [--grep PATTERN]
 *
 * .env の GCP_SSH_HOST / GCP_SSH_USER と ~/.ssh/deploy_key_gha を使って接続する。
 * .env の内容そのものは一切標準出力しない（接続先の user@host のみ表示）。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// .env を手動パース（dotenv 非依存。fetch-misskey-notes.mjs と同じ方式）
const env = {};
try {
  const lines = readFileSync(join(ROOT, '.env'), 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
} catch {
  console.error('エラー: .env ファイルが見つかりません。プロジェクトルートに .env を用意してください。');
  process.exit(1);
}

const { GCP_SSH_HOST, GCP_SSH_USER, GCP_SSH_PORT } = env;
if (!GCP_SSH_HOST || !GCP_SSH_USER) {
  console.error('エラー: .env に GCP_SSH_HOST または GCP_SSH_USER が設定されていません。');
  process.exit(1);
}

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const lineCount = opt('--lines', '50');
const target = opt('--target', 'pm2'); // pm2 | error | incident | all
const grepPattern = opt('--grep', null);

const remoteCmds = [];
if (target === 'pm2' || target === 'all') {
  remoteCmds.push('pm2 list');
  remoteCmds.push(`pm2 logs numbertales-bot --lines ${lineCount} --nostream`);
}
if (target === 'error' || target === 'all') {
  remoteCmds.push(
    grepPattern
      ? `tail -n ${lineCount} .cache/error.log | grep -F -- '${grepPattern}'`
      : `tail -n ${lineCount} .cache/error.log`
  );
}
if (target === 'incident' || target === 'all') {
  remoteCmds.push(
    grepPattern
      ? `tail -n ${lineCount} .cache/incident.log | grep -F -- '${grepPattern}'`
      : `tail -n ${lineCount} .cache/incident.log`
  );
}

if (!remoteCmds.length) {
  console.error(`エラー: 不明な --target 値です（pm2 / error / incident / all のいずれかを指定）: ${target}`);
  process.exit(1);
}

const remoteScript = `cd ~/NumberTales-MisskeyAIBot && ${remoteCmds
  .map((cmd) => `echo "=== ${cmd} ===" && ${cmd}`)
  .join(' && ')}`;

const keyPath = join(homedir(), '.ssh', 'deploy_key_gha');
const sshArgs = [
  '-i', keyPath,
  '-p', GCP_SSH_PORT || '22',
  '-o', 'StrictHostKeyChecking=accept-new',
  '-o', 'ConnectTimeout=10',
  `${GCP_SSH_USER}@${GCP_SSH_HOST}`,
  remoteScript,
];

console.log(`接続先: ${GCP_SSH_USER}@${GCP_SSH_HOST}`);
const result = spawnSync('ssh', sshArgs, { stdio: 'inherit' });
process.exit(result.status ?? 1);
