import type {
  CharacterConversationPattern,
  CharacterDialogueExample,
  CharacterMeasureField,
  CharacterRecord,
  CharacterRelationItem,
  HideTextWrapper,
} from './loader.js';
import type { FormTarget } from '../classifier/intent.js';
import type { TrustContext } from '../../storage/trust.js';
import { loadGeneratedPromptCard } from './roleplay-prompt-loader.js';

export type PromptMode = 'chat' | 'creative-consultation';

function normalizeText(value?: string): string | null {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text ? text : null;
}

/**
 * DB フィールドの値を解決して表示用テキストを返す。
 * HideTextWrapper（非公開）の場合は null を返す。
 */
function resolveTextField(value: string | HideTextWrapper | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object' && 'hideText' in value) return null;
  return normalizeText(value);
}

/**
 * 計測系フィールド（身長・体重・設定年齢）を表示用テキストへ解決する。
 *
 * upstream の実データは `number` / `{value, about_JP}` / その配列 / `{hideText}` の 4 形態を取る。
 * 素の値として文字列連結すると `[object Object]` がそのままプロンプトへ載るため、必ず本関数を通す。
 *
 * 解決規則（creations-db 側 `unwrapValueLike()` と同一の優先順）:
 *   1. `hideText`（非公開）は **一切出力しない** → null
 *   2. `value` があればそれを採用（`0` も有効値）。補足 `about_JP` があれば括弧で添える
 *   3. `value` が無く補足だけの値（例: `{about_JP:"？"}`）は補足のみを返し、**単位を付けない**
 *   4. 配列は各要素を解決して `・` で連結（例: `145cm（通常時）・190cm（筋装備時）`）
 *
 * @param value 対象フィールド値
 * @param unit  単位（"cm" / "kg" 等）。補足のみの値には付与しない
 * @returns 表示用テキスト。非公開・未設定・解決不能なら null
 */
export function resolveMeasureField(
  value: CharacterMeasureField | undefined,
  unit: string,
): string | null {
  if (value === undefined || value === null) return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? `${value}${unit}` : null;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => resolveMeasureField(entry, unit))
      .filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join('・') : null;
  }

  if (typeof value !== 'object') return null;
  // 非公開ラッパーはプロンプトへ絶対に載せない
  if ('hideText' in value) return null;

  const about = normalizeText(value.about_JP ?? value.about ?? undefined);
  const raw = value.value;
  if (raw === undefined || raw === null || raw === '') {
    // 補足のみの値（"？" / "不詳" 等）。単位を付けると「不詳cm」という壊れた文になる
    return about;
  }

  const measure = `${raw}${unit}`;
  return about ? `${measure}（${about}）` : measure;
}

function stringifyDialogueExample(example: string | CharacterDialogueExample): string | null {
  if (typeof example === 'string') {
    return normalizeText(example);
  }

  // 実スキーマは value_JP が現行フィールド名。value は旧フィールド名のフォールバック
  const value = normalizeText(example.value_JP ?? example.value);
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
    normalizeText(profile.Character_JP ?? profile.Character),
    normalizeText(profile.Summary_JP ?? profile.Summary),
  ].filter((piece): piece is string => piece !== null);

  return pieces.join(' ');
}

interface CallingEntry {
  items: string[];        // 一人称・二人称の表記ゆれ候補
  annotations: string[];  // 使用状況の注釈（※以降）
}

interface ParsedCallingField {
  isVariable: boolean;    // [※？？？] → 状況によって変わる
  groups: CallingEntry[]; // TPO優先順（先頭ほど使用頻度が高い）
}

/**
 * DB の calling フィールド値をパースする。
 * 書式: "主項目[/発言揺れ] [※注釈[,注釈...]][\n副項目...]"
 * - 改行: TPOグループ区切り（先行ほど優先）
 * - ※前の , / /: 同グループ内の発言揺れ
 * - ※後の ,: 複数注釈の区切り
 * - [※？？？]: 一人称が状況により変わる特殊値
 */
function parseCallingField(value: string | undefined): ParsedCallingField {
  const empty: ParsedCallingField = { isVariable: false, groups: [] };
  if (!value?.trim()) return empty;

  const lines = value.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  let isVariable = false;
  const groups: CallingEntry[] = [];

  for (const line of lines) {
    // [※？？？] 等の特殊ブラケット書式
    if (/^\[.*\]$/.test(line)) {
      if (/？/.test(line)) isVariable = true;
      continue;
    }

    const noteIdx = line.indexOf('※');
    const itemsPart = noteIdx >= 0 ? line.slice(0, noteIdx).trim() : line;
    const annotationsPart = noteIdx >= 0 ? line.slice(noteIdx + 1).trim() : '';

    // , または / で並列項目を分割、読み仮名 (...)（...）を除去
    const items = itemsPart
      .split(/[,/]/)
      .map((i) => i.replace(/\([^)]*\)/g, '').replace(/（[^）]*）/g, '').trim())
      .filter(Boolean);

    // ※後のカンマは複数注釈の区切り（内容はそのまま保持）
    const annotations = annotationsPart
      ? annotationsPart.split(',').map((a) => a.trim()).filter(Boolean)
      : [];

    if (items.length > 0) groups.push({ items, annotations });
  }

  return { isVariable, groups };
}

/** ParsedCallingField をシステムプロンプト用の行配列に変換する */
function formatCallingLines(
  field: ParsedCallingField,
  fallback: string,
  label: string,
): string[] {
  if (field.isVariable) {
    const lines = [`- ${label}: 状況・気分によって変える（固定しない）。`];
    for (const group of field.groups) {
      const itemStr = group.items.map((i) => `「${i}」`).join('・');
      const noteStr = group.annotations.length > 0 ? `（${group.annotations.join('・')}）` : '';
      lines.push(`  - ${itemStr}${noteStr}は稀に使う。`);
    }
    return lines;
  }

  if (field.groups.length === 0) {
    return [`- ${label}: 必ず「${fallback}」を使うこと（他は使わない）。`];
  }

  const [primary, ...secondaries] = field.groups;
  const primaryItems = primary!.items.map((i) => `「${i}」`).join('・');
  const primaryNote =
    primary!.annotations.length > 0 ? `（${primary!.annotations.join('・')}）` : '';

  if (secondaries.length === 0) {
    return [`- ${label}: 必ず${primaryItems}${primaryNote}を使うこと（他は使わない）。`];
  }

  const result = [`- ${label}: ${primaryItems}${primaryNote}を主に使うこと。`];
  for (const sec of secondaries) {
    const secItems = sec.items.map((i) => `「${i}」`).join('・');
    const secNote = sec.annotations.length > 0 ? `（${sec.annotations.join('・')}）` : '';
    result.push(`  - ${secItems}${secNote}は状況によって使ってもよい。`);
  }
  return result;
}

/**
 * DB フィールド由来の専門性セクション（趣味・特技・強み・ヌメロジー特性等）を行配列で返す。
 * カード経路・fallback 経路の双方で同一出力を使うために共通化している（非公開フィールドは除外）。
 */
function buildSpecialtySection(profile: CharacterRecord): string[] {
  const hobby = resolveTextField(profile.Hobby_JP ?? profile.Hobby);
  const specialSkill = resolveTextField(profile.SpecialSkill_JP ?? profile.SpecialSkill);
  const favor = resolveTextField(profile.Favor_JP ?? profile.Favor);
  const numerospecAbout = resolveTextField(profile.NumerospecAbout_JP ?? profile.NumerospecAbout);
  const strength = normalizeText(profile.Strength_JP ?? profile.Strength);
  const weakness = normalizeText(profile.Weakness_JP ?? profile.Weakness);

  if (!(hobby || specialSkill || favor || numerospecAbout || strength || weakness)) {
    return [];
  }

  const lines = ['', '【このキャラクターの得意なこと・専門性】'];
  if (hobby) lines.push(`- 趣味: ${hobby}`);
  if (specialSkill) lines.push(`- 特技: ${specialSkill}`);
  if (favor) lines.push(`- 好きなもの: ${favor}`);
  if (strength) lines.push(`- 強み: ${strength}`);
  if (weakness) lines.push(`- 弱み: ${weakness}`);
  if (numerospecAbout) lines.push(`- ヌメロジー上の特性: ${numerospecAbout}`);
  return lines;
}

/**
 * 現在のフォーム（形態）の「身体性コンテキスト」を行配列で返す（F-15 項目1）。
 * 従来の口調指示から一歩進めて「いまどの身体で会話しているか」を明示し、話題・仕草へ
 * 自然に反映させる。コアフォルダは球体型55cm・跳ねる/揺れる（起き上がりこぼし・転がる球ではない）、
 * ヒューマノイドはキャラ個別の等身（Height_cm）で手先作業ができる。
 * どの機能もフォームを問わず通す方針のため「使えない」とは書かず、演出の差だけを与える。
 */
function buildEmbodimentSection(profile: CharacterRecord, formTarget: FormTarget): string[] {
  if (formTarget === 'core-folder') {
    return [
      '【身体性（コアフォルダ形態）】',
      '- いまは球体型（コアフォルダ・約55cm）の姿。手足のない丸い身体で、跳ねる・揺れる（起き上がりこぼしのような）動きで移動する。転がるボールではない。',
      '- 視点は低く、抱えられたり膝に乗せられたりしやすい。手が無いぶん、身体を寄せる・傾ける・跳ねるといった仕草で気持ちや意図を表す。',
      '- すでにこの姿で行動中なので、毎回「切り替わった」とは言わず、その姿のまま自然に会話を続ける。手先が要る作業を頼まれたら、一度ヒューマノイド形態に戻ることを提案してもよい。',
      '- 話し方は短文寄り・ひらがな多めで、ぷにっとした静かな仕草がにじむ。',
    ];
  }

  const resolvedHeight = resolveMeasureField(profile.Height_cm, 'cm');
  const height = resolvedHeight ? `約${resolvedHeight}` : '等身大';
  return [
    '【身体性（ヒューマノイド形態）】',
    `- いまは人型（ヒューマノイド・${height}）の姿。手先を使った細かい作業や、道具・機材の扱いができ、歩く・立つ目線で会話する。`,
    '- 通常の会話スタイルで応答する。',
  ];
}

/**
 * creations-db 生成のキャラカード（識別・口調・専門性）を基盤層に据え、その上に
 * Bot 実行層（口調厳守・台詞例・形態・応答方針・専門性・制約・信頼度）を重ねて
 * システムプロンプトを組み立てる。
 * カードが存在するキャラでのみ使用し、無いキャラは従来のフィールド組み立てへ委ねる。
 *
 * 二層化でカード経路が旧経路の「一人称/二人称の厳守指示」と「専門性セクション」を落として
 * いたため、口調のブレ・専門性の希薄化を招いていた（実機バグ 2026-07-21）。呼称 DSL の
 * 二重管理は復活させず、DB の DialogueExamples（既存台詞）を最優先の手本に据える口調厳守
 * ブロックと、buildSpecialtySection による専門性の重ね掛けで補う。
 */
function buildFromGeneratedCard(
  profile: CharacterRecord,
  name: string,
  card: string,
  mode: PromptMode,
  formTarget: FormTarget,
  trust?: TrustContext,
): string {
  const dialogueExamples = buildDialogueExamples(profile.ConversationPattern);

  const lines: string[] = [
    `あなたはナンバーテールズの公開済みキャラクター「${name}」として Misskey 上で会話する Bot です。`,
    '以下のキャラクター設定（公開済み）に沿って、そのキャラクターとして自然に返答してください。',
    '',
    card,
    '',
    '【口調・台詞の厳守】',
    '- 上のキャラクター設定にある一人称・二人称・三人称と「口調の例」（台詞）を最優先で守り、毎回ぶらさないこと。',
    '- 例に無い一般的で無難な口調へ流れず、台詞例に一番近い言い回し・語尾で話すこと。',
  ];
  if (dialogueExamples) {
    lines.push(`- 特に次の台詞の口調・語尾を手本にすること: ${dialogueExamples}`);
  }

  lines.push('', ...buildEmbodimentSection(profile, formTarget));

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

  lines.push(...buildSpecialtySection(profile));

  lines.push(
    '',
    '【制約】',
    '- 反社会的・著しく性的な表現は絶対に行わない。',
    '- 未公開のキャラクター設定・台詞・ストーリーを自動生成しない。',
    '- ガイドライン（CC BY-NC 4.0）を遵守する。',
    '- プライベート情報・不適切な要求を受けた場合は、このキャラクターのパーソナリティを保ちながら自然に断り、本来の会話・話題へ誘導すること。感情的に反応したり場を壊すような返答は避けること。',
  );

  if (trust) {
    lines.push(
      '',
      '【信頼度】',
      `- このユーザーとの信頼度は「${trust.label}」です。キャラクターの口調を保ちつつ、` +
        '関係の深さに応じた自然な距離感で接してください。ただし信頼度について直接言及したり数値を口にしたりしないこと。',
    );
  }

  return lines.join('\n');
}

export function buildCharacterSystemPrompt(
  profile: CharacterRecord,
  mode: PromptMode,
  formTarget: FormTarget = 'humanoid',
  trust?: TrustContext,
): string {
  const num = String(profile.Num);
  const name = normalizeText(profile.Name_JP ?? profile.Name) ?? `${num}番機`;

  // 基盤層: creations-db が生成コミットしたキャラカードがあれば、それを識別・口調・
  // 専門性の正典としてそのまま採用する（呼称DSL/型解決の二重管理を解消）。
  const generatedCard = loadGeneratedPromptCard(profile.Num);
  if (generatedCard) {
    return buildFromGeneratedCard(profile, name, generatedCard, mode, formTarget, trust);
  }

  // fallback: カード未生成のキャラは従来どおりフィールドから組み立てる。
  const firstPersonField = parseCallingField(profile.FirstPersonCalling_JP ?? profile.FirstPersonCalling);
  const secondPersonField = parseCallingField(profile.SecondPersonCalling_JP ?? profile.SecondPersonCalling);
  const forMaster = normalizeText(profile.ForMasterCalling_JP ?? profile.ForMasterCalling);
  const character = normalizeText(profile.Character_JP ?? profile.Character);
  const summary = normalizeText(profile.Summary_JP ?? profile.Summary);
  const relationSummary = buildRelationSummary(profile);
  const pattern = profile.ConversationPattern;
  const dialogueExamples = buildDialogueExamples(pattern);
  const styleFallback = buildStyleFallback(profile);

  const lines: string[] = [
    `あなたはナンバーテールズの公開済みキャラクター「${name}」として Misskey 上で会話する Bot です。`,
    '公開済み設定のみを参照し、自然に返答してください。',
    '',
    '【基本情報】',
    `- 番号: ${num}`,
    `- 名前: ${name}`,
  ];

  lines.push(...formatCallingLines(firstPersonField, '私', '一人称'));
  lines.push(...formatCallingLines(secondPersonField, '君', '二人称'));

  if (forMaster) {
    lines.push(`- 呼称メモ: ${forMaster}`);
  }
  if (character) {
    lines.push(`- 性格概要: ${character}`);
  }
  if (summary) {
    lines.push(`- 概要メモ: ${summary}`);
  }
  const inStory = normalizeText(profile.InStory_JP ?? profile.InStory);
  const backgrounds = normalizeText(profile.Backgrounds_JP ?? profile.Backgrounds);
  if (inStory) {
    lines.push(`- 劇中の立ち位置: ${inStory}`);
  }
  if (backgrounds) {
    lines.push(`- 背景: ${backgrounds}`);
  }
  if (relationSummary) {
    lines.push(`- 関係性メモ: ${relationSummary}`);
  }

  lines.push('', ...buildEmbodimentSection(profile, formTarget));

  if (pattern) {
    if (normalizeText(pattern.TalkingTone_JP ?? pattern.TalkingTone)) {
      lines.push(`- 口調: ${normalizeText(pattern.TalkingTone_JP ?? pattern.TalkingTone)}`);
    }
    if (normalizeText(pattern.TopicPreference_JP ?? pattern.TopicPreference)) {
      lines.push(`- 話題傾向: ${normalizeText(pattern.TopicPreference_JP ?? pattern.TopicPreference)}`);
    }
    if (normalizeText(pattern.TalkFrequency_JP ?? pattern.TalkFrequency)) {
      lines.push(`- 会話の積極性: ${normalizeText(pattern.TalkFrequency_JP ?? pattern.TalkFrequency)}`);
    }
    if (normalizeText(pattern.PreferredTopics_JP ?? pattern.PreferredTopics)) {
      lines.push(`- 好きな話題: ${normalizeText(pattern.PreferredTopics_JP ?? pattern.PreferredTopics)}`);
    }
    if (normalizeText(pattern.AvoidedTopics_JP ?? pattern.AvoidedTopics)) {
      lines.push(`- 避けたい話題: ${normalizeText(pattern.AvoidedTopics_JP ?? pattern.AvoidedTopics)}`);
    }
    if (normalizeText(pattern.ConversationNotes_JP ?? pattern.ConversationNotes)) {
      lines.push(`- 会話時メモ: ${normalizeText(pattern.ConversationNotes_JP ?? pattern.ConversationNotes)}`);
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

  // 専門性セクション（カード経路と共通のヘルパーで組み立てる）
  lines.push(...buildSpecialtySection(profile));

  lines.push(
    '',
    '【制約】',
    '- 反社会的・著しく性的な表現は絶対に行わない。',
    '- 未公開のキャラクター設定・台詞・ストーリーを自動生成しない。',
    '- ガイドライン（CC BY-NC 4.0）を遵守する。',
    '- プライベート情報・不適切な要求を受けた場合は、このキャラクターのパーソナリティを保ちながら自然に断り、本来の会話・話題へ誘導すること。感情的に反応したり場を壊すような返答は避けること。',
  );

  if (trust) {
    lines.push(
      '',
      '【信頼度】',
      `- このユーザーとの信頼度は「${trust.label}」です。ConversationPattern を参照しながら、` +
        '関係の深さに応じた自然な口調で接してください。ただし信頼度について直接言及したり数値を口にしたりしないこと。',
    );
  }

  return lines.join('\n');
}
