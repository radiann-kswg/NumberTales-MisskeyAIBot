/**
 * 手役クイズ（D3-4b）
 *
 * 固定データの14枚手牌を絵文字で表示し、「これは何の役でしょう？」を4択で出題する。
 * 和了判定ロジック（evaluateHand()）は使わない（固定データなので不要）。
 * 出題役セットは evaluateHand() が実際に判定できる役（国士無双・七対子・清一色・混一色・
 * 対々和・平和・タンヤオ・役牌）に絞っている。各パターンは他の役と複合しないよう手牌を設計済み。
 */
import type { Tile } from './mahjong.js';
import { handEmojiBlock } from './mahjong.js';
import { matchCircledDigit, toHalfWidthDigits } from '../../utils/text.js';

export interface QuizPattern {
  tiles: Tile[];
  yaku: string;
  note?: string;
}

export const QUIZ_PATTERNS: QuizPattern[] = [
  // 国士無双
  {
    tiles: [
      { suit: 'man', num: 1 }, { suit: 'man', num: 9 },
      { suit: 'pin', num: 1 }, { suit: 'pin', num: 9 },
      { suit: 'sou', num: 1 }, { suit: 'sou', num: 9 },
      { suit: 'char', char: 'east' }, { suit: 'char', char: 'south' },
      { suit: 'char', char: 'west' }, { suit: 'char', char: 'north' },
      { suit: 'char', char: 'haku' }, { suit: 'char', char: 'hatsu' },
      { suit: 'char', char: 'chun' }, { suit: 'char', char: 'chun' },
    ],
    yaku: '国士無双',
    note: '么九牌13種を全部揃えた最高役、役満だよ',
  },

  // 七対子（2パターン）
  {
    tiles: [
      { suit: 'man', num: 1 }, { suit: 'man', num: 1 },
      { suit: 'pin', num: 9 }, { suit: 'pin', num: 9 },
      { suit: 'sou', num: 5 }, { suit: 'sou', num: 5 },
      { suit: 'char', char: 'east' }, { suit: 'char', char: 'east' },
      { suit: 'char', char: 'south' }, { suit: 'char', char: 'south' },
      { suit: 'char', char: 'haku' }, { suit: 'char', char: 'haku' },
      { suit: 'man', num: 7 }, { suit: 'man', num: 7 },
    ],
    yaku: '七対子',
    note: '7種の対子（ペア）を揃えた形だよ',
  },
  {
    tiles: [
      { suit: 'pin', num: 2 }, { suit: 'pin', num: 2 },
      { suit: 'sou', num: 8 }, { suit: 'sou', num: 8 },
      { suit: 'man', num: 4 }, { suit: 'man', num: 4 },
      { suit: 'char', char: 'west' }, { suit: 'char', char: 'west' },
      { suit: 'char', char: 'north' }, { suit: 'char', char: 'north' },
      { suit: 'char', char: 'hatsu' }, { suit: 'char', char: 'hatsu' },
      { suit: 'char', char: 'chun' }, { suit: 'char', char: 'chun' },
    ],
    yaku: '七対子',
    note: '7種の対子（ペア）を揃えた形だよ',
  },

  // 清一色（萬子・筒子・索子）
  {
    tiles: [
      { suit: 'man', num: 1 }, { suit: 'man', num: 2 }, { suit: 'man', num: 3 },
      { suit: 'man', num: 4 }, { suit: 'man', num: 5 }, { suit: 'man', num: 6 },
      { suit: 'man', num: 7 }, { suit: 'man', num: 8 }, { suit: 'man', num: 9 },
      { suit: 'man', num: 2 }, { suit: 'man', num: 2 }, { suit: 'man', num: 2 },
      { suit: 'man', num: 9 }, { suit: 'man', num: 9 },
    ] as Tile[],
    yaku: '清一色',
    note: '萬子だけで統一された手だよ',
  },
  {
    tiles: [
      { suit: 'pin', num: 1 }, { suit: 'pin', num: 2 }, { suit: 'pin', num: 3 },
      { suit: 'pin', num: 4 }, { suit: 'pin', num: 5 }, { suit: 'pin', num: 6 },
      { suit: 'pin', num: 7 }, { suit: 'pin', num: 8 }, { suit: 'pin', num: 9 },
      { suit: 'pin', num: 2 }, { suit: 'pin', num: 2 }, { suit: 'pin', num: 2 },
      { suit: 'pin', num: 9 }, { suit: 'pin', num: 9 },
    ],
    yaku: '清一色',
    note: '筒子だけで統一された手だよ',
  },
  {
    tiles: [
      { suit: 'sou', num: 1 }, { suit: 'sou', num: 2 }, { suit: 'sou', num: 3 },
      { suit: 'sou', num: 4 }, { suit: 'sou', num: 5 }, { suit: 'sou', num: 6 },
      { suit: 'sou', num: 7 }, { suit: 'sou', num: 8 }, { suit: 'sou', num: 9 },
      { suit: 'sou', num: 2 }, { suit: 'sou', num: 2 }, { suit: 'sou', num: 2 },
      { suit: 'sou', num: 9 }, { suit: 'sou', num: 9 },
    ],
    yaku: '清一色',
    note: '索子だけで統一された手だよ',
  },

  // 混一色（数牌1種＋字牌）
  {
    tiles: [
      { suit: 'man', num: 1 }, { suit: 'man', num: 2 }, { suit: 'man', num: 3 },
      { suit: 'man', num: 4 }, { suit: 'man', num: 5 }, { suit: 'man', num: 6 },
      { suit: 'man', num: 7 }, { suit: 'man', num: 8 }, { suit: 'man', num: 9 },
      { suit: 'man', num: 9 }, { suit: 'man', num: 9 },
      { suit: 'char', char: 'east' }, { suit: 'char', char: 'east' }, { suit: 'char', char: 'east' },
    ],
    yaku: '混一色',
    note: '萬子1種と字牌だけでまとめた手だよ',
  },
  {
    tiles: [
      { suit: 'pin', num: 1 }, { suit: 'pin', num: 2 }, { suit: 'pin', num: 3 },
      { suit: 'pin', num: 4 }, { suit: 'pin', num: 5 }, { suit: 'pin', num: 6 },
      { suit: 'pin', num: 7 }, { suit: 'pin', num: 8 }, { suit: 'pin', num: 9 },
      { suit: 'pin', num: 9 }, { suit: 'pin', num: 9 },
      { suit: 'char', char: 'south' }, { suit: 'char', char: 'south' }, { suit: 'char', char: 'south' },
    ],
    yaku: '混一色',
    note: '筒子1種と字牌だけでまとめた手だよ',
  },
  {
    tiles: [
      { suit: 'sou', num: 1 }, { suit: 'sou', num: 2 }, { suit: 'sou', num: 3 },
      { suit: 'sou', num: 4 }, { suit: 'sou', num: 5 }, { suit: 'sou', num: 6 },
      { suit: 'sou', num: 7 }, { suit: 'sou', num: 8 }, { suit: 'sou', num: 9 },
      { suit: 'sou', num: 9 }, { suit: 'sou', num: 9 },
      { suit: 'char', char: 'west' }, { suit: 'char', char: 'west' }, { suit: 'char', char: 'west' },
    ],
    yaku: '混一色',
    note: '索子1種と字牌だけでまとめた手だよ',
  },

  // 対々和（トイトイ、全部が刻子）
  {
    tiles: [
      { suit: 'man', num: 3 }, { suit: 'man', num: 3 }, { suit: 'man', num: 3 },
      { suit: 'pin', num: 7 }, { suit: 'pin', num: 7 }, { suit: 'pin', num: 7 },
      { suit: 'sou', num: 5 }, { suit: 'sou', num: 5 }, { suit: 'sou', num: 5 },
      { suit: 'char', char: 'north' }, { suit: 'char', char: 'north' }, { suit: 'char', char: 'north' },
      { suit: 'pin', num: 1 }, { suit: 'pin', num: 1 },
    ],
    yaku: '対々和',
    note: '4組すべてが刻子（同じ牌3枚）の形だよ',
  },
  {
    tiles: [
      { suit: 'pin', num: 2 }, { suit: 'pin', num: 2 }, { suit: 'pin', num: 2 },
      { suit: 'sou', num: 6 }, { suit: 'sou', num: 6 }, { suit: 'sou', num: 6 },
      { suit: 'man', num: 8 }, { suit: 'man', num: 8 }, { suit: 'man', num: 8 },
      { suit: 'char', char: 'west' }, { suit: 'char', char: 'west' }, { suit: 'char', char: 'west' },
      { suit: 'sou', num: 9 }, { suit: 'sou', num: 9 },
    ],
    yaku: '対々和',
    note: '4組すべてが刻子（同じ牌3枚）の形だよ',
  },
  {
    tiles: [
      { suit: 'man', num: 5 }, { suit: 'man', num: 5 }, { suit: 'man', num: 5 },
      { suit: 'pin', num: 9 }, { suit: 'pin', num: 9 }, { suit: 'pin', num: 9 },
      { suit: 'sou', num: 3 }, { suit: 'sou', num: 3 }, { suit: 'sou', num: 3 },
      { suit: 'char', char: 'south' }, { suit: 'char', char: 'south' }, { suit: 'char', char: 'south' },
      { suit: 'man', num: 1 }, { suit: 'man', num: 1 },
    ],
    yaku: '対々和',
    note: '4組すべてが刻子（同じ牌3枚）の形だよ',
  },

  // 平和（全部が順子、雀頭は数牌）
  {
    tiles: [
      { suit: 'man', num: 1 }, { suit: 'man', num: 2 }, { suit: 'man', num: 3 },
      { suit: 'man', num: 5 }, { suit: 'man', num: 6 }, { suit: 'man', num: 7 },
      { suit: 'pin', num: 4 }, { suit: 'pin', num: 5 }, { suit: 'pin', num: 6 },
      { suit: 'pin', num: 2 }, { suit: 'pin', num: 2 },
      { suit: 'sou', num: 7 }, { suit: 'sou', num: 8 }, { suit: 'sou', num: 9 },
    ],
    yaku: '平和',
    note: '4組すべてが順子（連番3枚）で、雀頭も数牌の形だよ',
  },
  {
    tiles: [
      { suit: 'pin', num: 1 }, { suit: 'pin', num: 2 }, { suit: 'pin', num: 3 },
      { suit: 'pin', num: 5 }, { suit: 'pin', num: 6 }, { suit: 'pin', num: 7 },
      { suit: 'sou', num: 4 }, { suit: 'sou', num: 5 }, { suit: 'sou', num: 6 },
      { suit: 'sou', num: 3 }, { suit: 'sou', num: 3 },
      { suit: 'man', num: 7 }, { suit: 'man', num: 8 }, { suit: 'man', num: 9 },
    ],
    yaku: '平和',
    note: '4組すべてが順子（連番3枚）で、雀頭も数牌の形だよ',
  },
  {
    tiles: [
      { suit: 'sou', num: 1 }, { suit: 'sou', num: 2 }, { suit: 'sou', num: 3 },
      { suit: 'sou', num: 5 }, { suit: 'sou', num: 6 }, { suit: 'sou', num: 7 },
      { suit: 'man', num: 4 }, { suit: 'man', num: 5 }, { suit: 'man', num: 6 },
      { suit: 'man', num: 3 }, { suit: 'man', num: 3 },
      { suit: 'pin', num: 7 }, { suit: 'pin', num: 8 }, { suit: 'pin', num: 9 },
    ],
    yaku: '平和',
    note: '4組すべてが順子（連番3枚）で、雀頭も数牌の形だよ',
  },

  // タンヤオ（2〜8の数牌のみ）
  {
    tiles: [
      { suit: 'man', num: 2 }, { suit: 'man', num: 3 }, { suit: 'man', num: 4 },
      { suit: 'man', num: 6 }, { suit: 'man', num: 6 }, { suit: 'man', num: 6 },
      { suit: 'pin', num: 5 }, { suit: 'pin', num: 6 }, { suit: 'pin', num: 7 },
      { suit: 'pin', num: 8 }, { suit: 'pin', num: 8 },
      { suit: 'sou', num: 3 }, { suit: 'sou', num: 4 }, { suit: 'sou', num: 5 },
    ],
    yaku: 'タンヤオ',
    note: '2〜8の数牌だけで構成された手だよ',
  },
  {
    tiles: [
      { suit: 'pin', num: 2 }, { suit: 'pin', num: 3 }, { suit: 'pin', num: 4 },
      { suit: 'pin', num: 7 }, { suit: 'pin', num: 7 }, { suit: 'pin', num: 7 },
      { suit: 'sou', num: 5 }, { suit: 'sou', num: 6 }, { suit: 'sou', num: 7 },
      { suit: 'sou', num: 8 }, { suit: 'sou', num: 8 },
      { suit: 'man', num: 3 }, { suit: 'man', num: 4 }, { suit: 'man', num: 5 },
    ],
    yaku: 'タンヤオ',
    note: '2〜8の数牌だけで構成された手だよ',
  },
  {
    tiles: [
      { suit: 'sou', num: 2 }, { suit: 'sou', num: 3 }, { suit: 'sou', num: 4 },
      { suit: 'sou', num: 7 }, { suit: 'sou', num: 7 }, { suit: 'sou', num: 7 },
      { suit: 'man', num: 5 }, { suit: 'man', num: 6 }, { suit: 'man', num: 7 },
      { suit: 'man', num: 8 }, { suit: 'man', num: 8 },
      { suit: 'pin', num: 3 }, { suit: 'pin', num: 4 }, { suit: 'pin', num: 5 },
    ],
    yaku: 'タンヤオ',
    note: '2〜8の数牌だけで構成された手だよ',
  },

  // 役牌（白・発・中、各2パターン）
  {
    tiles: [
      { suit: 'char', char: 'haku' }, { suit: 'char', char: 'haku' }, { suit: 'char', char: 'haku' },
      { suit: 'man', num: 2 }, { suit: 'man', num: 3 }, { suit: 'man', num: 4 },
      { suit: 'man', num: 8 }, { suit: 'man', num: 8 },
      { suit: 'pin', num: 5 }, { suit: 'pin', num: 6 }, { suit: 'pin', num: 7 },
      { suit: 'sou', num: 3 }, { suit: 'sou', num: 4 }, { suit: 'sou', num: 5 },
    ],
    yaku: '役牌(白)',
    note: '白（ハク）の刻子がある役牌の手だよ',
  },
  {
    tiles: [
      { suit: 'char', char: 'haku' }, { suit: 'char', char: 'haku' }, { suit: 'char', char: 'haku' },
      { suit: 'pin', num: 1 }, { suit: 'pin', num: 2 }, { suit: 'pin', num: 3 },
      { suit: 'pin', num: 9 }, { suit: 'pin', num: 9 },
      { suit: 'sou', num: 4 }, { suit: 'sou', num: 5 }, { suit: 'sou', num: 6 },
      { suit: 'man', num: 7 }, { suit: 'man', num: 8 }, { suit: 'man', num: 9 },
    ],
    yaku: '役牌(白)',
    note: '白（ハク）の刻子がある役牌の手だよ',
  },
  {
    tiles: [
      { suit: 'char', char: 'hatsu' }, { suit: 'char', char: 'hatsu' }, { suit: 'char', char: 'hatsu' },
      { suit: 'man', num: 3 }, { suit: 'man', num: 4 }, { suit: 'man', num: 5 },
      { suit: 'man', num: 9 }, { suit: 'man', num: 9 },
      { suit: 'pin', num: 6 }, { suit: 'pin', num: 7 }, { suit: 'pin', num: 8 },
      { suit: 'sou', num: 2 }, { suit: 'sou', num: 3 }, { suit: 'sou', num: 4 },
    ],
    yaku: '役牌(発)',
    note: '発（ハツ）の刻子がある役牌の手だよ',
  },
  {
    tiles: [
      { suit: 'char', char: 'hatsu' }, { suit: 'char', char: 'hatsu' }, { suit: 'char', char: 'hatsu' },
      { suit: 'sou', num: 1 }, { suit: 'sou', num: 2 }, { suit: 'sou', num: 3 },
      { suit: 'sou', num: 9 }, { suit: 'sou', num: 9 },
      { suit: 'man', num: 4 }, { suit: 'man', num: 5 }, { suit: 'man', num: 6 },
      { suit: 'pin', num: 7 }, { suit: 'pin', num: 8 }, { suit: 'pin', num: 9 },
    ],
    yaku: '役牌(発)',
    note: '発（ハツ）の刻子がある役牌の手だよ',
  },
  {
    tiles: [
      { suit: 'char', char: 'chun' }, { suit: 'char', char: 'chun' }, { suit: 'char', char: 'chun' },
      { suit: 'pin', num: 2 }, { suit: 'pin', num: 3 }, { suit: 'pin', num: 4 },
      { suit: 'pin', num: 8 }, { suit: 'pin', num: 8 },
      { suit: 'sou', num: 5 }, { suit: 'sou', num: 6 }, { suit: 'sou', num: 7 },
      { suit: 'man', num: 1 }, { suit: 'man', num: 2 }, { suit: 'man', num: 3 },
    ],
    yaku: '役牌(中)',
    note: '中（チュン）の刻子がある役牌の手だよ',
  },
  {
    tiles: [
      { suit: 'char', char: 'chun' }, { suit: 'char', char: 'chun' }, { suit: 'char', char: 'chun' },
      { suit: 'man', num: 2 }, { suit: 'man', num: 3 }, { suit: 'man', num: 4 },
      { suit: 'man', num: 9 }, { suit: 'man', num: 9 },
      { suit: 'pin', num: 5 }, { suit: 'pin', num: 6 }, { suit: 'pin', num: 7 },
      { suit: 'sou', num: 7 }, { suit: 'sou', num: 8 }, { suit: 'sou', num: 9 },
    ],
    yaku: '役牌(中)',
    note: '中（チュン）の刻子がある役牌の手だよ',
  },
];

export interface MahjongQuizState {
  quizIndex: number;
  correctChoiceIndex: number;
  choices: string[];
}

const CHOICE_LABELS = ['①', '②', '③', '④'];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** QUIZ_PATTERNS からランダムに1問選び、正解1つ＋ダミー3つ（他パターンのyakuから重複除外）をシャッフルする */
export function pickQuizQuestion(): MahjongQuizState {
  const quizIndex = Math.floor(Math.random() * QUIZ_PATTERNS.length);
  const correct = QUIZ_PATTERNS[quizIndex]!.yaku;
  const dummyPool = [...new Set(QUIZ_PATTERNS.map((p) => p.yaku).filter((y) => y !== correct))];
  const dummies = shuffle(dummyPool).slice(0, 3);
  const choices = shuffle([correct, ...dummies]);
  return { quizIndex, correctChoiceIndex: choices.indexOf(correct), choices };
}

/** 出題本文（手牌絵文字＋4択）。正解を知らない段階なので CW 不要でそのまま公開する */
export function quizQuestionText(state: MahjongQuizState): string {
  const pattern = QUIZ_PATTERNS[state.quizIndex]!;
  const choiceLines = state.choices.map((c, i) => `${CHOICE_LABELS[i]}${c}`).join(' ');
  return `これは何の役でしょう？\n${handEmojiBlock(pattern.tiles)}\n${choiceLines}`;
}

/** 正解発表の見出し（本文） */
export function quizAnswerHeadline(): string {
  return '答え合わせするね……';
}

export const MAHJONG_QUIZ_CW_LABEL = '「手役クイズ・正解」';

/** 正解発表のCW本文（D3-5/D3-4aと同じ「めくり」演出） */
export function quizAnswerCwBody(state: MahjongQuizState, selectedChoiceIndex: number): string {
  const pattern = QUIZ_PATTERNS[state.quizIndex]!;
  const correct = selectedChoiceIndex === state.correctChoiceIndex;
  const noteLine = pattern.note ? `\n${pattern.note}` : '';
  const resultLine = correct
    ? `正解！「${pattern.yaku}」だよ`
    : `不正解……あなたの答え「${state.choices[selectedChoiceIndex]}」\n正解は「${pattern.yaku}」だよ`;
  return `${handEmojiBlock(pattern.tiles)}\n${resultLine}${noteLine}`;
}

/** 中断時にそのまま正解を開示するCW本文 */
export function quizAbandonCwBody(state: MahjongQuizState): string {
  const pattern = QUIZ_PATTERNS[state.quizIndex]!;
  const noteLine = pattern.note ? `\n${pattern.note}` : '';
  return `${handEmojiBlock(pattern.tiles)}\n正解は「${pattern.yaku}」だったよ${noteLine}`;
}

/**
 * 回答コマンドを解析する。丸数字はどこにあっても回答意図とみなす。
 * 半角/全角数字は「2番」のような明示指定、または本文全体が単一の数字(1〜4)のみの場合のみ受理し、
 * 文中に紛れ込んだ無関係な数字を誤って回答と解釈しないようにする（mahjong.ts の parseDiscardCommand と同じ方針）。
 */
export function parseQuizAnswer(text: string): number | null {
  const trimmed = text.trim();
  const circled = matchCircledDigit(trimmed);
  if (circled !== null && circled >= 1 && circled <= 4) return circled - 1;

  const halfWidth = toHalfWidthDigits(trimmed);
  const numberedMatch = /(?<!\d)([1-4])\s*番(?!\d)/.exec(halfWidth);
  if (numberedMatch) return parseInt(numberedMatch[1]!, 10) - 1;

  const soloMatch = /^([1-4])[\s、。!!??]*$/.exec(halfWidth);
  return soloMatch ? parseInt(soloMatch[1]!, 10) - 1 : null;
}
