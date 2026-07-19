import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../utils/logger.js';

/**
 * creations-db サブモジュールが生成コミットしているキャラ別ロールプレイプロンプト
 * （`data/Works_NumberTales/RoleplayPrompts/DB_<Db>/roleplay-prompt-<Num>.md`）から、
 * 「キャラカード」部分だけを抽出して返すローダー。
 *
 * 生成物は GPT 配布用の体裁（`# 命令文` / `# userとの会話を行うにあたって` 等）を伴うが、
 * Misskey Bot の実行時プロンプトに必要なのは中核のキャラ設定セクション
 * （概要・基本情報・口調・趣味趣向・口調の例）だけなので、そこだけを抜き出す。
 * 抽出後は `prompt-builder.ts` が Bot 実行層（形態・応答方針・制約・信頼度）を重ねる。
 *
 * 生成プロンプトは `ConversationPattern` 充填済みのキャラのみ存在するため、未生成キャラでは
 * `null` を返し、呼び出し側が従来のフィールド組み立て（fallback）へ委ねる。
 * 読み込みはサブモジュール物理参照が前提で、欠損環境でも `null` を返して Bot を止めない。
 */

/** サブモジュール（_creations-db）のルート。loader.ts と同一の相対解決。 */
const CREATIONS_DB_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../_creations-db',
);

/** 生成テンプレ由来の固定見出し。全生成ファイルで共通のためアンカーとして使える。 */
const CARD_START_PREFIX = '# あなたが演じる';
const CARD_END_PREFIX = '# userとの会話を行うにあたって';

/** 生 Num（"57" / "000" / "67-old" / "2-alt" 等）のみ許可。パストラバーサル防止。 */
const SAFE_NUM = /^[A-Za-z0-9_-]+$/;
/** DB 名（"Primary" / "SemiPrimary" 等）のみ許可。 */
const SAFE_DB = /^[A-Za-z0-9_]+$/;

/** `${db}/${num}` → 抽出済みカード（未存在・抽出不能は null）。負値もキャッシュする。 */
const cache = new Map<string, string | null>();

/**
 * 生成.md からキャラカード部分（`# あなたが演じる…` 〜 `# userとの…` の直前）を抜き出す。
 * 開始アンカーが見つからない・中身が空なら null。
 */
function extractCard(content: string): string | null {
  const lines = content.split(/\r?\n/);
  const startIdx = lines.findIndex((line) => line.startsWith(CARD_START_PREFIX));
  if (startIdx === -1) return null;

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    if (lines[i]!.startsWith(CARD_END_PREFIX)) {
      endIdx = i;
      break;
    }
  }

  const card = lines.slice(startIdx, endIdx).join('\n').trim();
  return card.length > 0 ? card : null;
}

/**
 * 指定キャラの生成ロールプレイプロンプトからキャラカードを読み込む。
 *
 * @param num    キャラ番号（生 Num。"57" / "000" / "67-old" 等）
 * @param dbName DB 種別（既定 "Primary"。Bot が扱うのは NumberTales/Primary）
 * @returns 抽出済みキャラカード（Markdown）。未生成・欠損・抽出不能なら null。
 */
export function loadGeneratedPromptCard(
  num: string | number,
  dbName = 'Primary',
): string | null {
  const rawNum = String(num).trim();
  const rawDb = String(dbName).trim();
  if (!SAFE_NUM.test(rawNum) || !SAFE_DB.test(rawDb)) return null;

  const cacheKey = `${rawDb}/${rawNum}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const filePath = resolve(
    CREATIONS_DB_ROOT,
    'data/Works_NumberTales/RoleplayPrompts',
    `DB_${rawDb}`,
    `roleplay-prompt-${rawNum}.md`,
  );

  let card: string | null = null;
  try {
    if (existsSync(filePath)) {
      card = extractCard(readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    logger.warn(`Failed to load generated roleplay prompt: ${cacheKey}`, err);
    card = null;
  }

  cache.set(cacheKey, card);
  return card;
}
