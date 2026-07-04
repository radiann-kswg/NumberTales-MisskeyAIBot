import type { CharacterRecord } from './loader.js';
import { getReleasedCharacterByNum, getReleasedCharacters } from './loader.js';
import type { FormTarget } from '../classifier/intent.js';
import { toHalfWidthDigits } from '../../utils/text.js';

const SWITCH_KEYWORD_PATTERN = /話したい|話して|お願い|呼んで|切り替え|チェンジ|交代|にして|で頼む|来て|来てもら|出てきて|担当|相手して|会話したい|頼みたい|頼む/;
const DEFAULT_SWITCH_KEYWORD_PATTERN = /デフォルト|既定|標準|全体|みんな|通常担当|基本担当/;
const HONORIFIC_SUFFIX_PATTERN = /(ちゃん|くん|さん|様|さま)$/;
const SWITCH_HELP_PATTERN = /((キャラ|キャラクター).*(切り替え|変更|交代|呼び方|使い方))|((誰|だれ).*(話せる|呼べる))|(切り替え.*(ヘルプ|help|使い方))|((ヘルプ|help).*(キャラ|キャラクター|切り替え))/i;
const RESET_SWITCH_PATTERN = /(担当|キャラ|キャラクター).*(戻して|解除|リセット)|標準担当に戻して|デフォルトに戻して|既定に戻して|通常担当に戻して/;

function normalizeSearchText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[「」『』・]/g, '');
}

function stripHonorific(text: string): string {
  return text.replace(HONORIFIC_SUFFIX_PATTERN, '');
}

function extractAliases(profile: CharacterRecord): string[] {
  const aliases = new Set<string>();
  const name = profile.Name_JP ?? profile.Name ?? '';
  const normalizedName = normalizeSearchText(name);
  if (normalizedName) {
    aliases.add(normalizedName);
    aliases.add(stripHonorific(normalizedName));
  }

  const noLeadingNum = normalizeSearchText(name.replace(/^[#＃]?[0-9０-９]+/, '').replace(/[()（）]/g, ''));
  if (noLeadingNum) {
    aliases.add(noLeadingNum);
    aliases.add(stripHonorific(noLeadingNum));
  }

  for (const match of name.matchAll(/[（(]([^()（）]+)[)）]/g)) {
    const inside = normalizeSearchText(match[1] ?? '');
    if (inside) {
      aliases.add(inside);
      aliases.add(stripHonorific(inside));
    }
  }

  return [...aliases].filter((alias) => alias.length >= 2);
}

function findByName(text: string): CharacterRecord | null {
  const normalizedText = normalizeSearchText(text);
  const matches = getReleasedCharacters()
    .map((profile) => {
      const alias = extractAliases(profile)
        .sort((left, right) => right.length - left.length)
        .find((candidate) => normalizedText.includes(candidate));
      return alias ? { profile, alias } : null;
    })
    .filter((item): item is { profile: CharacterRecord; alias: string } => item !== null)
    .sort((left, right) => right.alias.length - left.alias.length);

  return matches[0]?.profile ?? null;
}

export function resolveCharacterSwitchTarget(text: string): CharacterRecord | null {
  if (!SWITCH_KEYWORD_PATTERN.test(text)) {
    return null;
  }

  const numMatch = toHalfWidthDigits(text).match(/(?:#\s*(0*\d{1,3}))|(?:\b(0*\d{1,3})\s*番機)/);
  const num = numMatch?.[1] ?? numMatch?.[2];
  if (num) {
    return getReleasedCharacterByNum(num);
  }

  return findByName(text);
}

export function resolveDefaultCharacterTarget(text: string): CharacterRecord | null {
  if (!DEFAULT_SWITCH_KEYWORD_PATTERN.test(text) || !SWITCH_KEYWORD_PATTERN.test(text)) {
    return null;
  }

  const target = resolveCharacterSwitchTarget(text);
  if (target) {
    return target;
  }

  if (/チトセに戻|000に戻|デフォルトに戻|標準に戻/.test(text)) {
    return getReleasedCharacterByNum('000');
  }

  return null;
}

export function isCharacterSwitchHelpRequest(text: string): boolean {
  return SWITCH_HELP_PATTERN.test(text);
}

export function isCharacterSwitchResetRequest(text: string): boolean {
  return RESET_SWITCH_PATTERN.test(text);
}

/** 管理者コマンド: 週次自発投稿担当（スケジューラーキャラクター）の切り替え検出 */
const SCHEDULER_CHAR_SWITCH_PATTERN =
  /週.*担当|自発投稿.*担当|投稿担当|スケジューラー.*担当|来週.*担当|今週.*担当.*変更|今週.*担当.*切り替え/;

/**
 * 管理者コマンドとして自発投稿担当（STATE_KEY_SCHEDULER_CHAR）を切り替えるキャラクターを解決する。
 * キーワードが一致し、かつ対象キャラクターを特定できた場合のみ非 null を返す。
 *
 * 通常の `resolveCharacterSwitchTarget` に加えて、
 * 「29にして」「36にして」のような単純番号指定もスケジューラーコマンドとして受け付ける。
 *
 * @param text メンション本文
 * @returns 切り替え先 CharacterRecord、対象不明 or パターン不一致なら null
 */
export function resolveSchedulerCharTarget(text: string): CharacterRecord | null {
  if (!SCHEDULER_CHAR_SWITCH_PATTERN.test(text)) return null;

  // 通常の切り替え解決（#29 / 29番機 / 名前指定）
  const bySwitch = resolveCharacterSwitchTarget(text);
  if (bySwitch) return bySwitch;

  // スケジューラーコマンド専用: 単純番号指定（例: 「29にして」「を36に」）
  const numMatch = toHalfWidthDigits(text).match(/[をにへ「」]?\s*(0*\d{1,3})\s*(?:番機|にして|へ変更|に変更|に切り替え|を担当)/);
  if (numMatch?.[1]) {
    return getReleasedCharacterByNum(numMatch[1]);
  }

  // 名前のみ指定（「来週担当をニトクに」のような形）
  return findByName(text);
}

export function buildCharacterSwitchText(target: CharacterRecord, alreadyActive: boolean): string {
  const name = target.Name_JP ?? target.Name ?? `${String(target.Num)}番機`;
  const firstPerson = normalizeCalling(target.FirstPersonCalling_JP ?? target.FirstPersonCalling, 'この子');

  if (alreadyActive) {
    return `${name}で待機しているよ。続けて話してみて。`;
  }

  return `${name}に切り替わったよ。これからは${firstPerson}が応答するね。`;
}

export function buildDefaultCharacterSwitchText(target: CharacterRecord, alreadyDefault: boolean): string {
  const name = target.Name_JP ?? target.Name ?? `${String(target.Num)}番機`;

  if (alreadyDefault) {
    return `全体の標準担当は、すでに${name}のままだよ。`;
  }

  return `全体の標準担当を${name}に更新したよ。個別指定のない相手にはこの子で応答するね。`;
}

function normalizeCalling(value: string | undefined, fallback: string): string {
  if (!value?.trim()) return fallback;
  // 改行区切りの最初の行から、※ 以前の先頭項目（, または / 区切り）のみ採用する
  const firstLine = value.split('\n')[0]!.trim();
  if (/^\[.*\]$/.test(firstLine)) return fallback;
  const noteIdx = firstLine.indexOf('※');
  const itemsPart = noteIdx >= 0 ? firstLine.slice(0, noteIdx).trim() : firstLine;
  const primary = itemsPart
    .split(/[,/]/)[0]!
    .replace(/\([^)]*\)/g, '')
    .replace(/（[^）]*）/g, '')
    .trim();
  return primary || fallback;
}

export function buildFormSwitchText(
  target: CharacterRecord,
  formTarget: FormTarget,
): string {
  const name = target.Name_JP ?? target.Name ?? `${String(target.Num)}番機`;
  const firstPerson = normalizeCalling(target.FirstPersonCalling_JP ?? target.FirstPersonCalling, '私');

  if (formTarget === 'core-folder') {
    return `${name}がコアフォルダ形態になったよ。${firstPerson}は ぷにっと待機中。何かあるかな？`;
  }

  return `${name}がヒューマノイド形態に戻ったよ。${firstPerson}の方でそのまま話せる。続けようか。`;
}

export function buildCharacterSwitchHelpText(options: {
  activeCharacterName: string;
  defaultCharacterName: string;
  isAdmin: boolean;
}): string {
  const lines = [
    `今の担当は ${options.activeCharacterName}、標準担当は ${options.defaultCharacterName} だよ。`,
    '切り替え例: 「1番機と話したい」「ハジメちゃん呼んで」「ハジメちゃんをコアフォルダにして」',
    '元の標準担当に戻すなら「担当を標準に戻して」「キャラクター設定を解除して」で戻せる。',
    '名前指定か番号指定で切り替えられる。フォーム指定も同時に書いて大丈夫。',
  ];

  if (options.isAdmin) {
    lines.push('管理者なら「全体のデフォルトを3番機にして」で標準担当も変更できる。');
    lines.push('管理者なら「週の投稿担当を29にして」「来週担当を変更して(名前)」で自発投稿担当も変更できる。');
  }

  return lines.join('\n');
}

export function buildCharacterResetText(defaultCharacterName: string, alreadyDefault: boolean): string {
  if (alreadyDefault) {
    return `今はすでに標準担当の ${defaultCharacterName} で応答しているよ。`;
  }

  return `個別担当を解除して、標準担当の ${defaultCharacterName} に戻したよ。`;
}
