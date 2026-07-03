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
  type SlotRole,
} from './responder.js';
import { characterDiceColor } from './dice-color.js';
import { dealPokerHand, evaluatePokerHand, pokerResultText } from './poker.js';
import { dealHand, evaluateHand, mahjongResultText } from './mahjong.js';
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
  parseGuess,
  hitBlowCwBody,
  HITBLOW_MIN_DIGITS,
  HITBLOW_MAX_DIGITS,
  type HitBlowState,
} from './hitblow.js';
import type { GameSessionStore } from '../../storage/game-session.js';

export type { YachtState, HitBlowState };

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
const DATE_PATTERN = /(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})日?|(\d{8})/;

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
  // スラッシュコマンド形式を優先
  const slashMatch = SLASH_CMD_PATTERN.exec(text.trim());
  let expr: string | undefined;

  if (slashMatch?.[1] === 'calc' && slashMatch[3]) {
    expr = slashMatch[3].trim();
  } else {
    // 自然文から数式を抽出
    // 全角記号を半角に変換してから抽出
    const normalized = text
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
  // スラッシュコマンド形式
  const slashMatch = SLASH_CMD_PATTERN.exec(text.trim());
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
    const dateMatch = DATE_PATTERN.exec(text);
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
  // スラッシュコマンド形式
  const slashMatch = SLASH_CMD_PATTERN.exec(text.trim());
  let year: number | undefined;

  if (slashMatch?.[1] === 'kyusei' && (slashMatch[2] ?? slashMatch[3])) {
    year = Number(slashMatch[2] ?? slashMatch[3]);
  } else {
    // 自然文から年を抽出
    const yearMatch = YEAR_PATTERN.exec(text);
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
  // nDm 記法 (例: 2d6, D20, d100)
  const diceMatch = /^.*?(\d*)([dD])(\d+).*$/.exec(text);
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
  const rangeMatch = /(\d+)\s*(?:から|〜|~)\s*(\d+)/.exec(text);
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
  const slashMatch = SLASH_CMD_PATTERN.exec(text.trim());
  let year: number | undefined, month: number | undefined, day: number | undefined;

  if (slashMatch?.[1] === 'tsukimei' && slashMatch[3]) {
    const raw = slashMatch[3].replace(/\D/g, '');
    if (raw.length === 8) {
      year  = Number(raw.slice(0, 4));
      month = Number(raw.slice(4, 6));
      day   = Number(raw.slice(6, 8));
    }
  } else {
    const dateMatch = DATE_PATTERN.exec(text);
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
// 麻雀配牌チャレンジ（D3-2c）
// ----------------------------------------------------------------

/** 136枚デッキから14枚を配牌し、役判定・翻数を返す（1回完結） */
export function handleMahjong(): F06Result {
  const tiles = dealHand();
  const result = evaluateHand(tiles);
  return mahjongResultText(tiles, result);
}

// ----------------------------------------------------------------
// ポーカー（D3-2a）
// ----------------------------------------------------------------

/** 5 枚ドローポーカーを 1 回行い、手役と絵文字表示を返す */
export function handlePoker(): F06Result {
  const cards = dealPokerHand();
  const hand = evaluatePokerHand(cards);
  return { text: pokerResultText(cards, hand) };
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

/** ヒット＆ブロウゲームを開始する。既存セッションは上書き。 */
export function handleHitBlowStart(userId: string, store: GameSessionStore, text: string): F06Result {
  const digitsMatch = /(\d+)\s*(?:桁|ケタ|けた)/.exec(text);
  const digits = digitsMatch ? parseInt(digitsMatch[1]!, 10) : 4;
  if (digits < HITBLOW_MIN_DIGITS || digits > HITBLOW_MAX_DIGITS) {
    return {
      text: `桁数は${HITBLOW_MIN_DIGITS}〜${HITBLOW_MAX_DIGITS}桁で指定してね`,
    };
  }
  const allowDuplicates = /重複(?:あり|OK|可|して|して?いい)/i.test(text);

  const secret = generateSecret(digits, allowDuplicates);
  const maxGuesses = Math.max(10, digits * 2);
  const state: HitBlowState = {
    secret,
    guessCount: 0,
    maxGuesses,
    digits,
    allowDuplicates,
    guessHistory: [],
  };
  store.setSession(userId, 'hitblow', state);
  return {
    text:
      `${digits}桁の数字を設定したよ（${allowDuplicates ? '重複あり' : '重複なし'}）。` +
      `最大${maxGuesses}回で当ててね！\n数字を送って予想してみよう`,
  };
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
  const guessStr = guess.join('');
  const remaining = state.maxGuesses - newGuessCount;
  const guessHistory = [...state.guessHistory, { guess: guessStr, hits, blows }];
  const cwLabel = `${newGuessCount}回目の予想`;
  const cwBody = hitBlowCwBody(state.secret, guessHistory);

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
    const secretStr = state.secret.join('');
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
  const secretStr = state.secret.join('');
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
