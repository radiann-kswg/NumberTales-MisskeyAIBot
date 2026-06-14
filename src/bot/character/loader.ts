import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../utils/logger.js';

export interface CharacterDialogueExample {
  /** 発言テキスト（日本語）。実スキーマの現行フィールド名 */
  value_JP?: string;
  /** 発言テキスト（旧フィールド名・後方互換用） */
  value?: string;
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

export interface CharacterRelation {
  Related?: CharacterRelationItem[];
  /** キャラクターについてのコメント（口調補完に利用可） */
  Commented?: unknown;
}

/** DB フィールドの非公開値ラッパー */
export interface HideTextWrapper {
  hideText: string;
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
  Relation?: CharacterRelation;
  ConversationPattern?: CharacterConversationPattern;
  /** 趣味・得意テーマ（非公開の場合は HideTextWrapper） */
  Hobby?: string | HideTextWrapper;
  /** 特技 */
  SpecialSkill?: string;
  /** 好きなもの */
  Favor?: string;
  /** ヌメロジー上の役割・特性 */
  NumerospecAbout?: string;
  /** 強み・長所（劇中設定） */
  Strength?: string;
  /** 弱み・課題（劇中設定） */
  Weakness?: string;
  /** 劇中での立ち位置・行動概要 */
  InStory?: string;
  /** 背景・来歴 */
  Backgrounds?: string;
  /** 三人称での呼び方（他者からの言及時） */
  ThirdPersonCalling?: string;
}

/** CreationsDBClient の最小インターフェース（.mjs に .d.ts が存在しないため手動定義） */
interface ICreationsDBClient {
  getRecords(workId: string, dbName: string): Promise<unknown[]>;
}

const CREATIONS_DB_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../_creations-db',
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
    ConversationNotes:
      '自分もナンバーテールズの一人でありながら、開発者代行のような視点で他個体を支える立場がにじみやすい。',
  },
};

let cachedReleasedCharacters: CharacterRecord[] | null = null;

/**
 * CreationsDBClient 経由でキャラクターDBを非同期に初期化する。
 * main() の起動シーケンスで一度だけ呼び出すこと。
 * 失敗時はフォールバックとして FALLBACK_CHARACTER のみを使用する。
 */
export async function initializeCharacterDB(): Promise<void> {
  try {
    // .mjs サブモジュールには .d.ts が存在しないため型エラーを抑制して dynamic import する
    // @ts-expect-error -- no .d.ts for .mjs submodule; cast to typed interface below
    const mod = (await import('../../../_creations-db/pkg/nodejs/index.mjs')) as {
      CreationsDBClient: new (repoRoot?: string) => ICreationsDBClient;
    };
    const client = new mod.CreationsDBClient(CREATIONS_DB_ROOT);
    const records = await client.getRecords('NumberTales', 'Primary');
    cachedReleasedCharacters = (records as CharacterRecord[]).filter(
      (entry) => entry.Progress === 'released',
    );
    logger.info(`Character DB loaded: ${cachedReleasedCharacters.length} released records`);
  } catch (err) {
    logger.warn('Failed to load character DB via CreationsDBClient. Using fallback.', err);
    cachedReleasedCharacters = [FALLBACK_CHARACTER];
  }
}

function normalizeNum(value: string | number): string {
  return String(value).trim().replace(/^0+(?=\d)/, '');
}

function loadReleasedCharacters(): CharacterRecord[] {
  if (cachedReleasedCharacters === null) {
    throw new Error('Character DB not initialized. Call initializeCharacterDB() at startup.');
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
