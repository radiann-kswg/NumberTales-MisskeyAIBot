/**
 * GCE 外部ウォッチドッグ — Cloud Run functions (2nd gen)
 *
 * Cloud Scheduler から5分ごとに HTTP 起動され、Bot VM の SSH ポート(TCP:22)へ
 * 死活確認を行う。全試行が失敗し、かつインスタンスが RUNNING の場合は
 * 「VM ごとフリーズ」と判断して instances.reset() を実行する。
 * インスタンスが TERMINATED（停止）の場合は start() で起動する。
 *
 * フラッピング防止: リセット実行時にインスタンスのメタデータ
 * `watchdog-last-reset` に epoch ミリ秒を記録し、COOLDOWN_MS 以内の再リセットを抑止。
 *
 * 必要な環境変数:
 *   GCP_PROJECT  - プロジェクト ID
 *   GCE_ZONE     - ゾーン（例: asia-northeast1-b）
 *   GCE_INSTANCE - インスタンス名
 *   TARGET_IP    - VM の外部 IP
 * 任意:
 *   TARGET_PORT (default 22) / PROBE_TRIES (3) / PROBE_TIMEOUT_MS (10000)
 *   PROBE_INTERVAL_MS (15000) / COOLDOWN_MS (1800000 = 30分)
 */
import { connect } from 'node:net';
import functions from '@google-cloud/functions-framework';
import { InstancesClient, ZoneOperationsClient } from '@google-cloud/compute';

const {
  GCP_PROJECT: project,
  GCE_ZONE: zone,
  GCE_INSTANCE: instance,
  TARGET_IP: targetIp,
} = process.env;
const TARGET_PORT = Number(process.env.TARGET_PORT ?? 22);
const PROBE_TRIES = Number(process.env.PROBE_TRIES ?? 3);
const PROBE_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 10_000);
const PROBE_INTERVAL_MS = Number(process.env.PROBE_INTERVAL_MS ?? 15_000);
const COOLDOWN_MS = Number(process.env.COOLDOWN_MS ?? 30 * 60 * 1000);

const instances = new InstancesClient();
const operations = new ZoneOperationsClient();

/** TCP 接続を1回試行する */
function probeOnce() {
  return new Promise((resolveProbe) => {
    const socket = connect({ host: targetIp, port: TARGET_PORT, timeout: PROBE_TIMEOUT_MS });
    const done = (ok) => {
      socket.destroy();
      resolveProbe(ok);
    };
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/** PROBE_TRIES 回試行し、1回でも成功したら true */
async function isReachable() {
  for (let i = 0; i < PROBE_TRIES; i++) {
    if (await probeOnce()) return true;
    if (i < PROBE_TRIES - 1) await new Promise((r) => setTimeout(r, PROBE_INTERVAL_MS));
  }
  return false;
}

/** メタデータの watchdog-last-reset を読み取る（無ければ 0） */
function getLastReset(vm) {
  const item = vm.metadata?.items?.find((i) => i.key === 'watchdog-last-reset');
  return item ? Number(item.value) : 0;
}

/** メタデータへ watchdog-last-reset を記録する */
async function setLastReset(vm, now) {
  const items = (vm.metadata?.items ?? []).filter((i) => i.key !== 'watchdog-last-reset');
  items.push({ key: 'watchdog-last-reset', value: String(now) });
  await instances.setMetadata({
    project,
    zone,
    instance,
    metadataResource: { fingerprint: vm.metadata?.fingerprint, items },
  });
}

async function waitOperation(op) {
  let operation = op.latestResponse ?? op;
  while (operation.status !== 'DONE') {
    [operation] = await operations.wait({ project, zone, operation: operation.name });
  }
  if (operation.error?.errors?.length) {
    throw new Error(`Operation failed: ${JSON.stringify(operation.error.errors)}`);
  }
}

functions.http('watchdog', async (req, res) => {
  const missing = ['GCP_PROJECT', 'GCE_ZONE', 'GCE_INSTANCE', 'TARGET_IP'].filter((k) => !process.env[k]);
  if (missing.length) {
    res.status(500).json({ error: `Missing env: ${missing.join(', ')}` });
    return;
  }

  // 1. 死活確認 — 届いていれば何もしない
  if (await isReachable()) {
    res.json({ action: 'none', reachable: true });
    return;
  }

  // 2. インスタンス状態を確認
  const [vm] = await instances.get({ project, zone, instance });
  const now = Date.now();

  // 停止していたら起動する
  if (vm.status === 'TERMINATED') {
    const [op] = await instances.start({ project, zone, instance });
    await waitOperation(op);
    console.warn(JSON.stringify({ event: 'started', instance, reason: 'terminated' }));
    res.json({ action: 'start', prevStatus: vm.status });
    return;
  }

  // RUNNING 以外の遷移中状態（STOPPING 等）は次回に持ち越し
  if (vm.status !== 'RUNNING') {
    res.json({ action: 'skip', prevStatus: vm.status });
    return;
  }

  // 3. RUNNING なのに無応答 → フリーズと判断。クールダウンを確認してリセット
  const lastReset = getLastReset(vm);
  if (now - lastReset < COOLDOWN_MS) {
    console.error(JSON.stringify({ event: 'reset-suppressed', instance, sinceLastResetMs: now - lastReset }));
    res.json({ action: 'suppressed', sinceLastResetMs: now - lastReset });
    return;
  }

  await setLastReset(vm, now);
  const [op] = await instances.reset({ project, zone, instance });
  await waitOperation(op);
  console.warn(JSON.stringify({ event: 'reset', instance, reason: 'unreachable-while-running' }));
  res.json({ action: 'reset' });
});
