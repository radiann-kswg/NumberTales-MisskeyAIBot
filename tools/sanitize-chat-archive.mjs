#!/usr/bin/env node
/**
 * sanitize-chat-archive.mjs
 * 対話記録（_session-archives/_agent-chats/）のプライバシー保護スクリプト
 *
 * ローカルパス・ユーザー名・内部IDを伏字プレースホルダーに置換する。
 * 実行環境の情報（APPDATA 環境変数・カレントパス・OS ユーザー名）から
 * 置換ルールを自動生成するため、設定ファイルの編集は不要。
 *
 * 使い方:
 *   node tools/sanitize-chat-archive.mjs [ターゲット...] [--dry-run] [--backup]
 *
 * オプション:
 *   --dry-run   実際には書き換えず、変更箇所をコンソールに表示する
 *   --backup    書き換え前に <ファイル名>.bak を作成する
 *   ターゲット  省略時は _session-archives/_agent-chats/ を対象にする
 *
 * 追加ルール:
 *   tools/sanitize-extra-rules.json を作成すると独自ルールを追加できる。
 *   このファイルは .gitignore 対象（テンプレートは sanitize-extra-rules.json.example）。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// 正規表現のメタ文字をエスケープ
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 置換ルール一覧を構築する。
 * 優先度の高い（長い）パターンから先に適用されるよう順序に注意する。
 *
 * @returns {{ pattern: RegExp, replacement: string }[]}
 */
function buildRules() {
  const rules = [];

  // ===== 1. ローカルリポジトリパス =====
  // スクリプトの場所（tools/）から REPO_ROOT を自動検出する
  // バックスラッシュ / ダブルバックスラッシュ / フォワードスラッシュ の各形式に対応
  const repoVariants = [
    REPO_ROOT.replace(/\\/g, '\\\\'), // D:\\VisualStudio Code Userfile\\...
    REPO_ROOT,                         // D:\VisualStudio Code Userfile\...
    REPO_ROOT.replace(/\\/g, '/'),     // D:/VisualStudio Code Userfile/...
  ];
  for (const v of repoVariants) {
    rules.push({
      pattern: new RegExp(escapeRegex(v), 'gi'),
      replacement: '{LOCAL_REPOSITORY}',
    });
  }

  // ===== 2. AppData ルートパス =====
  // %APPDATA% = C:\Users\xxx\AppData\Roaming
  // dirname で C:\Users\xxx\AppData を取得する
  const appDataRoaming = process.env.APPDATA;
  if (appDataRoaming) {
    const appDataRoot = path.dirname(appDataRoaming);
    const appDataVariants = [
      appDataRoot.replace(/\\/g, '\\\\'),
      appDataRoot,
      appDataRoot.replace(/\\/g, '/'),
    ];
    for (const v of appDataVariants) {
      rules.push({
        pattern: new RegExp(escapeRegex(v), 'gi'),
        replacement: '{APPDATA_PATH}',
      });
    }
  }

  // ===== 3. ユーザーホームの Users/<username> パターン =====
  // AppData で既にカバーされないパスが残る場合向け
  // C:\Users\xxx → C:\Users\{USERNAME} の形に置換（パス区切り文字を維持）
  const username = os.userInfo().username;
  if (username) {
    const uname = escapeRegex(username);
    rules.push({
      pattern: new RegExp(`([Cc]:[/\\\\]{1,2}[Uu]sers[/\\\\]{1,2})${uname}`, 'g'),
      replacement: '$1{USERNAME}',
    });
  }

  // ===== 4. workspaceStorage ID (ハイフンなし 32 桁 16 進数) =====
  rules.push({
    pattern: /(workspaceStorage\/)[0-9a-f]{32}/gi,
    replacement: '$1{WORKSPACE_STORAGE_ID}',
  });

  // ===== 5. chat-session-resources UUID (標準 UUID 形式) =====
  rules.push({
    pattern: /(chat-session-resources\/)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    replacement: '$1{SESSION_ID}',
  });

  // ===== 6. Anthropic tool call ID (toolu_bdrk_...) =====
  rules.push({
    pattern: /toolu_bdrk_[A-Za-z0-9]+/g,
    replacement: '{TOOL_CALL_ID}',
  });

  // ===== 7. 追加カスタムルール (tools/sanitize-extra-rules.json) =====
  // .gitignore 対象のファイル。テンプレートは sanitize-extra-rules.json.example を参照。
  const extraRulesPath = path.join(__dirname, 'sanitize-extra-rules.json');
  if (fs.existsSync(extraRulesPath)) {
    try {
      const extra = JSON.parse(fs.readFileSync(extraRulesPath, 'utf8'));
      for (const rule of extra) {
        rules.push({
          pattern: new RegExp(rule.pattern, rule.flags ?? 'g'),
          replacement: rule.replacement,
        });
      }
      console.log(`追加ルール読み込み: ${extra.length} 件 (sanitize-extra-rules.json)`);
    } catch (e) {
      console.warn(`[warn] sanitize-extra-rules.json の読み込み失敗: ${e.message}`);
    }
  }

  return rules;
}

/** 1 ファイル分の伏字処理 */
function sanitize(content, rules) {
  let result = content;
  for (const { pattern, replacement } of rules) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/** dry-run 時の差分表示 */
function showDiff(original, sanitized) {
  const origLines = original.split('\n');
  const newLines = sanitized.split('\n');
  let changedCount = 0;
  const len = Math.max(origLines.length, newLines.length);
  for (let i = 0; i < len; i++) {
    if (origLines[i] !== newLines[i]) {
      changedCount++;
      console.log(`    L${i + 1} - ${(origLines[i] ?? '').slice(0, 120)}`);
      console.log(`    L${i + 1} + ${(newLines[i] ?? '').slice(0, 120)}`);
    }
  }
  return changedCount;
}

function processFile(filePath, rules, { dryRun, backup }) {
  const original = fs.readFileSync(filePath, 'utf8');
  const sanitized = sanitize(original, rules);
  const rel = path.relative(REPO_ROOT, filePath);

  if (sanitized === original) {
    console.log(`  skip    ${rel}`);
    return;
  }

  if (dryRun) {
    console.log(`\n  [dry]   ${rel}`);
    const changed = showDiff(original, sanitized);
    console.log(`           → ${changed} 行変更`);
    return;
  }

  if (backup) {
    fs.copyFileSync(filePath, filePath + '.bak');
    console.log(`  backup  ${rel}.bak`);
  }

  fs.writeFileSync(filePath, sanitized, 'utf8');
  console.log(`  done    ${rel}`);
}

function processTarget(targetPath, rules, options) {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
      if (entry.name.endsWith('.bak')) continue; // バックアップファイルはスキップ
      processTarget(path.join(targetPath, entry.name), rules, options);
    }
  } else if (stat.isFile() && targetPath.endsWith('.md')) {
    processFile(targetPath, rules, options);
  }
}

// === エントリポイント ===
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const backup = args.includes('--backup');
const targets = args.filter(a => !a.startsWith('--'));

if (targets.length === 0) {
  targets.push(path.join(REPO_ROOT, '_session-archives', '_agent-chats'));
}

const rules = buildRules();
const options = { dryRun, backup };

console.log(`\n=== sanitize-chat-archive${dryRun ? ' [DRY RUN]' : ''} ===`);
console.log(`置換ルール数: ${rules.length}`);

for (const target of targets) {
  const absTarget = path.resolve(target);
  if (!fs.existsSync(absTarget)) {
    console.error(`[error] 対象が見つかりません: ${absTarget}`);
    process.exit(1);
  }
  console.log(`\n対象: ${path.relative(REPO_ROOT, absTarget) || absTarget}`);
  processTarget(absTarget, rules, options);
}

console.log('\n完了');
