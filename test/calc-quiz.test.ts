import { describe, it, expect } from 'vitest';
import {
  generateQuestion,
  generateNumberQuestion,
  evaluateExpr,
  parseCalcAnswer,
  parseLevelRequest,
  isStreakRequest,
  isNumberModeRequest,
  levelForStreak,
  numericCharacterNums,
  decorateExpr,
  parsePublicCalcQuiz,
} from '../dist/features/f06/calc-quiz.js';

/**
 * F-16 計算問題チャレンジの出題エンジン。
 *
 * ゲームバランスの要（項数・演算子・数値レンジ・3桁以内・負数なし・割り切れる除算）は
 * すべて生成側の不変条件なので、乱数生成を多数回まわして固定化する。
 */

const LEVELS = [1, 2, 3, 4] as const;
const SAMPLES = 300;

/** 式を「数値」と「演算子」のトークン列に分解する */
function tokenize(expr: string): string[] {
  return expr.split(' ');
}

function operandsOf(expr: string): number[] {
  return tokenize(expr)
    .filter((t) => /^\d+$/.test(t))
    .map(Number);
}

function operatorsOf(expr: string): string[] {
  return tokenize(expr).filter((t) => !/^\d+$/.test(t));
}

/**
 * 途中経過が負にならないことを確認する。
 * 先に ×÷ を畳んでから、残った加減を左から順に評価して各段階の値を見る。
 */
function runningTotalsNonNegative(expr: string): boolean {
  const tokens = tokenize(expr);
  const folded: (string | number)[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === '×' || token === '÷') {
      const left = folded.pop() as number;
      const right = Number(tokens[++i]);
      folded.push(token === '×' ? left * right : left / right);
    } else if (token === '+' || token === '-') {
      folded.push(token);
    } else {
      folded.push(Number(token));
    }
  }

  let total = folded[0] as number;
  if (total < 0) return false;
  for (let i = 1; i < folded.length; i += 2) {
    const op = folded[i] as string;
    total = op === '+' ? total + (folded[i + 1] as number) : total - (folded[i + 1] as number);
    if (total < 0) return false;
  }
  return true;
}

/** 乗除の各組が「両辺2以上」かつ「割り切れる」ことを確認する */
function mulDivPairsValid(expr: string): boolean {
  const tokens = tokenize(expr);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token !== '×' && token !== '÷') continue;
    const left = Number(tokens[i - 1]);
    const right = Number(tokens[i + 1]);
    if (left < 2 || right < 2) return false;
    if (token === '÷' && left % right !== 0) return false;
  }
  return true;
}

const ALLOWED_OPS: Record<number, string[]> = {
  1: ['+', '-'],
  2: ['+', '-', '×'],
  3: ['+', '-', '×', '÷'],
  4: ['+', '-', '×', '÷'],
};

describe('calc-quiz — 出題生成の不変条件', () => {
  for (const level of LEVELS) {
    it(`Lv${level}: 表示式を評価した結果が answer と一致する`, () => {
      for (let i = 0; i < SAMPLES; i++) {
        const q = generateQuestion(level);
        expect(evaluateExpr(q.expr), q.expr).toBe(q.answer);
        expect(q.level).toBe(level);
      }
    });

    it(`Lv${level}: 答えが 0〜999 の整数で、途中経過も負にならない`, () => {
      for (let i = 0; i < SAMPLES; i++) {
        const q = generateQuestion(level);
        expect(Number.isInteger(q.answer), q.expr).toBe(true);
        expect(q.answer, q.expr).toBeGreaterThanOrEqual(0);
        expect(q.answer, q.expr).toBeLessThanOrEqual(999);
        expect(runningTotalsNonNegative(q.expr), q.expr).toBe(true);
      }
    });

    it(`Lv${level}: 乗除は両辺2以上・除算は割り切れる`, () => {
      for (let i = 0; i < SAMPLES; i++) {
        const q = generateQuestion(level);
        expect(mulDivPairsValid(q.expr), q.expr).toBe(true);
      }
    });

    it(`Lv${level}: 演算子と項数が難易度表どおり`, () => {
      const maxTerms = level === 4 ? 3 : 2;
      for (let i = 0; i < SAMPLES; i++) {
        const q = generateQuestion(level);
        const operands = operandsOf(q.expr);
        const operators = operatorsOf(q.expr);
        expect(operands.length, q.expr).toBeGreaterThanOrEqual(2);
        expect(operands.length, q.expr).toBeLessThanOrEqual(maxTerms);
        expect(operators.length, q.expr).toBe(operands.length - 1);
        for (const op of operators) {
          expect(ALLOWED_OPS[level], q.expr).toContain(op);
        }
      }
    });
  }

  it('Lv1: オペランドは 1〜9', () => {
    for (let i = 0; i < SAMPLES; i++) {
      const q = generateQuestion(1);
      for (const operand of operandsOf(q.expr)) {
        expect(operand, q.expr).toBeGreaterThanOrEqual(1);
        expect(operand, q.expr).toBeLessThanOrEqual(9);
      }
    }
  });

  it('Lv4: 乗除のみのパターンは必ず2項（3項になるのは加減のみ／混合のときだけ）', () => {
    for (let i = 0; i < SAMPLES; i++) {
      const q = generateQuestion(4);
      const operators = operatorsOf(q.expr);
      const hasAddSub = operators.some((op) => op === '+' || op === '-');
      if (!hasAddSub) {
        expect(operandsOf(q.expr).length, q.expr).toBe(2);
      }
    }
  });
});

describe('calc-quiz — 番号モード', () => {
  const characters = [
    { Num: 1, Name_JP: 'テスト1' },
    { Num: 57, Name_JP: 'テスト57' },
    { Num: '2-alt', Name_JP: '非数値なので除外' },
    { Num: '000', Name_JP: '0番一族なので除外' },
    { Num: '00', Name_JP: '0番一族なので除外' },
    { Num: '0', Name_JP: '0番一族なので除外' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any[];

  it('非数値 Num と 0 番一族を除外する', () => {
    const byNum = numericCharacterNums(characters);
    expect([...byNum.keys()].sort((a, b) => a - b)).toEqual([1, 57]);
  });

  it('答えが必ず対象キャラの番号になる', () => {
    for (const level of LEVELS) {
      for (let i = 0; i < 30; i++) {
        const q = generateNumberQuestion(level, characters);
        // 候補が2個しかないので生成に失敗しうる。生成できたときは必ず番号と一致すること
        if (q === null) continue;
        expect([1, 57], q.expr).toContain(q.answer);
        expect(evaluateExpr(q.expr), q.expr).toBe(q.answer);
        expect(q.charNum).toBe(String(q.answer));
      }
    }
  });

  it('対象キャラが1体もいなければ null を返す', () => {
    expect(generateNumberQuestion(2, [])).toBeNull();
  });
});

describe('calc-quiz — 回答・難易度のパース', () => {
  it('数値のみ・明示形の回答を受理する', () => {
    expect(parseCalcAnswer('42')).toBe(42);
    expect(parseCalcAnswer(' 42 ')).toBe(42);
    expect(parseCalcAnswer('４２')).toBe(42);
    expect(parseCalcAnswer('42!')).toBe(42);
    expect(parseCalcAnswer('答えは42')).toBe(42);
    expect(parseCalcAnswer('こたえは 42 かな')).toBe(42);
    expect(parseCalcAnswer('42だと思う')).toBe(42);
  });

  it('文中に紛れた無関係な数字を回答と誤認しない', () => {
    expect(parseCalcAnswer('今日は3時に出かけるよ')).toBeNull();
    expect(parseCalcAnswer('むずかしいなあ')).toBeNull();
    expect(parseCalcAnswer('やめる')).toBeNull();
  });

  it('難易度指定を読み取る', () => {
    expect(parseLevelRequest('かんたんな計算問題出して')).toBe(1);
    expect(parseLevelRequest('ふつうの計算問題')).toBe(2);
    expect(parseLevelRequest('むずかしい計算問題')).toBe(3);
    expect(parseLevelRequest('鬼の計算問題')).toBe(4);
    expect(parseLevelRequest('計算問題出して')).toBeNull();
  });

  it('チャレンジ／番号モードの指定を読み取る', () => {
    expect(isStreakRequest('計算チャレンジ')).toBe(true);
    expect(isStreakRequest('連続正解チャレンジやろう')).toBe(true);
    expect(isStreakRequest('計算問題出して')).toBe(false);
    expect(isNumberModeRequest('番号の計算問題')).toBe(true);
    expect(isNumberModeRequest('ナンバーテールズ計算問題')).toBe(true);
    expect(isNumberModeRequest('計算問題出して')).toBe(false);
  });
});

describe('calc-quiz — 表示と状態', () => {
  it('難易度は3問正解ごとに1段上がり、鬼で頭打ちになる', () => {
    expect(levelForStreak(1, 0)).toBe(1);
    expect(levelForStreak(1, 2)).toBe(1);
    expect(levelForStreak(1, 3)).toBe(2);
    expect(levelForStreak(1, 9)).toBe(4);
    expect(levelForStreak(1, 99)).toBe(4);
    expect(levelForStreak(4, 3)).toBe(4);
  });

  it('絵文字化は対応表に無い字を素の文字のまま残す', () => {
    expect(decorateExpr('1 + 2', 'sumi')).toBe(':n1p: :plp: :n2p:');
    expect(decorateExpr('7 × 8', 'hazard')).toBe(':n7ph: :timesph: :n8ph:');
    // 未対応の字（日本語・記号）はフォールバックしてそのまま出る
    expect(decorateExpr('答え', 'sumi')).toBe('答え');
  });

  it('公開出題レコードは壊れた JSON を null として扱う', () => {
    expect(parsePublicCalcQuiz(null)).toBeNull();
    expect(parsePublicCalcQuiz('壊れてる')).toBeNull();
    expect(parsePublicCalcQuiz('{}')).toBeNull();
    const valid = parsePublicCalcQuiz(
      JSON.stringify({ noteId: 'abc', expr: '1 + 2', answer: 3, level: 1, charNum: null, posterNum: '000', postedAt: 0 }),
    );
    expect(valid?.noteId).toBe('abc');
    expect(valid?.answeredUserIds).toEqual([]);
  });
});
