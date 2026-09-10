// tools/check-ctrl.mjs — 生の制御文字（改行・タブを除く C0）の混入検出。
// 一致=1 / 不一致=0 / git grep 自体の異常=2 を厳密に分ける（`|| true` で握り潰さない）。
import { spawnSync } from 'node:child_process';

const r = spawnSync(
  'git',
  ['grep', '-In', '--untracked', '-P', '[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]', '--', 'src', 'test', 'tools'],
  { encoding: 'utf-8' },
);
if (r.error) {
  console.error(`check:ctrl: git を起動できません: ${r.error.message}`);
  process.exit(2);
}
if (r.status === 0) {
  process.stdout.write(r.stdout);
  console.error('check:ctrl: 生の制御文字が混入しています。可視表記（\\b 等）へ置き換えてください。');
  process.exit(1);
}
if (r.status === 1) process.exit(0);
console.error(`check:ctrl: git grep が異常終了しました (status=${r.status})`);
console.error(r.stderr.trimEnd());
process.exit(2);
