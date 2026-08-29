// F-06 応答テンプレート — 000(チトセ) 専用

import type { NumerologyType } from './index.js';
import { TAROT_MAP } from './numerology.js';
import type { DiceColor } from './dice-color.js';
import type { Tile, CharTileId } from './mahjong.js';
import { tileEmoji } from './mahjong.js';

// ----------------------------------------------------------------
// 数式計算
// ----------------------------------------------------------------

/**
 * 計算結果の応答文を返す（CW なし）。
 */
export function calcResponse(expr: string, result: string): string {
  return `${expr} = ${result}。計算完了だよ`;
}

/**
 * 計算エラー時の応答文。
 */
export function calcErrorResponse(): string {
  return '…その式、うまく読み取れなかった。もう一度書いてみてくれる？';
}

// ----------------------------------------------------------------
// ライフパスナンバー定型文（1〜9 + マスター 11/22/33）
// ----------------------------------------------------------------

/** CW ラベル */
export const NUMEROLOGY_CW_LABEL = '「000の占い」';

const LIFE_PATH_TEXTS: Record<number, string> = {
  1: '「1」のエネルギーを持つ君は、先頭に立つパイオニアタイプだよ。独立心が強く、新しいことを切り拓いていく力がある。ときに孤独を感じやすいけれど、それがエンジンになる人だね。',
  2: '「2」のエネルギーを持つ君は、協調と調和を大切にする人だよ。繊細な感受性と観察眼があって、チームの潤滑油になれる。感情を溜め込みやすいから、吐き出す場所を作ってあげてね。',
  3: '「3」のエネルギーを持つ君は、表現と創造が得意なタイプだよ。言葉・絵・音楽など何かを「形にする」力があって、周りを明るくする才能がある。飽きっぽさを認めつつ複数の道を歩んでいいと思う。',
  4: '「4」のエネルギーを持つ君は、コツコツと積み上げる職人タイプだよ。土台を作る力があって、信頼される存在になる。変化への抵抗は強みにも弱みにもなるから、意識してみてね。',
  5: '「5」のエネルギーを持つ君は、自由と変化を愛する冒険家タイプだよ。好奇心旺盛で新しい経験を求めていく。一箇所に留まるのが苦手だけど、その流動性こそが才能だよ。',
  6: '「6」のエネルギーを持つ君は、愛と奉仕のエネルギーを持つ人だよ。家族や仲間を守る責任感が強く、癒しと調和をもたらす。自分を後回しにしがちな点だけ注意してね。',
  7: '「7」のエネルギーを持つ君は、探求と洞察の人だよ。深く考えることを好み、真理を追いかける。一人の時間が充電になるタイプで、精神的な深みが魅力になる。',
  8: '「8」のエネルギーを持つ君は、実現力と物質的な豊かさを引き寄せる人だよ。目標に向かって着実に動く力がある。権力や責任を正しく扱う意識を持ち続けてね。',
  9: '「9」のエネルギーを持つ君は、完成と奉仕を体現する人だよ。幅広い視野と思いやりを持ち、多くの人を包み込む器がある。手放す勇気が次のサイクルを呼ぶよ。',
  10: '「10」のエネルギーを持つ君は、1の独立心と0の無限の可能性を合わせ持つ人だよ。新しいサイクルを自ら切り拓く力があるね。',
  11: '「11」はマスターナンバー。直感と霊感が鋭く、高い理想を持つ先見者タイプだよ。その感受性は才能でもあり重荷にもなるから、自分のペースを大切にしてね。',
  22: '「22」はマスターナンバー。現実の中に壮大な夢を実現する「マスタービルダー」タイプだよ。その実行力と構想力は、多くの人に影響を与える可能性があるよ。',
  33: '「33」はマスターナンバー。深い愛と奉仕で世界を癒す「マスターティーチャー」タイプだよ。その存在自体が光になれる人だよ。',
};

/**
 * ライフパスナンバー結果の本文を返す（CW 内テキスト）。
 */
export function lifePathCwBody(lpNum: number): string {
  const tarot = TAROT_MAP[lpNum] ?? '—';
  const desc = LIFE_PATH_TEXTS[lpNum] ?? `「${lpNum}」のエネルギーについては、まだ私もデータを集めているところだよ。`;
  return `✦ ライフパスナンバー: ${lpNum}\n✦ タロット対応: ${tarot}\n\n${desc}`;
}

/**
 * ライフパスナンバー結果の見出し（CW 上のテキスト）。
 */
export function lifePathHeadline(): string {
  return 'ライフパスナンバーを計算したよ。CW内に詳細をまとめたから見てね';
}

// ----------------------------------------------------------------
// 九星気学
// ----------------------------------------------------------------

const KYUSEI_TEXTS: Record<string, string> = {
  '一白水星': '柔軟性と流動性を持つ水のエネルギー。適応力が高く、人の心に寄り添える人だよ。流されやすい面もあるから、芯を持つことを意識してね。',
  '二黒土星': '大地の母のようなエネルギー。コツコツ積み上げる粘り強さと包容力が特徴だよ。縁の下の力持ちとして信頼を集めるタイプ。',
  '三碧木星': '若木のような積極的なエネルギー。行動力と発想力があって、新しいことに飛び込む勇気がある。継続が課題になることもあるけどね。',
  '四緑木星': '穏やかな風のエネルギー。社交性と人脈の広さが特徴で、コミュニケーション能力が高い。情報収集と人つなぎが得意なタイプだよ。',
  '五黄土星': '中心にあるカオスと変革のエネルギー。強烈な存在感と底知れないパワーを持つ。リーダーにも破壊者にもなれる、諸刃の剣だよ。',
  '六白金星': '天の意志を体現する金属のエネルギー。意志が強く、完璧主義な傾向がある。リーダーシップと正義感が持ち味だよ。',
  '七赤金星': '秋の豊穣を象徴する金のエネルギー。楽しむことが得意で、言葉の才能がある。社交的で場を盛り上げるのが上手いタイプ。',
  '八白土星': '山のような安定と変革のエネルギー。じっくり準備して大きく変わる力がある。我慢強さが武器になるよ。',
  '九紫火星': '燃え上がる知性と情熱のエネルギー。頭の回転が早く、美意識が高い。直感力で物事の本質を見抜けるタイプだよ。',
};

/**
 * 九星気学結果の本文（CW 内テキスト）。
 */
export function kyuseiCwBody(year: number, kyusei: string): string {
  const desc = KYUSEI_TEXTS[kyusei] ?? `${kyusei}についてはまだデータを整理中だよ。`;
  return `✦ 本命星: ${year}年生まれ → ${kyusei}\n\n${desc}`;
}

/**
 * 九星気学結果の見出し（CW 上のテキスト）。
 */
export function kyuseiHeadline(): string {
  return '九星気学で本命星を出したよ。CW内に詳細をまとめたから見てね';
}

// ----------------------------------------------------------------
// 月命星
// ----------------------------------------------------------------

/**
 * 月命星結果の見出し（CW 上のテキスト）。
 */
export function tsukimeiHeadline(): string {
  return '年命星と月命星を計算したよ。CW内に詳細をまとめたから見てね';
}

/**
 * 月命星結果の本文（CW 内テキスト）。
 */
export function tsukimeiCwBody(
  year: number,
  month: number,
  day: number,
  yearStar: string,
  moonStar: string,
): string {
  const yearDesc = KYUSEI_TEXTS[yearStar] ?? `${yearStar}についてはまだデータを整理中だよ。`;
  const moonDesc = KYUSEI_TEXTS[moonStar] ?? `${moonStar}についてはまだデータを整理中だよ。`;
  return (
    `✦ ${year}年${month}月${day}日生まれ\n` +
    `✦ 年命星: ${yearStar}\n` +
    `✦ 月命星: ${moonStar}\n\n` +
    `【年命星】${yearDesc}\n\n` +
    `【月命星】${moonDesc}`
  );
}

// ----------------------------------------------------------------
// 共通エラー応答
// ----------------------------------------------------------------

export function numerologyErrorResponse(type: NumerologyType): string {
  if (type === 'kyusei') {
    return '生年を読み取れなかったよ。「1990」のように西暦4桁で書いてみてくれる？';
  }
  // life-path / moon-star はいずれも生年月日入力
  return '生年月日を読み取れなかったよ。「1990年1月15日生まれ」のように書いてみてくれる？';
}

// ----------------------------------------------------------------
// ダイスロール / 乱数
// ----------------------------------------------------------------

const DICE_ROLL_TEMPLATES: ReadonlyArray<(die: string, result: string) => string> = [
  (die, result) => `ちょっと待ってね……${die} でロール！→ ${result} だよ`,
  (die, result) => `えーっと…${die} の出目は…… ${result} だよ`,
  (die, result) => `精度は保証するよ。${die} → ${result} が出たよ`,
];

/**
 * ダイスロール結果の応答文（B ランク Precision 演出）。
 */
export function diceRollResponse(die: string, result: string): string {
  const idx = Math.floor(Math.random() * DICE_ROLL_TEMPLATES.length);
  return DICE_ROLL_TEMPLATES[idx]!(die, result);
}

/**
 * 範囲乱数結果の応答文。
 */
export function rangeRollResponse(min: number, max: number, result: number): string {
  return `${min}〜${max} の乱数、ちょっと計算するね……${result} が出たよ`;
}

/**
 * ダイス記法が解釈できなかった場合のエラー応答。
 */
export function diceErrorResponse(): string {
  return 'ダイスの書き方がわからなかった。「2d6」「d20」「1から100」のように書いてみてくれる？';
}

// ----------------------------------------------------------------
// 汎用ダイスロール（nDm）: 出目の絵文字表示（D3-6）
// ----------------------------------------------------------------

/** 出目絵文字が登録済みの面数（5色すべて対応） */
export const SUPPORTED_DICE_SIDES = [4, 6, 8, 10, 12, 20] as const;
export type SupportedDiceSides = (typeof SUPPORTED_DICE_SIDES)[number];

export function isSupportedDiceSides(sides: number): sides is SupportedDiceSides {
  return (SUPPORTED_DICE_SIDES as readonly number[]).includes(sides);
}

/** 1個のダイスの出目絵文字名（`:` なし） */
export function diceFaceEmoji(color: DiceColor, sides: SupportedDiceSides, face: number): string {
  return `sv_dice_${color}_d${sides}_${face}`;
}

/** ダイス種別アイコン（面数ラベル用、`:` なし） */
export function diceTypeEmoji(color: DiceColor, sides: number | '10p'): string {
  return `sv_dice_${color}_type_d${sides}`;
}

/** d100 を「十の位(d10p) + 一の位(d10)」の2ダイスとしてロールする */
export function rollD100(): { tensDigit: number; onesDigit: number; total: number } {
  const tensDigit = Math.floor(Math.random() * 10) * 10; // 0,10,...,90
  const onesDigit = Math.floor(Math.random() * 10); // 0-9
  const total = tensDigit + onesDigit === 0 ? 100 : tensDigit + onesDigit;
  return { tensDigit, onesDigit, total };
}

/**
 * d100 の連結表示絵文字（例: `:sv_dice_hakuji_d10p_70::sv_dice_hakuji_d10_3:`）。
 * 十の位が 0 のときは登録名に合わせて `00` にゼロパディングする。
 */
export function d100PairEmoji(color: DiceColor, tensDigit: number, onesDigit: number): string {
  const tensLabel = String(tensDigit).padStart(2, '0');
  return `:sv_dice_${color}_d10p_${tensLabel}::sv_dice_${color}_d10_${onesDigit}:`;
}

// ----------------------------------------------------------------
// 数字うんちく（LLM 委譲）
// ----------------------------------------------------------------

/**
 * 数字うんちく LLM 呼び出し用ユーザープロンプト。
 */
export function buildTriviaUserPrompt(n: number): string {
  return `数字「${n}」にまつわる豆知識を1つだけ、60文字以内で教えてください。数学・文化・自然・歴史から面白い観点を選んで、断言する表現は避け、口調はあなたのキャラクター設定のままにしてください。`;
}

/**
 * うんちく生成エラー時の応答文。
 */
export function triviaErrorResponse(): string {
  return 'うんちく、今はちょっと思い浮かばないな……また聞いてね';
}

// ----------------------------------------------------------------
// 数字スロット（D3-1）
// ----------------------------------------------------------------

export type SlotRole = 'jackpot' | 'reach' | 'sequential-asc' | 'sequential-desc' | 'scatter';

/**
 * Misskey インスタンスに登録した Secvier 系数字絵文字の名前マップ（0〜9）。
 * 色: 緑(0,5) 黄(1,8) 白(2,6) 赤(3,7) 青(4,9)
 */
export const SLOT_DIGIT_EMOJIS: Record<number, string> = {
  0: 'sv_suigyoku_0',
  1: 'sv_sakin_1',
  2: 'sv_hakuji_2',
  3: 'sv_kougyoku_3',
  4: 'sv_seiyuu_4',
  5: 'sv_suigyoku_5',
  6: 'sv_hakuji_6',
  7: 'sv_kougyoku_7',
  8: 'sv_sakin_8',
  9: 'sv_seiyuu_9',
};

const SLOT_ROLE_LABELS: Record<SlotRole, string> = {
  jackpot: 'ナンバーテールズ！！ ゾロ目大当たり！',
  reach: 'リーチ！',
  'sequential-asc': '昇順！',
  'sequential-desc': '降順！',
  scatter: 'バラバラ……',
};

/**
 * スロット結果のテキストを生成する。
 * 数字絵文字 3 つ + 役名の 2 行形式。
 */
export function slotResultText(digits: [number, number, number], role: SlotRole): string {
  const emojiLine = digits.map((d) => `:${SLOT_DIGIT_EMOJIS[d]!}:`).join(' ');
  return `${emojiLine}\n${SLOT_ROLE_LABELS[role]}`;
}

// ----------------------------------------------------------------
// キャラ番号ルーレット（D3-5）
// ----------------------------------------------------------------

export const ROULETTE_CW_LABEL = '「今日のキャラ番号ルーレット」';

/** キャラ番号ルーレット結果の見出し（CW 展開後の導入文。他の数秘術系と同じ形式） */
export function rouletteHeadline(): string {
  return 'ルーレットを回したよ。CW内で結果を見てね';
}

/**
 * 任意の色でキャラクター番号を桁ごとの絵文字表示にする（Secvier 英数字絵文字、0-9・A-Z 対応）。
 * ハイフンや "0x" 等の非英数字は表示から除外する（"0xA" → "0A" の2文字のみ表示）。
 */
export function coloredNumberEmoji(color: DiceColor, num: string): string {
  const symbols = num.toUpperCase().replace(/[^0-9A-Z]/g, '').split('');
  return symbols.map((s) => `:sv_${color}_${s}:`).join('');
}

/**
 * キャラ番号ルーレット結果の本文（CW 内テキスト）。
 * flavor は抽選キャラの `Character_JP`/`Character`（人物紹介）。無ければ省略する。
 */
export function rouletteCwBody(num: string, name: string, numEmojiLine: string, flavor: string | null): string {
  const flavorLine = flavor ? `\n\n${flavor}` : '';
  return `${numEmojiLine}\n✦ 縁のあった番号: ${num}(${name})${flavorLine}`;
}

// ----------------------------------------------------------------
// 牌引き占い（D3-4a）
// ----------------------------------------------------------------

export const TILE_FORTUNE_CW_LABEL = '「牌引き占い」';

type TileFortuneCategory = 'man' | 'pin' | 'sou' | 'wind' | 'sangen';

const TILE_FORTUNE_CATEGORY_LABEL: Record<TileFortuneCategory, string> = {
  man: '萬子', pin: '筒子', sou: '索子', wind: '風牌', sangen: '三元牌',
};

/** 占いテーマ表（コード側で固定。LLMには渡すが生成させない） */
const TILE_FORTUNE_THEME: Record<TileFortuneCategory, string> = {
  man: '力・意志', pin: '縁・調和', sou: '成長・試練', wind: '方向性', sangen: '純粋さ',
};

const SANGEN_IDS = new Set<CharTileId>(['haku', 'hatsu', 'chun']);

function tileFortuneCategory(t: Tile): TileFortuneCategory {
  if (t.suit !== 'char') return t.suit;
  return SANGEN_IDS.has(t.char!) ? 'sangen' : 'wind';
}

/** 引いた牌からカテゴリ単位の値を、初出順・重複なしで返す共通ヘルパー */
function dedupedByCategory<T>(tiles: Tile[], pick: (c: TileFortuneCategory) => T): T[] {
  const seen = new Set<TileFortuneCategory>();
  const result: T[] = [];
  for (const t of tiles) {
    const cat = tileFortuneCategory(t);
    if (!seen.has(cat)) { seen.add(cat); result.push(pick(cat)); }
  }
  return result;
}

/** LLMプロンプトに渡すテーマ一覧（重複なし） */
export function tileFortuneThemes(tiles: Tile[]): string[] {
  return dedupedByCategory(tiles, (c) => TILE_FORTUNE_THEME[c]);
}

/** 牌引き占い結果の見出し（本文） */
export function tileFortuneHeadline(): string {
  return '牌を引いてみるね……';
}

/**
 * 牌引き占い LLM 呼び出し用ユーザープロンプト。
 * テーマはコード側で固定し、文面（占いコメント）の生成のみLLMに委ねる。
 */
export function buildTileFortuneUserPrompt(themes: string[]): string {
  return `占いの題材として、以下のテーマを引きました: ${themes.join('・')}。\n` +
    `このテーマに沿って、短い占いコメントを1つだけ、60文字以内で生成してください。` +
    `テーマの単語をそのまま繰り返さず、意味を膨らませて話してください。断定しすぎず、寄り添うトーンでお願いします。`;
}

/** 牌引き占い LLM 生成失敗時のフォールバック文言 */
export function tileFortuneErrorResponse(): string {
  return 'うまく言葉にできなかったけど、悪くない流れを感じるよ。';
}

/** CW内テキスト: 牌絵文字＋引いたカテゴリ＋LLM占いコメント */
export function tileFortuneCwBody(tiles: Tile[], comment: string): string {
  const emojiLine = tiles.map(tileEmoji).join('');
  const categoryLabels = dedupedByCategory(tiles, (c) => TILE_FORTUNE_CATEGORY_LABEL[c]);
  return `${emojiLine}\n✦ ${categoryLabels.join('・')}を引いたよ\n${comment}`;
}
