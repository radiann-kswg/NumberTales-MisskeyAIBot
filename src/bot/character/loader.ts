import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../utils/logger.js';

export interface CharacterDialogueExample {
  /** 発言テキスト（日本語）。実スキーマの現行フィールド名 */
  value_JP?: string;
  /** 発言テキスト（旧フィールド名・後方互換用） */
  value?: string;
  /** 備考（日本語） */
  about?: string;
  /** 備考（英語） */
  about_EN?: string;
}

/**
 * ThisMasters エントリ（$Def_ThisMastersEntry 型）
 * 旧フォーマット（value / about）は廃止済み。現行は value_JP / about_JP を使用する。
 * _DBLink がある場合は DB 参照リンク（$Def_DBLinkRef 形式）を保持する（ボット側では未使用）。
 */
export interface CharacterThisMastersEntry {
  /** 主人名（日本語） */
  value_JP?: string | null;
  /** 備考（日本語） */
  about_JP?: string | null;
  /** 主人名（英語） */
  value_EN?: string | null;
  /** 備考（英語） */
  about_EN?: string | null;
  /** DB参照リンク（$Def_DBLinkRef 形式、ボット側では参照のみ） */
  _DBLink?: unknown;
}

export interface CharacterConversationPattern {
  TalkingTone_JP?: string;
  TalkingTone?: string;
  TopicPreference_JP?: string;
  TopicPreference?: string;
  TalkFrequency_JP?: string;
  TalkFrequency?: string;
  PreferredTopics_JP?: string;
  PreferredTopics?: string;
  AvoidedTopics_JP?: string;
  AvoidedTopics?: string;
  ConversationNotes_JP?: string;
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

/**
 * 補足付きの値（`{ value, about_JP, about_EN }` 形式）。
 * `value` を持たず補足だけのレコードも実在する（例: ConceptAge が `{ about_JP: "？" }`）。
 */
export interface CharacterValueLike {
  value?: number | string | null;
  about_JP?: string | null;
  about_EN?: string | null;
  /** 備考（旧フィールド名・後方互換用） */
  about?: string | null;
}

/**
 * 身長・体重・設定年齢のような計測系フィールド。
 *
 * 「素の数値」だけでなく補足付き値・その配列・非公開ラッパーも取りうる（upstream 実データで確認）。
 * 例: `Height_cm` #67 = `[{value:145,about_JP:"通常時"},{value:190,about_JP:"筋装備時"}]`、
 * `Weight_kg` は released 93 件中 35 件が `{hideText:"非公開"}`。
 * 素の `number` 前提で扱うと表示が欠落する（`String(obj)` で `[object Object]` 化する）ため、
 * 参照側は必ず `resolveMeasureField()` 経由で解決すること。
 */
export type CharacterMeasureField =
  | number
  | CharacterValueLike
  | CharacterValueLike[]
  | HideTextWrapper;

/** 尻尾ユニット（$Def_TailsUnit[]）: 形状・本数・注記 */
export interface CharacterTailsUnit {
  /** 形状の enum 参照（例: "#TailShape_Cat"）。生成カードでは日本語化済みの文面が使われる */
  TailShapeType?: string;
  Count?: number;
  /** 分岐数（複数股の尻尾）。released 93 件中 65 件が保持 */
  Branches?: number;
  /** 節の数（分節構造を持つ尻尾） */
  Segment?: number;
  /** 尻尾ユニット画像のファイル名（Bot 側では未使用） */
  TailsUnit_PNGName?: string;
  Note_JP?: string;
  Note_EN?: string;
  Note?: string;
}

export interface CharacterRecord {
  Num: string | number;
  Name_JP?: string;
  Name?: string;
  Progress?: string;
  FirstPersonCalling_JP?: string;
  FirstPersonCalling?: string;
  SecondPersonCalling_JP?: string;
  SecondPersonCalling?: string;
  ForMasterCalling_JP?: string;
  ForMasterCalling?: string;
  Character_JP?: string;
  Character?: string;
  Summary_JP?: string;
  Summary?: string;
  Relation?: CharacterRelation;
  ConversationPattern?: CharacterConversationPattern;
  /** 趣味・得意テーマ（非公開の場合は HideTextWrapper） */
  Hobby_JP?: string | HideTextWrapper;
  Hobby?: string | HideTextWrapper;
  /** 特技 */
  SpecialSkill_JP?: string;
  SpecialSkill?: string;
  /** 好きなもの */
  Favor_JP?: string;
  Favor?: string;
  /** ヌメロジー上の役割・特性 */
  NumerospecAbout_JP?: string;
  NumerospecAbout?: string;
  /** 強み・長所（劇中設定） */
  Strength_JP?: string;
  Strength?: string;
  /** 弱み・課題（劇中設定） */
  Weakness_JP?: string;
  Weakness?: string;
  /** 劇中での立ち位置・行動概要 */
  InStory_JP?: string;
  InStory?: string;
  /** 背景・来歴 */
  Backgrounds_JP?: string;
  Backgrounds?: string;
  /** 身長（cm・ヒューマノイド形態の等身）。F-15 身体性コンテキストで使用 */
  Height_cm?: CharacterMeasureField;
  /** 体重（kg） */
  Weight_kg?: CharacterMeasureField;
  /** 設定年齢 */
  ConceptAge?: CharacterMeasureField;
  /** クラス・分類タグ（例: ["試験用個体","1桁番"]。dict_Class.json はコード(Class)と表示名(Class_JP)を分離済みで、本フィールドにはコード側が入る） */
  Class?: string[];
  /** 尻尾ユニット（形状・本数）。F-15 身体性コンテキストで使用 */
  TailsUnit?: CharacterTailsUnit[];
  /** 三人称での呼び方（他者からの言及時） */
  ThirdPersonCalling_JP?: string;
  ThirdPersonCalling?: string;
  /**
   * 専属契約した主人リスト（$Def_ThisMastersEntry[] 型）
   * v2026-06 以降、ThisMasters_EN は廃止され本フィールドに日英両フィールドが統合された。
   */
  ThisMasters?: CharacterThisMastersEntry[] | null;
  /**
   * 他 DB キャラクターとの関係（RelationToPrimary から改名: v2026-06）
   * Secondary/SemiPrimary の個体がどの Primary 個体と関係を持つかを示す。
   */
  RelationTo_Primary?: CharacterRelation | null;
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

const CLOUDFLARE_API_RECORDS_URL =
  'https://database.numbertales-radiann.net/api/v1/NumberTales/Primary/records';

/**
 * CreationsDBClient 経由でキャラクターDBを非同期に初期化する。
 * main() の起動シーケンスで一度だけ呼び出すこと。
 *
 * フォールバック順序:
 *   ① サブモジュール物理参照（CreationsDBClient）
 *   ② Cloudflare Workers API（HTTP fetch）
 *   ③ FALLBACK_CHARACTER のみ
 */
export async function initializeCharacterDB(): Promise<void> {
  // ① 物理参照（サブモジュール）
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
    return;
  } catch (err) {
    logger.warn('Failed to load character DB via submodule. Trying Cloudflare API...', err);
  }

  // ② Cloudflare Workers API フォールバック
  try {
    const res = await fetch(CLOUDFLARE_API_RECORDS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const records = (await res.json()) as CharacterRecord[];
    cachedReleasedCharacters = records.filter((entry) => entry.Progress === 'released');
    logger.info(
      `Character DB loaded via Cloudflare API: ${cachedReleasedCharacters.length} released records`,
    );
    return;
  } catch (err) {
    logger.warn('Failed to load character DB via Cloudflare API. Using fallback.', err);
  }

  // ③ デフォルトキャラクターのみ
  cachedReleasedCharacters = [FALLBACK_CHARACTER];
}

/** ゼロ埋めの表記ゆれを吸収する（"057" → "57"） */
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
  const characters = loadReleasedCharacters();
  const raw = String(num).trim();

  // DB は "000"(チトセ) / "0"(零 零) / "00"(零 百) を別レコードとして区別しているが、
  // normalizeNum() は3つとも "0" に潰してしまう。先に生値の完全一致で引くことで取り違えを防ぐ。
  const exact = characters.find((entry) => String(entry.Num).trim() === raw);
  if (exact) {
    return exact;
  }

  const target = normalizeNum(raw);
  return characters.find((entry) => normalizeNum(entry.Num) === target) ?? null;
}

export function getDefaultCharacterProfile(): CharacterRecord {
  return getReleasedCharacterByNum('000') ?? FALLBACK_CHARACTER;
}
