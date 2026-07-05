/**
 * 麻雀配牌チャレンジ ゲームロジック
 *
 * Secvier 麻雀牌絵文字（sv_mj_{suit}_{num} / sv_mj_char_{id}）を使用。
 * 136枚標準デッキから14枚を配牌し、役判定・翻数計算を行う。
 * 本来の打牌・ツモに倣い、指定した位置の牌を山からツモった牌と交換できる
 * （最大 MAHJONG_MAX_EXCHANGES 回）。
 */
import { toHalfWidthDigits } from '../../utils/text.js';

/** ゲームセッション保持用の状態 */
export interface MahjongState {
  /** 現在の14枚の手牌 */
  tiles: Tile[];
  /** ツモ用に残っている山 */
  wall: Tile[];
  /** 交換（打牌→ツモ）済みの回数 */
  turnsUsed: number;
}

/** 打牌→ツモによる交換の上限回数（実際の麻雀は1局で15巡以上打牌するため、それに近い回数を許容する） */
export const MAHJONG_MAX_EXCHANGES = 10;

export type TileSuit = 'man' | 'pin' | 'sou' | 'char';
export type CharTileId = 'east' | 'south' | 'west' | 'north' | 'haku' | 'hatsu' | 'chun';

export interface Tile {
  suit: TileSuit;
  num?: number;       // man/pin/sou: 1〜9
  char?: CharTileId;  // suit === 'char' のとき使用
}

export interface MahjongResult {
  yaku: string[];
  han: number;
  /** 和了形（基本形 / 七対子 / 国士無双）かどうか */
  agari: boolean;
}

const CHAR_ORDER: CharTileId[] = ['east', 'south', 'west', 'north', 'haku', 'hatsu', 'chun'];

/** ソート・比較用の数値キーを返す */
function tileKey(t: Tile): number {
  if (t.suit === 'char') return 30 + CHAR_ORDER.indexOf(t.char!);
  const suitBase: Record<string, number> = { man: 0, pin: 10, sou: 20 };
  return suitBase[t.suit]! + t.num!;
}

function tilesEqual(a: Tile, b: Tile): boolean {
  return a.suit === b.suit && a.num === b.num && a.char === b.char;
}

/** 手牌を見やすいよう、萬子→筒子→索子→字牌の順・数の昇順に並べ替える */
export function sortTiles(tiles: Tile[]): Tile[] {
  return [...tiles].sort((a, b) => tileKey(a) - tileKey(b));
}

// ================================================================
// デッキ・配牌
// ================================================================

/** 136枚の標準デッキを生成する */
function buildDeck(): Tile[] {
  const deck: Tile[] = [];
  for (const suit of ['man', 'pin', 'sou'] as const) {
    for (let num = 1; num <= 9; num++) {
      for (let i = 0; i < 4; i++) deck.push({ suit, num });
    }
  }
  for (const char of CHAR_ORDER) {
    for (let i = 0; i < 4; i++) deck.push({ suit: 'char', char });
  }
  return deck;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 136枚デッキをシャッフルして14枚を配る */
export function dealHand(): Tile[] {
  return shuffle(buildDeck()).slice(0, 14);
}

/** 136枚デッキをシャッフルし、14枚の初期手牌と残りの山を返す */
export function dealMahjongGame(): { tiles: Tile[]; wall: Tile[] } {
  const shuffled = shuffle(buildDeck());
  return { tiles: shuffled.slice(0, 14), wall: shuffled.slice(14) };
}

// ================================================================
// 面子取り出し（再帰・全分解列挙）
// ================================================================

type MentsuType = 'kotsu' | 'shuntsu';
interface Mentsu { type: MentsuType; lead: Tile; }

/**
 * ソート済み牌列から面子として取り出せる全ての分解パターンを返す。
 * 役によって最適な面子構成が異なるため、全候補を列挙して後段で選択する。
 */
function getAllMentsuDecompositions(sorted: Tile[]): Mentsu[][] {
  if (sorted.length === 0) return [[]];

  const results: Mentsu[][] = [];
  const first = sorted[0]!;

  // 刻子チェック
  if (sorted.length >= 3 && tilesEqual(sorted[1]!, first) && tilesEqual(sorted[2]!, first)) {
    for (const rest of getAllMentsuDecompositions(sorted.slice(3))) {
      results.push([{ type: 'kotsu', lead: first }, ...rest]);
    }
  }

  // 順子チェック（数牌のみ）
  if (first.suit !== 'char' && first.num! <= 7) {
    const n2Idx = sorted.findIndex((t, i) => i > 0 && t.suit === first.suit && t.num === first.num! + 1);
    if (n2Idx >= 0) {
      const n3Idx = sorted.findIndex((t, i) => i > n2Idx && t.suit === first.suit && t.num === first.num! + 2);
      if (n3Idx >= 0) {
        const rest = sorted.filter((_, i) => i !== 0 && i !== n2Idx && i !== n3Idx);
        for (const restDecomp of getAllMentsuDecompositions(rest)) {
          results.push([{ type: 'shuntsu', lead: first }, ...restDecomp]);
        }
      }
    }
  }

  return results;
}

// ================================================================
// アガり形チェック
// ================================================================

/**
 * 基本形（4面子1雀頭）の全パターンを返す。
 * 役判定は後段で全パターンから最高翻数を選ぶ。
 */
function getAllBasicForms(tiles: Tile[]): Array<{ jantou: Tile; mentsu: Mentsu[] }> {
  const sorted = [...tiles].sort((a, b) => tileKey(a) - tileKey(b));
  const results: Array<{ jantou: Tile; mentsu: Mentsu[] }> = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    if (tilesEqual(sorted[i]!, sorted[i + 1]!)) {
      const jantou = sorted[i]!;
      const rest = sorted.filter((_, idx) => idx !== i && idx !== i + 1);
      for (const mentsu of getAllMentsuDecompositions(rest)) {
        results.push({ jantou, mentsu });
      }
    }
  }
  return results;
}

/** 七対子チェック（7種の対子・重複なし） */
function checkChiitoitsu(tiles: Tile[]): boolean {
  const counts: Record<number, number> = {};
  for (const t of tiles) {
    const k = tileKey(t);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const vals = Object.values(counts);
  return vals.length === 7 && vals.every((c) => c === 2);
}

/** 国士無双の必要牌キーセット（13種） */
const KOKUSHI_REQUIRED = new Set<number>([
  tileKey({ suit: 'man', num: 1 }), tileKey({ suit: 'man', num: 9 }),
  tileKey({ suit: 'pin', num: 1 }), tileKey({ suit: 'pin', num: 9 }),
  tileKey({ suit: 'sou', num: 1 }), tileKey({ suit: 'sou', num: 9 }),
  ...CHAR_ORDER.map((c) => tileKey({ suit: 'char', char: c })),
]);

/** 国士無双チェック（1・9・字牌13種が全て揃っているか） */
function checkKokushi(tiles: Tile[]): boolean {
  const present = new Set(tiles.map(tileKey));
  return [...KOKUSHI_REQUIRED].every((k) => present.has(k));
}

// ================================================================
// 役判定
// ================================================================

const SANGENPAI: CharTileId[] = ['haku', 'hatsu', 'chun'];
const SANGENPAI_LABEL: Partial<Record<CharTileId, string>> = {
  haku: '白', hatsu: '発', chun: '中',
};

/** タンヤオ（2〜8の数牌のみ） */
function isTanyao(tiles: Tile[]): boolean {
  return tiles.every((t) => t.suit !== 'char' && t.num! >= 2 && t.num! <= 8);
}

/** 清一色（同一種の数牌のみ） */
function isChinitsu(tiles: Tile[]): boolean {
  const suits = new Set(tiles.map((t) => t.suit));
  return suits.size === 1 && !suits.has('char');
}

/** 混一色（字牌 + 1種の数牌のみ） */
function isHonitsu(tiles: Tile[]): boolean {
  const numSuits = new Set(tiles.filter((t) => t.suit !== 'char').map((t) => t.suit));
  return numSuits.size === 1 && tiles.some((t) => t.suit === 'char');
}

/** 三元牌（白/発/中）の刻子を数え、役名と翻数を返す */
function checkSangenpai(mentsu: Mentsu[]): { yaku: string[]; han: number } {
  const yaku: string[] = [];
  let han = 0;
  for (const char of SANGENPAI) {
    if (mentsu.some((m) => m.type === 'kotsu' && m.lead.suit === 'char' && m.lead.char === char)) {
      yaku.push(`役牌(${SANGENPAI_LABEL[char]!})`);
      han++;
    }
  }
  return { yaku, han };
}

// ================================================================
// 総合評価
// ================================================================

/** 14枚の手牌から役を判定し、MahjongResult を返す */
export function evaluateHand(tiles: Tile[]): MahjongResult {
  // 国士無双（役満）
  if (checkKokushi(tiles)) {
    return { yaku: ['国士無双'], han: 13, agari: true };
  }

  // 七対子
  if (checkChiitoitsu(tiles)) {
    const yaku = ['七対子'];
    let han = 2;
    if (isTanyao(tiles)) { yaku.push('タンヤオ'); han++; }
    if (isChinitsu(tiles)) { yaku.push('清一色'); han += 6; }
    else if (isHonitsu(tiles)) { yaku.push('混一色'); han += 3; }
    return { yaku, han, agari: true };
  }

  // 基本形（4面子1雀頭）— 全分解を試し最高翻数を選ぶ
  const basicForms = getAllBasicForms(tiles);
  if (basicForms.length === 0) {
    return { yaku: [], han: 0, agari: false };
  }

  // 色役はタイル全体で決まるので一度だけ計算
  const colorYaku: string[] = [];
  let colorHan = 0;
  if (isChinitsu(tiles)) { colorYaku.push('清一色'); colorHan += 6; }
  else if (isHonitsu(tiles)) { colorYaku.push('混一色'); colorHan += 3; }

  const tanyaoHan = isTanyao(tiles) ? 1 : 0;

  let bestYaku: string[] = [];
  let bestHan = 0;

  for (const { jantou, mentsu } of basicForms) {
    const yaku: string[] = [...colorYaku];
    let han = colorHan;

    // 対々和（全刻子）
    if (mentsu.every((m) => m.type === 'kotsu')) {
      yaku.push('対々和'); han += 2;
    } else if (mentsu.every((m) => m.type === 'shuntsu')) {
      // 平和（全順子 + 雀頭が三元牌でない）
      const jantouIsSangenpai = jantou.suit === 'char' && SANGENPAI.includes(jantou.char!);
      if (!jantouIsSangenpai) { yaku.push('平和'); han += 1; }
    }

    // タンヤオ
    if (tanyaoHan > 0) { yaku.push('タンヤオ'); han += tanyaoHan; }

    // 三元牌（役牌）
    const sangenpai = checkSangenpai(mentsu);
    yaku.push(...sangenpai.yaku);
    han += sangenpai.han;

    if (han > bestHan) {
      bestHan = han;
      bestYaku = yaku;
    }
  }

  if (bestHan === 0) {
    return { yaku: [], han: 0, agari: true };
  }

  return { yaku: bestYaku, han: bestHan, agari: true };
}

// ================================================================
// 絵文字変換・テキスト生成
// ================================================================

/** 牌1枚を Misskey 絵文字形式（`:name:`）に変換する */
export function tileEmoji(t: Tile): string {
  if (t.suit === 'char') return `:sv_mj_char_${t.char}:`;
  return `:sv_mj_${t.suit}_${t.num}:`;
}

/** 14枚の手牌を2行（7枚ずつ）で絵文字表示するテキストを返す */
export function handEmojiBlock(tiles: Tile[]): string {
  const half = Math.ceil(tiles.length / 2);
  const row1 = tiles.slice(0, half).map(tileEmoji).join('');
  const row2 = tiles.slice(half).map(tileEmoji).join('');
  return `${row1}\n${row2}`;
}

/** 14枚の手牌を位置番号（1始まり）付きで2行（7枚ずつ）表示するテキストを返す */
export function handEmojiBlockLabeled(tiles: Tile[]): string {
  const half = Math.ceil(tiles.length / 2);
  const row = (slice: Tile[], offset: number): string =>
    slice.map((t, i) => `${offset + i + 1}${tileEmoji(t)}`).join(' ');
  return `${row(tiles.slice(0, half), 0)}\n${row(tiles.slice(half), half)}`;
}

const HAN_LABEL: Record<number, string> = {
  1: '★', 2: '★★', 3: '★★★', 4: '★★★★',
  5: '★★★★★', 6: '★★★★★★',
};

function formatHan(han: number): string {
  return han >= 13 ? '役満！' :
    han >= 8  ? '跳満！' :
    HAN_LABEL[han] ? `${HAN_LABEL[han]}（${han}翻）` :
    `${han}翻`;
}

/** 現在の手牌の状態（役なし/流局/役あり）を1行で表す */
function handStatusLine(result: MahjongResult): string {
  if (!result.agari) return '現在: アガり形になっていない';
  if (result.yaku.length === 0) return '現在: アガれるけど役なし';
  return `現在: ${result.yaku.join('・')}【${formatHan(result.han)}】`;
}

/** 麻雀ゲームの結果テキストを生成する */
export function mahjongResultText(
  tiles: Tile[],
  result: MahjongResult,
): { text: string; cwBody: string; cwLabel: string } {
  let text: string;
  if (!result.agari) {
    text = '配牌チャレンジ → 流局……アガり形にならなかった';
  } else if (result.yaku.length === 0) {
    text = '配牌チャレンジ → アガれるけど役なし！もう一回どうぞ';
  } else {
    const yakuList = result.yaku.join('・');
    text = `配牌チャレンジ → ${yakuList}【${formatHan(result.han)}】`;
  }

  return {
    text,
    cwBody: handEmojiBlock(tiles),
    cwLabel: '配牌の内容',
  };
}

/**
 * 打牌（交換）コマンドを解析する。
 * - 'keep': 交換せず現在の手牌で確定する（「あがり」「ツモ」等）
 * - number: 交換する 0-indexed の手牌位置
 * - null: 交換コマンドとして認識できなかった
 */
export function parseDiscardCommand(text: string): number | 'keep' | null {
  const normalized = toHalfWidthDigits(text.trim());

  if (/あがり|ツモ(?:った)?|このまま|確定|キープ/i.test(normalized)) return 'keep';

  // 前後が数字に接していない（＝2桁の数字の一部を切り出してしまわない）ことを要求する
  const posPattern = '(?<!\\d)(?:1[0-4]|[1-9])(?!\\d)';
  const prefixMatch = new RegExp(`(?:打牌|切る|捨てる|discard)[\\s\u3000]*(${posPattern})(?:番)?`, 'i').exec(normalized);
  const suffixMatch = new RegExp(`(${posPattern})[\\s\u3000]*番?[\\s\u3000]*を?(?:打牌|切る|捨てる|discard)`, 'i').exec(normalized);
  const numbersOnly = new RegExp(`^[\\s\u3000]*(${posPattern})[\\s\u3000]*番?[\\s\u3000]*$`).exec(normalized);
  const raw = prefixMatch?.[1] ?? suffixMatch?.[1] ?? numbersOnly?.[1];
  if (!raw) return null;

  const index = parseInt(raw, 10) - 1;
  return index >= 0 && index <= 13 ? index : null;
}

/** ゲーム開始時（初回配牌）の表示テキスト */
export function mahjongInitialMessage(state: MahjongState): string {
  const result = evaluateHand(state.tiles);
  return (
    `配牌チャレンジだよ（14枚）\n${handEmojiBlockLabeled(state.tiles)}\n${handStatusLine(result)}\n` +
    `交換可能: あと${MAHJONG_MAX_EXCHANGES - state.turnsUsed}回\n` +
    `「打牌 3」でその位置の牌をツモ交換できる（1始まり）\n「あがり」で確定`
  );
}

/** 交換後（ゲーム中）の表示テキスト */
export function mahjongMidMessage(state: MahjongState): string {
  const result = evaluateHand(state.tiles);
  const statusLine = handStatusLine(result);
  const remaining = MAHJONG_MAX_EXCHANGES - state.turnsUsed;
  if (remaining <= 0) {
    return `${handEmojiBlockLabeled(state.tiles)}\n${statusLine}\n交換上限です。「あがり」で確定してください`;
  }
  return (
    `${handEmojiBlockLabeled(state.tiles)}\n${statusLine}\n` +
    `あと${remaining}回交換できる。「打牌 X」または「あがり」で確定`
  );
}
