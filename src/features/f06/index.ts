// F-06 コマンドディスパッチャー
// 入力テキストを解析して計算・数秘術の各機能に振り分ける

import { safeEvaluate } from './calculator.js';
import { lifePathNumber, honmeisei, kyuseiPair } from './numerology.js';
import {
  calcResponse,
  calcErrorResponse,
  lifePathCwBody,
  lifePathHeadline,
  kyuseiCwBody,
  kyuseiHeadline,
  tsukimeiHeadline,
  tsukimeiCwBody,
  numerologyErrorResponse,
  diceRollResponse,
  rangeRollResponse,
  diceErrorResponse,
  slotResultText,
  NUMEROLOGY_CW_LABEL,
  SLOT_DIGIT_EMOJIS,
  diceFaceEmoji,
  diceTypeEmoji,
  isSupportedDiceSides,
  rollD100,
  d100PairEmoji,
  ROULETTE_CW_LABEL,
  rouletteHeadline,
  rouletteCwBody,
  coloredNumberEmoji,
  tileFortuneThemes,
  type SlotRole,
} from './responder.js';
import { characterDiceColor } from './dice-color.js';
import type { CharacterRecord } from '../../bot/character/loader.js';
import {
  dealPokerGame,
  evaluatePokerHand,
  pokerResultText,
  pokerInitialMessage,
  sortCards,
  type PokerState,
} from './poker.js';
import {
  dealMahjongGame,
  evaluateHand,
  mahjongResultText,
  mahjongInitialMessage,
  mahjongMidMessage,
  sortTiles,
  drawTileTypes,
  MAHJONG_MAX_EXCHANGES,
  type Tile,
  type MahjongState,
} from './mahjong.js';
import {
  pickQuizQuestion,
  quizQuestionText,
  quizAnswerHeadline,
  quizAnswerCwBody,
  quizAbandonCwBody,
  MAHJONG_QUIZ_CW_LABEL,
  type MahjongQuizState,
} from './mahjong-quiz.js';
import {
  generateQuestion,
  generateNumberQuestion,
  questionText,
  answerCwBody,
  streakResultCwBody,
  levelForStreak,
  CALC_QUIZ_CW_LABEL,
  CALC_QUIZ_TIME_LIMIT_MS,
  type CalcLevel,
  type CalcQuestion,
  type CalcQuizState,
} from './calc-quiz.js';
import {
  rollDice,
  rerollDice,
  yachtInitialMessage,
  yachtMidMessage,
  yachtFinalMessage,
  type YachtState,
} from './yacht.js';
import {
  generateSecret,
  calculateHitBlow,
  hitBlowCwBody,
  symbolLabel,
  HITBLOW_MIN_DIGITS,
  HITBLOW_MAX_DIGITS,
  HITBLOW_ALPHABET_MAX_DIGITS,
  HITBLOW_DIGITS_PATTERN,
  HITBLOW_DUPLICATE_PATTERN,
  HITBLOW_ALPHABET_PATTERN,
  HITBLOW_REVEAL_ON_END_PATTERN,
  HITBLOW_REVEAL_AMBIGUOUS_PATTERN,
  type HitBlowState,
  type HitBlowMode,
} from './hitblow.js';
import type { GameSessionStore } from '../../storage/game-session.js';
import { toHalfWidthDigits } from '../../utils/text.js';

export type { YachtState, HitBlowState, PokerState, MahjongState, MahjongQuizState, CalcQuizState };

export type NumerologyType = 'life-path' | 'kyusei' | 'moon-star' | 'tarot';

/** F-06 の処理結果 */
export interface F06Result {
  /** 通常ノートの本文（100文字以内が望ましい） */
  text: string;
  /** CW 折りたたみ内のテキスト（undefined のとき CW なし） */
  cwBody?: string;
  /** CW ラベル（cwBody がある場合のみ使用） */
  cwLabel?: string;
}

// ----------------------------------------------------------------
// 入力解析パターン
// ----------------------------------------------------------------

// YYYY年M月D日 / YYYY/MM/DD / YYYYMMDD / YYYY-MM-DD
const DATE_PATTERN = /(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?|(\d{8})/;

// 年のみ抽出（生年指定）
const YEAR_PATTERN = /(\d{4})年?/;

// 計算に使えそうな文字列
const EXPR_PATTERN = /([0-9.,+\-*/^()\s√∑sincostanlogsqrt]{3,})/i;

// スラッシュコマンド: /command [subcommand] [args...]
const SLASH_CMD_PATTERN = /^\/(\w+)(?:\s+(\w+))?(?:\s+(.+))?$/;

// ----------------------------------------------------------------
// ハンドラ関数
// ----------------------------------------------------------------

/** 数式計算を処理する */
export function handleCalculate(text: string): F06Result {
  const halfWidthText = toHalfWidthDigits(text);
  // スラッシュコマンド形式を優先
  const slashMatch = SLASH_CMD_PATTERN.exec(halfWidthText.trim());
  let expr: string | undefined;

  if (slashMatch?.[1] === 'calc' && slashMatch[3]) {
    expr = slashMatch[3].trim();
  } else {
    // 自然文から数式を抽出
    // 全角記号を半角に変換してから抽出
    const normalized = halfWidthText
      .replace(/[＋]/g, '+')
      .replace(/[－]/g, '-')
      .replace(/[×]/g, '*')
      .replace(/[÷]/g, '/')
      // √N → sqrt(N)、√(expr) → sqrt(expr) の順で処理して括弧を補う
      .replace(/√\s*([0-9.]+)/g, 'sqrt($1)')
      .replace(/√\s*\(/g, 'sqrt(')
      .replace(/√/g, 'sqrt');   // それ以外の残った √ はそのまま変換
    const match = EXPR_PATTERN.exec(normalized);
    expr = match?.[1]?.trim();
  }

  if (!expr) {
    return { text: calcErrorResponse() };
  }

  try {
    const result = safeEvaluate(expr);
    return { text: calcResponse(expr, result) };
  } catch {
    return { text: calcErrorResponse() };
  }
}

/** ライフパスナンバーを処理する */
export function handleLifePath(text: string): F06Result {
  const halfWidthText = toHalfWidthDigits(text);
  // スラッシュコマンド形式
  const slashMatch = SLASH_CMD_PATTERN.exec(halfWidthText.trim());
  let year: number | undefined, month: number | undefined, day: number | undefined;

  if (
    slashMatch &&
    (slashMatch[1] === 'numerology' || slashMatch[1] === 'lp') &&
    slashMatch[3]
  ) {
    const raw = slashMatch[3].replace(/\D/g, '');
    if (raw.length === 8) {
      year  = Number(raw.slice(0, 4));
      month = Number(raw.slice(4, 6));
      day   = Number(raw.slice(6, 8));
    }
  } else {
    // 自然文から日付を抽出
    const dateMatch = DATE_PATTERN.exec(halfWidthText);
    if (dateMatch) {
      if (dateMatch[4]) {
        // YYYYMMDD パターン
        const raw = dateMatch[4];
        year  = Number(raw.slice(0, 4));
        month = Number(raw.slice(4, 6));
        day   = Number(raw.slice(6, 8));
      } else {
        year  = Number(dateMatch[1]);
        month = Number(dateMatch[2]);
        day   = Number(dateMatch[3]);
      }
    }
  }

  if (!year || !month || !day) {
    return { text: numerologyErrorResponse('life-path') };
  }

  const lpNum = lifePathNumber(year, month, day);
  return {
    text: lifePathHeadline(),
    cwBody: lifePathCwBody(lpNum),
    cwLabel: NUMEROLOGY_CW_LABEL,
  };
}

/** 九星気学（本命星）を処理する */
export function handleKyusei(text: string): F06Result {
  const halfWidthText = toHalfWidthDigits(text);
  // スラッシュコマンド形式
  const slashMatch = SLASH_CMD_PATTERN.exec(halfWidthText.trim());
  let year: number | undefined;

  if (slashMatch?.[1] === 'kyusei' && (slashMatch[2] ?? slashMatch[3])) {
    year = Number(slashMatch[2] ?? slashMatch[3]);
  } else {
    // 自然文から年を抽出
    const yearMatch = YEAR_PATTERN.exec(halfWidthText);
    if (yearMatch?.[1]) {
      year = Number(yearMatch[1]);
    }
  }

  if (!year || year < 1900 || year > new Date().getFullYear()) {
    return { text: numerologyErrorResponse('kyusei') };
  }

  const kyusei = honmeisei(year);
  return {
    text: kyuseiHeadline(),
    cwBody: kyuseiCwBody(year, kyusei),
    cwLabel: NUMEROLOGY_CW_LABEL,
  };
}

/** ダイスロール / 範囲乱数を処理する */
export function handleDice(text: string, characterNum: string | number): F06Result {
  const halfWidthText = toHalfWidthDigits(text);
  // nDm 記法 (例: 2d6, D20, d100)
  const diceMatch = /^.*?(\d*)([dD])(\d+).*$/.exec(halfWidthText);
  if (diceMatch) {
    const count = Math.max(1, parseInt(diceMatch[1] || '1', 10));
    const sides = parseInt(diceMatch[3]!, 10);
    if (count > 100 || sides < 2 || sides > 10000) {
      return { text: 'そのダイスは対応範囲外だよ。ダイス数は1〜100、面数は2〜10000で指定してね' };
    }
    const dieStr = `${count === 1 ? '' : count}D${sides}`;

    // 個数が多い場合は絵文字表示を省略し、テキストのみにフォールバックする
    if (count > 10) {
      const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
      const total = rolls.reduce((a, b) => a + b, 0);
      return { text: diceRollResponse(dieStr, `[${rolls.join(', ')}] = ${total}`) };
    }

    const color = characterDiceColor(characterNum);

    // d100: d10p（十の位）+ d10（一の位）の2ダイス連結表示
    if (sides === 100) {
      const rolls = Array.from({ length: count }, () => rollD100());
      const total = rolls.reduce((a, b) => a + b.total, 0);
      const emojiLine = rolls.map((r) => d100PairEmoji(color, r.tensDigit, r.onesDigit)).join(' ');
      const typeLine = `:${diceTypeEmoji(color, '10p')}:`;
      return { text: diceRollResponse(dieStr, `${typeLine}\n${emojiLine} = ${total}`) };
    }

    // 対応面数（4/6/8/10/12/20）: 出目絵文字をそのまま表示
    if (isSupportedDiceSides(sides)) {
      const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
      const total = rolls.reduce((a, b) => a + b, 0);
      const emojiLine = rolls.map((r) => `:${diceFaceEmoji(color, sides, r)}:`).join(' ');
      const typeLine = `:${diceTypeEmoji(color, sides)}:`;
      return { text: diceRollResponse(dieStr, `${typeLine}\n${emojiLine} = ${total}`) };
    }

    // 対応外面数: 数字図柄絵文字（SLOT_DIGIT_EMOJIS）によるスコアボード風フォールバック
    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const total = rolls.reduce((a, b) => a + b, 0);
    const emojiLine = rolls
      .map((r) =>
        String(r)
          .split('')
          .map((d) => `:${SLOT_DIGIT_EMOJIS[Number(d)]!}:`)
          .join(''),
      )
      .join(' ');
    return { text: diceRollResponse(dieStr, `${emojiLine} = ${total}`) };
  }

  // 範囲指定乱数 (例: 1から100、0〜9)
  const rangeMatch = /(\d+)\s*(?:から|〜|~)\s*(\d+)/.exec(halfWidthText);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1]!, 10);
    const max = parseInt(rangeMatch[2]!, 10);
    if (min > max || max - min > 1_000_000) {
      return { text: 'その範囲ちょっと変だよ。小さい数から大きい数の順で書いてね' };
    }
    const result = Math.floor(Math.random() * (max - min + 1)) + min;
    return { text: rangeRollResponse(min, max, result) };
  }

  return { text: diceErrorResponse() };
}

/** 月命星を処理する */
export function handleTsukimeisei(text: string): F06Result {
  const halfWidthText = toHalfWidthDigits(text);
  const slashMatch = SLASH_CMD_PATTERN.exec(halfWidthText.trim());
  let year: number | undefined, month: number | undefined, day: number | undefined;

  if (slashMatch?.[1] === 'tsukimei' && slashMatch[3]) {
    const raw = slashMatch[3].replace(/\D/g, '');
    if (raw.length === 8) {
      year  = Number(raw.slice(0, 4));
      month = Number(raw.slice(4, 6));
      day   = Number(raw.slice(6, 8));
    }
  } else {
    const dateMatch = DATE_PATTERN.exec(halfWidthText);
    if (dateMatch) {
      if (dateMatch[4]) {
        const raw = dateMatch[4];
        year  = Number(raw.slice(0, 4));
        month = Number(raw.slice(4, 6));
        day   = Number(raw.slice(6, 8));
      } else {
        year  = Number(dateMatch[1]);
        month = Number(dateMatch[2]);
        day   = Number(dateMatch[3]);
      }
    }
  }

  if (!year || !month || !day) {
    return { text: numerologyErrorResponse('moon-star') };
  }

  const { yearStar, moonStar } = kyuseiPair(year, month, day);
  return {
    text: tsukimeiHeadline(),
    cwBody: tsukimeiCwBody(year, month, day, yearStar, moonStar),
    cwLabel: NUMEROLOGY_CW_LABEL,
  };
}

// ----------------------------------------------------------------
// 数字スロット（D3-1）
// ----------------------------------------------------------------

type SlotDigits = [number, number, number];

function determineSlotRole(digits: SlotDigits): SlotRole {
  const [a, b, c] = digits;
  if (a === b && b === c) return 'jackpot';
  if (a === b || b === c || a === c) return 'reach';
  if (a + 1 === b && b + 1 === c) return 'sequential-asc';
  if (a - 1 === b && b - 1 === c) return 'sequential-desc';
  return 'scatter';
}

/** 0〜9 の数字を 3 桁ランダム生成し、役判定・絵文字表示テキストを返す */
export function handleSlot(): F06Result {
  const digits: SlotDigits = [
    Math.floor(Math.random() * 10),
    Math.floor(Math.random() * 10),
    Math.floor(Math.random() * 10),
  ];
  return { text: slotResultText(digits, determineSlotRole(digits)) };
}

// ----------------------------------------------------------------
// キャラ番号ルーレット（D3-5）
// ----------------------------------------------------------------

/**
 * 公開済みキャラクターから1体を一様ランダムに抽選する（D3-5）。
 * 演出色は抽選キャラ自身の番号の桁根で決める（ダイスロールと同じ色則を流用・`dice-color.ts`）。
 * 結果は CW 内で公開する（数字スロット等と異なり、他のワンショットゲームより「めくり」の演出を重視）。
 */
export function handleRoulette(characters: CharacterRecord[]): F06Result {
  if (characters.length === 0) {
    return { text: 'あれ、今引けるキャラクターがいないみたい…また後で試してね。' };
  }
  const picked = characters[Math.floor(Math.random() * characters.length)]!;
  const num = String(picked.Num);
  const name = (picked.Name_JP ?? picked.Name) || `${num}番機`;
  const color = characterDiceColor(num);
  const numEmojiLine = coloredNumberEmoji(color, num);
  const flavor = picked.Character_JP ?? picked.Character ?? null;
  return {
    text: rouletteHeadline(),
    cwBody: rouletteCwBody(num, name, numEmojiLine, flavor),
    cwLabel: ROULETTE_CW_LABEL,
  };
}

// ----------------------------------------------------------------
// 牌引き占い（D3-4a）
// ----------------------------------------------------------------

const TILE_FORTUNE_COUNT_PATTERN = /(\d)\s*枚/;

export interface TileFortuneDraw {
  tiles: Tile[];
  themes: string[];
}

/**
 * テキストから枚数（1〜3、既定1。範囲外はフォールバック）を読み取り、34種の牌タイプから
 * 重複なしで抽選する。LLMコメントの生成はここでは行わない（呼び出し元でtrivia同様にai.chat()を呼ぶ）。
 */
export function handleTileFortune(text: string): TileFortuneDraw {
  const halfWidthText = toHalfWidthDigits(text);
  const match = TILE_FORTUNE_COUNT_PATTERN.exec(halfWidthText);
  const requested = match ? parseInt(match[1]!, 10) : 1;
  const count = requested >= 1 && requested <= 3 ? requested : 1;
  const tiles = drawTileTypes(count);
  return { tiles, themes: tileFortuneThemes(tiles) };
}

// ----------------------------------------------------------------
// 麻雀配牌チャレンジ（D3-2c）
// ----------------------------------------------------------------

/** 麻雀配牌チャレンジを開始する（14枚配牌）。既存セッションは上書き。 */
export function handleMahjongStart(userId: string, store: GameSessionStore): F06Result {
  const { tiles, wall } = dealMahjongGame();
  const state: MahjongState = { tiles: sortTiles(tiles), wall, turnsUsed: 0 };
  store.setSession(userId, 'mahjong', state);
  return { text: mahjongInitialMessage(state) };
}

/**
 * 指定位置の牌を山からツモった牌と交換する（打牌→ツモ）。
 * 上限回数（MAHJONG_MAX_EXCHANGES）に達するか、山が尽きたらゲームを自動終了する。
 */
export function handleMahjongDiscard(
  state: MahjongState,
  position: number,
  store: GameSessionStore,
  userId: string,
): F06Result {
  const drawn = state.wall[0];
  if (!drawn) {
    // 山切れ: 現在の手牌のまま流局として終了する
    store.deleteSession(userId, 'mahjong');
    return mahjongResultText(state.tiles, evaluateHand(state.tiles));
  }

  const replaced = [...state.tiles];
  replaced[position] = drawn;
  const newTiles = sortTiles(replaced);
  const newTurnsUsed = state.turnsUsed + 1;

  if (newTurnsUsed >= MAHJONG_MAX_EXCHANGES) {
    store.deleteSession(userId, 'mahjong');
    return mahjongResultText(newTiles, evaluateHand(newTiles));
  }

  const newState: MahjongState = { tiles: newTiles, wall: state.wall.slice(1), turnsUsed: newTurnsUsed };
  store.setSession(userId, 'mahjong', newState);
  return { text: mahjongMidMessage(newState) };
}

/** ユーザーが「あがり」等で現在の手牌のまま確定したときの処理 */
export function handleMahjongKeep(state: MahjongState, store: GameSessionStore, userId: string): F06Result {
  store.deleteSession(userId, 'mahjong');
  return mahjongResultText(state.tiles, evaluateHand(state.tiles));
}

/** ゲームを中断・放棄する（現在の手牌の評価を返す） */
export function handleMahjongAbandon(state: MahjongState, store: GameSessionStore, userId: string): F06Result {
  store.deleteSession(userId, 'mahjong');
  return mahjongResultText(state.tiles, evaluateHand(state.tiles));
}

// ----------------------------------------------------------------
// 手役クイズ（D3-4b）
// ----------------------------------------------------------------

/** 手役クイズを開始する（新規出題）。既存セッションは上書き。 */
export function handleMahjongQuizStart(userId: string, store: GameSessionStore): F06Result {
  const state = pickQuizQuestion();
  store.setSession(userId, 'mahjong-quiz', state);
  return { text: quizQuestionText(state) };
}

/** ユーザーの回答（0-indexed choiceIndex）を判定する。正誤に関わらずセッションは即削除。 */
export function handleMahjongQuizAnswer(
  state: MahjongQuizState,
  choiceIndex: number,
  store: GameSessionStore,
  userId: string,
): F06Result {
  store.deleteSession(userId, 'mahjong-quiz');
  return {
    text: quizAnswerHeadline(),
    cwBody: quizAnswerCwBody(state, choiceIndex),
    cwLabel: MAHJONG_QUIZ_CW_LABEL,
  };
}

/** ゲームを中断・放棄する（正解を明かす） */
export function handleMahjongQuizAbandon(state: MahjongQuizState, store: GameSessionStore, userId: string): F06Result {
  store.deleteSession(userId, 'mahjong-quiz');
  return { text: '手役クイズ、終了したよ', cwBody: quizAbandonCwBody(state), cwLabel: MAHJONG_QUIZ_CW_LABEL };
}

// ----------------------------------------------------------------
// 計算問題チャレンジ（F-16）
// ----------------------------------------------------------------

/** 番号モードで正解したときのキャラ開示（D3-5 ルーレットと同じ体裁） */
export function calcQuizCharacterReveal(charNum: string, characters: CharacterRecord[]): string | null {
  const found = characters.find((entry) => String(entry.Num).trim() === charNum);
  if (!found) return null;
  const name = (found.Name_JP ?? found.Name) || `${charNum}番機`;
  const flavor = found.Character_JP ?? found.Character ?? null;
  const numEmojiLine = coloredNumberEmoji(characterDiceColor(charNum), charNum);
  return `${numEmojiLine}
✦ 答えの番号: ${charNum}(${name})${flavor ? `

${flavor}` : ''}`;
}

/** 次の問題を作る（番号モードで作れなければ通常出題へフォールバック） */
function nextCalcQuestion(
  level: CalcLevel,
  numberMode: boolean,
  characters: CharacterRecord[],
): CalcQuestion {
  if (!numberMode) return generateQuestion(level);
  return generateNumberQuestion(level, characters) ?? generateQuestion(level);
}

/** 計算問題を開始する。既存セッションは上書き。 */
export function handleCalcQuizStart(
  userId: string,
  store: GameSessionStore,
  opts: {
    level: CalcLevel;
    mode: 'single' | 'streak';
    numberMode: boolean;
    characters: CharacterRecord[];
  },
): F06Result {
  const question = nextCalcQuestion(opts.level, opts.numberMode, opts.characters);
  const state: CalcQuizState = {
    question,
    mode: opts.mode,
    numberMode: opts.numberMode,
    startLevel: opts.level,
    streak: 0,
    continued: false,
    awaitingContinue: false,
    askedAt: Date.now(),
  };
  store.setSession(userId, 'calc-quiz', state);
  return { text: questionText(question) };
}

/**
 * 回答を判定する。
 *
 * - 単発モード: 正誤に関わらずセッションを削除して答え合わせ
 * - 連続正解チャレンジ: 正解なら次の問題、不正解なら 1 回だけコンティニューを聞く
 * - 制限時間を過ぎた回答は不正解（時間切れ）として扱う
 */
export function handleCalcQuizAnswer(
  state: CalcQuizState,
  given: number,
  store: GameSessionStore,
  userId: string,
  characters: CharacterRecord[],
): F06Result {
  const timedOut = Date.now() - state.askedAt > CALC_QUIZ_TIME_LIMIT_MS;
  const correct = !timedOut && given === state.question.answer;
  const answered = timedOut ? null : given;
  const reveal =
    state.question.charNum !== undefined
      ? calcQuizCharacterReveal(state.question.charNum, characters)
      : null;

  if (correct) {
    if (state.mode === 'single') {
      store.deleteSession(userId, 'calc-quiz');
      const body = answerCwBody(state.question, given, true);
      return {
        text: '答え合わせするね……',
        cwBody: reveal ? `${body}

${reveal}` : body,
        cwLabel: CALC_QUIZ_CW_LABEL,
      };
    }

    const streak = state.streak + 1;
    const question = nextCalcQuestion(
      levelForStreak(state.startLevel, streak),
      state.numberMode,
      characters,
    );
    store.setSession(userId, 'calc-quiz', { ...state, question, streak, askedAt: Date.now() });
    return {
      text: `正解！
${questionText(question, { streak })}`,
      cwBody: reveal ?? undefined,
      cwLabel: reveal ? CALC_QUIZ_CW_LABEL : undefined,
    };
  }

  // 単発モード、またはコンティニュー済みで再び不正解 → ここで終了
  if (state.mode === 'single') {
    store.deleteSession(userId, 'calc-quiz');
    const body = answerCwBody(state.question, answered, false);
    return {
      text: '答え合わせするね……',
      cwBody: reveal ? `${body}

${reveal}` : body,
      cwLabel: CALC_QUIZ_CW_LABEL,
    };
  }

  if (state.continued) {
    store.deleteSession(userId, 'calc-quiz');
    return {
      text: 'ここまでだね。記録を見てみよう',
      cwBody: streakResultCwBody(state.question, answered, state.streak, true),
      cwLabel: CALC_QUIZ_CW_LABEL,
    };
  }

  // 1 回だけコンティニューを提案する（返事待ちの間もセッションは残す）
  store.setSession(userId, 'calc-quiz', { ...state, awaitingContinue: true });
  return {
    text: `残念、不正解……${state.streak}問連続で止まっちゃった。コンティニューする？`,
    cwBody: answerCwBody(state.question, answered, false),
    cwLabel: CALC_QUIZ_CW_LABEL,
  };
}

/** コンティニューの可否に答えたときの処理（accept=true で同じ難易度の新しい問題へ） */
export function handleCalcQuizContinue(
  state: CalcQuizState,
  accept: boolean,
  store: GameSessionStore,
  userId: string,
  characters: CharacterRecord[],
): F06Result {
  if (!accept) {
    store.deleteSession(userId, 'calc-quiz');
    return {
      text: 'お疲れさま。記録を見てみよう',
      cwBody: streakResultCwBody(state.question, null, state.streak, false),
      cwLabel: CALC_QUIZ_CW_LABEL,
    };
  }

  const question = nextCalcQuestion(
    levelForStreak(state.startLevel, state.streak),
    state.numberMode,
    characters,
  );
  store.setSession(userId, 'calc-quiz', {
    ...state,
    question,
    continued: true,
    awaitingContinue: false,
    askedAt: Date.now(),
  });
  return { text: `コンティニュー！
${questionText(question, { streak: state.streak })}` };
}

/** 中断・放棄（正解を明かして終了する） */
export function handleCalcQuizAbandon(
  state: CalcQuizState,
  store: GameSessionStore,
  userId: string,
): F06Result {
  store.deleteSession(userId, 'calc-quiz');
  const body =
    state.mode === 'streak'
      ? streakResultCwBody(state.question, null, state.streak, state.continued)
      : answerCwBody(state.question, null, false);
  return { text: '計算問題、終了したよ', cwBody: body, cwLabel: CALC_QUIZ_CW_LABEL };
}

// ----------------------------------------------------------------
// ポーカー（D3-2a）
// ----------------------------------------------------------------

/** ポーカーを開始する（5枚ドロー初回配札）。既存セッションは上書き。 */
export function handlePokerStart(userId: string, store: GameSessionStore): F06Result {
  const { hand, deck } = dealPokerGame();
  const state: PokerState = { hand: sortCards(hand), deck };
  store.setSession(userId, 'poker', state);
  return { text: pokerInitialMessage(state) };
}

/** 指定位置のカードを山から引いた札と交換し、ゲームを終了する（交換は1回のみ） */
export function handlePokerExchange(
  state: PokerState,
  indices: number[],
  store: GameSessionStore,
  userId: string,
): F06Result {
  const deck = [...state.deck];
  const replaced = [...state.hand];
  for (const i of indices) {
    if (i >= 0 && i < 5) {
      const drawn = deck.shift();
      if (drawn) replaced[i] = drawn;
    }
  }
  const newHand = sortCards(replaced);
  store.deleteSession(userId, 'poker');
  return { text: pokerResultText(newHand, evaluatePokerHand(newHand)) };
}

/** ユーザーが「このまま」で交換せず確定したときの処理 */
export function handlePokerKeep(state: PokerState, store: GameSessionStore, userId: string): F06Result {
  store.deleteSession(userId, 'poker');
  return { text: pokerResultText(state.hand, evaluatePokerHand(state.hand)) };
}

/** ゲームを中断・放棄する */
export function handlePokerAbandon(store: GameSessionStore, userId: string): F06Result {
  store.deleteSession(userId, 'poker');
  return { text: 'ポーカー、終了したよ。また遊ぼうね！' };
}

// ----------------------------------------------------------------
// ヨット（D3-2b）
// ----------------------------------------------------------------

/** ヨットゲームを開始する（5d6 初回ロール）。既存セッションは上書き。 */
export function handleYachtStart(userId: string, store: GameSessionStore): F06Result {
  const dice = rollDice();
  const state: YachtState = { dice, rerollCount: 0, keptIndices: [], pendingReroll: null };
  store.setSession(userId, 'yacht', state);
  return { text: yachtInitialMessage(state) };
}

/**
 * ヨットの振り直しを処理する。
 * rerollIndices: 振り直すダイスの 0-indexed インデックスリスト。
 * 2 回目の振り直しが完了したらゲームを自動終了する。
 */
export function handleYachtReroll(
  state: YachtState,
  rerollIndices: number[],
  store: GameSessionStore,
  userId: string,
): F06Result {
  const keptIndices = [0, 1, 2, 3, 4].filter((i) => !rerollIndices.includes(i));
  const newDice = rerollDice(state.dice, rerollIndices);
  const newRerollCount = state.rerollCount + 1;
  const newState: YachtState = {
    dice: newDice,
    rerollCount: newRerollCount,
    keptIndices,
    pendingReroll: null,
  };

  if (newRerollCount >= 2) {
    // 2 回振り直し完了 → ゲーム自動終了
    store.deleteSession(userId, 'yacht');
    return { text: yachtFinalMessage(newDice) };
  }

  store.setSession(userId, 'yacht', newState);
  return { text: yachtMidMessage(newState) };
}

/** ユーザーが「このまま」で確定したときの処理 */
export function handleYachtKeep(state: YachtState, store: GameSessionStore, userId: string): F06Result {
  store.deleteSession(userId, 'yacht');
  return { text: yachtFinalMessage(state.dice) };
}

/** ゲームを中断・放棄する */
export function handleYachtAbandon(store: GameSessionStore, userId: string): F06Result {
  store.deleteSession(userId, 'yacht');
  return { text: 'ヨット、終了したよ。また遊ぼうね！' };
}

// ----------------------------------------------------------------
// ヒット＆ブロウ（D3-3）
// ----------------------------------------------------------------

/** 事前確認を挟んで開始する際に、確認が解決するまで保持しておくオプション */
export interface HitBlowPendingStart {
  digits: number;
  allowDuplicates: boolean;
  mode: HitBlowMode;
}

/**
 * テキストから桁数・重複あり・モードを解析する。
 * アルファベットモードは単語当て（ワードウルフ風）になるため、常に重複ありで行う。
 * 桁数が範囲外の場合 digits は null。
 * fallbackMode: 進行中セッションの条件変更時、テキストにモード指定（「アルファベット」等）が
 * 含まれない場合に引き継ぐ現在のモード。新規開始時は指定せず、常定の 'digit' のままでよい。
 */
function parseHitBlowOptions(
  text: string,
  fallbackMode: HitBlowMode = 'digit',
): { digits: number | null; allowDuplicates: boolean; mode: HitBlowMode } {
  const mode: HitBlowMode = HITBLOW_ALPHABET_PATTERN.test(text) ? 'alphabet' : fallbackMode;
  const maxDigits = mode === 'alphabet' ? HITBLOW_ALPHABET_MAX_DIGITS : HITBLOW_MAX_DIGITS;
  const digitsMatch = HITBLOW_DIGITS_PATTERN.exec(toHalfWidthDigits(text));
  const digitsRaw = digitsMatch ? parseInt(digitsMatch[1]!, 10) : 4;
  const digits = digitsRaw < HITBLOW_MIN_DIGITS || digitsRaw > maxDigits ? null : digitsRaw;
  const allowDuplicates = mode === 'alphabet' ? true : HITBLOW_DUPLICATE_PATTERN.test(text);
  return { digits, allowDuplicates, mode };
}

/**
 * 色ヒントの扱いについて、事前確認を挟むべき曖昧な言及かどうかを判定する。
 * 「文字色ヒント無しで」等の確信度が高い言い回しは HITBLOW_REVEAL_ON_END_PATTERN で直接判定できるため、
 * ここでは「色」「ヒント」等の話題には触れているがそれには一致しない曖昧なケースのみを対象にする。
 */
export function needsRevealConfirmation(text: string): boolean {
  return HITBLOW_REVEAL_AMBIGUOUS_PATTERN.test(text) && !HITBLOW_REVEAL_ON_END_PATTERN.test(text);
}

/** 色ヒントの事前確認セッション用に、テキストから桁数・重複あり・モードを解析する。桁数が範囲外なら null */
export function buildPendingStartFromText(
  text: string,
  fallbackMode: HitBlowMode = 'digit',
): HitBlowPendingStart | null {
  const { digits, allowDuplicates, mode } = parseHitBlowOptions(text, fallbackMode);
  if (digits === null) return null;
  return { digits, allowDuplicates, mode };
}

function startHitBlowGame(
  userId: string,
  store: GameSessionStore,
  digits: number,
  allowDuplicates: boolean,
  mode: HitBlowMode,
  revealOnEnd: boolean,
): F06Result {
  const secret = generateSecret(digits, allowDuplicates, mode);
  const maxGuesses = Math.max(10, digits * 2);
  const state: HitBlowState = {
    secret,
    guessCount: 0,
    maxGuesses,
    digits,
    allowDuplicates,
    mode,
    revealOnEnd,
    guessHistory: [],
  };
  store.setSession(userId, 'hitblow', state);
  const symbolSetLabel = mode === 'alphabet' ? 'アルファベット(A〜Z)' : '数字';
  const unit = mode === 'alphabet' ? '文字' : '桁';
  const revealNote = revealOnEnd ? '\n（色ヒントは結果発表のときだけ出すね）' : '';
  const dupNote = mode === 'alphabet' ? '\n（アルファベットモードは単語当てだから、重複ありに固定してるよ）' : '';
  return {
    text:
      `${digits}${unit}の${symbolSetLabel}を設定したよ（${allowDuplicates ? '重複あり' : '重複なし'}）。` +
      `最大${maxGuesses}回で当ててね！\n${symbolSetLabel}を送って予想してみよう${revealNote}${dupNote}`,
  };
}

/**
 * ヒット＆ブロウゲームを開始する。既存セッションは上書き。
 * 色ヒントの扱いが曖昧なテキストでもここでは確定させて直接開始する
 * （事前確認を挟みたい呼び出し元は、先に needsRevealConfirmation() で判定して分岐すること）。
 */
export function handleHitBlowStart(
  userId: string,
  store: GameSessionStore,
  text: string,
  fallbackMode: HitBlowMode = 'digit',
): F06Result {
  const { digits, allowDuplicates, mode } = parseHitBlowOptions(text, fallbackMode);
  if (digits === null) {
    const maxDigits = mode === 'alphabet' ? HITBLOW_ALPHABET_MAX_DIGITS : HITBLOW_MAX_DIGITS;
    const unit = mode === 'alphabet' ? '文字' : '桁';
    return { text: `${unit}数は${HITBLOW_MIN_DIGITS}〜${maxDigits}${unit}で指定してね` };
  }
  const revealOnEnd = HITBLOW_REVEAL_ON_END_PATTERN.test(text);
  return startHitBlowGame(userId, store, digits, allowDuplicates, mode, revealOnEnd);
}

/** 色ヒントの事前確認が解決した後にゲームを開始する */
export function handleHitBlowStartWithReveal(
  userId: string,
  store: GameSessionStore,
  pending: HitBlowPendingStart,
  revealOnEnd: boolean,
): F06Result {
  return startHitBlowGame(userId, store, pending.digits, pending.allowDuplicates, pending.mode, revealOnEnd);
}

/**
 * ユーザーの予想を処理する。
 * 正解・試行数上限でゲーム終了、そうでなければ Hit/Blow を返す。
 */
export function handleHitBlowGuess(
  state: HitBlowState,
  guess: number[],
  store: GameSessionStore,
  userId: string,
): F06Result {
  const { hits, blows } = calculateHitBlow(state.secret, guess);
  const newGuessCount = state.guessCount + 1;
  const guessStr = guess.map((g) => symbolLabel(state.mode, g)).join('');
  const remaining = state.maxGuesses - newGuessCount;
  const guessHistory = [...state.guessHistory, { guess: guessStr, hits, blows }];
  const cwLabel = `${newGuessCount}回目の予想`;
  const isFinished = hits === state.digits || remaining <= 0;
  // 「結果発表のみ色ヒント」オプション時、ゲーム進行中は色ヒントを白固定にし、終了時にのみ色で明かす
  const revealColors = !state.revealOnEnd || isFinished;
  const cwBody = hitBlowCwBody(state.secret, guessHistory, state.mode, revealColors);

  if (hits === state.digits) {
    store.deleteSession(userId, 'hitblow');
    return {
      text: `「${guessStr}」→ ${hits}ヒット！\n正解！${newGuessCount}回でクリア！`,
      cwBody,
      cwLabel,
    };
  }

  if (remaining <= 0) {
    store.deleteSession(userId, 'hitblow');
    const secretStr = state.secret.map((s) => symbolLabel(state.mode, s)).join('');
    return {
      text: `「${guessStr}」→ ${hits}ヒット ${blows}ブロウ\n残念……正解は「${secretStr}」だったよ`,
      cwBody,
      cwLabel,
    };
  }

  store.setSession(userId, 'hitblow', { ...state, guessCount: newGuessCount, guessHistory });
  return {
    text: `「${guessStr}」→ ${hits}ヒット ${blows}ブロウ（残り${remaining}回）`,
    cwBody,
    cwLabel,
  };
}

/** ゲームを中断・放棄する（正解を明かす） */
export function handleHitBlowAbandon(state: HitBlowState, store: GameSessionStore, userId: string): F06Result {
  store.deleteSession(userId, 'hitblow');
  const secretStr = state.secret.map((s) => symbolLabel(state.mode, s)).join('');
  return { text: `ヒット＆ブロウを終了したよ。答えは「${secretStr}」だったよ` };
}

/**
 * 数字うんちく対象の数字をテキストから抽出する。
 * 「今日の数字」の場合は当日の日付（日）を返す。
 */
export function extractTriviaNumber(text: string): number {
  if (/今日の数字/.test(text)) {
    return new Date().getDate();
  }
  const match = /(\d+)/.exec(text);
  return match ? parseInt(match[1]!, 10) : new Date().getDate();
}
