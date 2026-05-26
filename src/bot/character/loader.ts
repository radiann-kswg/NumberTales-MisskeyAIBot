import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { logger } from '../../utils/logger.js';

export interface CharacterDialogueExample {
  value: string;
  about?: string;
}

export interface CharacterConversationPattern {
  TalkingTone?: string;
  TopicPreference?: string;
  TalkFrequency?: string;
  PreferredTopics?: string;
  AvoidedTopics?: string;
  ConversationNotes?: string;
  DialogueExamples?: Array<string | CharacterDialogueExample>;
}

export interface CharacterRelationItem {
  Num?: string | number;
  RelationLabel?: string[];
}

export interface CharacterRecord {
  Num: string | number;
  Name?: string;
  Progress?: string;
  FirstPersonCalling?: string;
  SecondPersonCalling?: string;
  ForMasterCalling?: string;
  Character?: string;
  Summary?: string;
  Relation?: {
    Related?: CharacterRelationItem[];
  };
  ConversationPattern?: CharacterConversationPattern;
}

const CHARACTER_DB_PATH = fileURLToPath(
  new URL('../../../_creations-db/data/Works_NumberTales/DataBases/db_Primary.json', import.meta.url),
);

const FALLBACK_CHARACTER: CharacterRecord = {
  Num: '000',
  Name: '000(チトセ)',
  FirstPersonCalling: '私',
  SecondPersonCalling: '君',
  Character: '中性的でフレンドリー、姉御肌で職人気質な若手エンジニアのような話し方。',
  ConversationPattern: {
    TalkingTone: '中性的でフレンドリーな明るい話し方。',
    TopicPreference: 'ナンバーテールズの設定深掘りや創作支援、ヒューマノイド全般の知見に強い関心を示す。',
    TalkFrequency: '比較的自分から会話を進めることが多い。',
    ConversationNotes: '自分もナンバーテールズの一人でありながら、開発者代行のような視点で他個体を支える立場がにじみやすい。',
  },
};

let cachedReleasedCharacters: CharacterRecord[] | null = null;

function normalizeNum(value: string | number): string {
  return String(value).trim().replace(/^0+(?=\d)/, '');
}

function loadReleasedCharacters(): CharacterRecord[] {
  if (cachedReleasedCharacters !== null) {
    return cachedReleasedCharacters;
  }

  try {
    const raw = readFileSync(CHARACTER_DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as CharacterRecord[];
    cachedReleasedCharacters = parsed.filter((entry) => entry.Progress === 'released');
  } catch (err) {
    logger.warn('Failed to load released NumberTales character DB. Falling back to 000 profile.', err);
    cachedReleasedCharacters = [FALLBACK_CHARACTER];
  }

  return cachedReleasedCharacters;
}

export function getReleasedCharacters(): CharacterRecord[] {
  return loadReleasedCharacters();
}

export function getReleasedCharacterByNum(num: string): CharacterRecord | null {
  const target = normalizeNum(num);
  return loadReleasedCharacters().find((entry) => normalizeNum(entry.Num) === target) ?? null;
}

export function getDefaultCharacterProfile(): CharacterRecord {
  return getReleasedCharacterByNum('000') ?? FALLBACK_CHARACTER;
}
