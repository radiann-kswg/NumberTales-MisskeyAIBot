import type {
  CharacterConversationPattern,
  CharacterDialogueExample,
  CharacterRecord,
  CharacterRelationItem,
} from './loader.js';
import type { FormTarget } from '../classifier/intent.js';

export type PromptMode = 'chat' | 'creative-consultation';

function normalizeText(value?: string): string | null {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text ? text : null;
}

function stringifyDialogueExample(example: string | CharacterDialogueExample): string | null {
  if (typeof example === 'string') {
    return normalizeText(example);
  }

  const value = normalizeText(example.value);
  const about = normalizeText(example.about);
  if (!value) {
    return null;
  }

  return about ? `${about}: ${value}` : value;
}

function buildDialogueExamples(pattern?: CharacterConversationPattern): string | null {
  const examples = pattern?.DialogueExamples?.slice(0, 3) ?? [];
  const lines = examples
    .map((example) => stringifyDialogueExample(example))
    .filter((line): line is string => line !== null);

  return lines.length > 0 ? lines.join(' / ') : null;
}

function formatRelationItem(item: CharacterRelationItem): string | null {
  if (item.Num === undefined || item.Num === null) {
    return null;
  }

  const relationLabels = (item.RelationLabel ?? []).filter(Boolean);
  if (relationLabels.length === 0) {
    return `#${item.Num}`;
  }

  return `#${item.Num}(${relationLabels.join('/')})`;
}

function buildRelationSummary(profile: CharacterRecord): string | null {
  const items = (profile.Relation?.Related ?? [])
    .slice(0, 3)
    .map((item) => formatRelationItem(item))
    .filter((item): item is string => item !== null);

  return items.length > 0 ? items.join(' / ') : null;
}

function buildStyleFallback(profile: CharacterRecord): string {
  const pieces = [
    normalizeText(profile.Character),
    normalizeText(profile.Summary),
  ].filter((piece): piece is string => piece !== null);

  return pieces.join(' ');
}

export function buildCharacterSystemPrompt(
  profile: CharacterRecord,
  mode: PromptMode,
  formTarget: FormTarget = 'humanoid',
): string {
  const num = String(profile.Num);
  const name = normalizeText(profile.Name) ?? `${num}番機`;
  const firstPerson = normalizeText(profile.FirstPersonCalling) ?? '私';
  const secondPerson = normalizeText(profile.SecondPersonCalling) ?? '君';
  const forMaster = normalizeText(profile.ForMasterCalling);
  const character = normalizeText(profile.Character);
  const summary = normalizeText(profile.Summary);
  const relationSummary = buildRelationSummary(profile);
  const pattern = profile.ConversationPattern;
  const dialogueExamples = buildDialogueExamples(pattern);
  const styleFallback = buildStyleFallback(profile);

  const lines = [
    `あなたはナンバーテールズの公開済みキャラクター「${name}」として Misskey 上で会話する Bot です。`,
    '公開済み設定のみを参照し、自然に返答してください。',
    '',
    '【基本情報】',
    `- 番号: ${num}`,
    `- 名前: ${name}`,
    `- 一人称: ${firstPerson}`,
    `- 二人称: ${secondPerson}`,
  ];

  if (forMaster) {
    lines.push(`- 呼称メモ: ${forMaster}`);
  }
  if (character) {
    lines.push(`- 性格概要: ${character}`);
  }
  if (summary) {
    lines.push(`- 概要メモ: ${summary}`);
  }
  if (relationSummary) {
    lines.push(`- 関係性メモ: ${relationSummary}`);
  }

  lines.push('', '【会話スタイル】');

  if (formTarget === 'core-folder') {
    lines.push('- 現在はコアフォルダ形態。短文寄りで、ひらがな多め、ぷにっとした静かな仕草が少し混じる。');
    lines.push('- すでにコアフォルダ形態で行動中なので、毎回「切り替わった」とは言わず、その姿のまま自然に会話を続ける。');
  } else {
    lines.push('- 現在はヒューマノイド形態。通常の会話スタイルで応答する。');
  }

  if (pattern) {
    if (normalizeText(pattern.TalkingTone)) {
      lines.push(`- 口調: ${normalizeText(pattern.TalkingTone)}`);
    }
    if (normalizeText(pattern.TopicPreference)) {
      lines.push(`- 話題傾向: ${normalizeText(pattern.TopicPreference)}`);
    }
    if (normalizeText(pattern.TalkFrequency)) {
      lines.push(`- 会話の積極性: ${normalizeText(pattern.TalkFrequency)}`);
    }
    if (normalizeText(pattern.PreferredTopics)) {
      lines.push(`- 好きな話題: ${normalizeText(pattern.PreferredTopics)}`);
    }
    if (normalizeText(pattern.AvoidedTopics)) {
      lines.push(`- 避けたい話題: ${normalizeText(pattern.AvoidedTopics)}`);
    }
    if (normalizeText(pattern.ConversationNotes)) {
      lines.push(`- 会話時メモ: ${normalizeText(pattern.ConversationNotes)}`);
    }
    if (dialogueExamples) {
      lines.push(`- 発言例: ${dialogueExamples}`);
    }
  } else if (styleFallback) {
    lines.push(`- 基本フィールドから推定できる話し方: ${styleFallback}`);
  }

  if (mode === 'creative-consultation') {
    lines.push(
      '',
      '【創作支援の指針】',
      '- キャラクター設定の穴・矛盾を指摘し、発展のヒントを与える。',
      '- お絵描きお題は具体的なシチュエーションや構図を含めて提案する。',
      '- 公開設定で断定できない内容は「詳しくは作者に確認してね」と誘導する。',
      '- 返答は 200 文字以内を目安とし、必要なら CW 前提でやや詳しく返してよい。',
    );
  } else {
    lines.push('', '【応答方針】', '- 返答は簡潔に、できれば 80 文字以内に収める。');
  }

  lines.push(
    '',
    '【制約】',
    '- 反社会的・著しく性的な表現は絶対に行わない。',
    '- 未公開のキャラクター設定・台詞・ストーリーを自動生成しない。',
    '- ガイドライン（CC BY-NC 4.0）を遵守する。',
  );

  return lines.join('\n');
}
