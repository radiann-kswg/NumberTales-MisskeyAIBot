/**
 * 計算問題チャレンジ（F-16）
 *
 * 四則演算の問題を難易度別に出題する。問題の生成と採点は必ずコードで行い、
 * LLM には採点の正典を握らせない（キャラの一言コメントだけ LLM に任せる）。
 * 式の表示には PenchantManufacture（理系表記特化のデコ文字カスタム絵文字）を使う。
 *
 * 本モジュールは I/O を持たない純粋モジュール。セッション管理・投稿は呼び出し元の責務。
 */
import { randomInt } from 'node:crypto';
import { safeEvaluate } from './calculator.js';
import { toHalfWidthDigits } from '../../utils/text.js';
import type { CharacterRecord } from '../../bot/character/loader.js';

// ----------------------------------------------------------------
// 難易度
// ----------------------------------------------------------------

export type CalcLevel = 1 | 2 | 3 | 4;

export const CALC_LEVEL_LABELS: Record<CalcLevel, string> = {
  1: 'かんたん',
  2: 'ふつう',
  3: 'むずかしい',
  4: '鬼',
};

/** 計算結果の上限（3桁以内）。途中経過も 0〜この値に収める（負数は出さない） */
const MAX_ANSWER = 999;

/** 1問あたりの制限時間（5分） */
export const CALC_QUIZ_TIME_LIMIT_MS = 5 * 60 * 1000;

/** 連続正解チャレンジで難易度が1段上がるまでの正解数 */
const LEVEL_UP_EVERY = 3;

/** 開始難易度と連続正解数から現在の難易度を決める（最大は鬼） */
export function levelForStreak(startLevel: CalcLevel, streak: number): CalcLevel {
  const raised = startLevel + Math.floor(streak / LEVEL_UP_EVERY);
  return Math.min(4, raised) as CalcLevel;
}

// ----------------------------------------------------------------
// 式の絵文字表示（PenchantManufacture / 工業デカール）
// ----------------------------------------------------------------

/**
 * PenchantManufacture の色バリアント接尾辞。
 * 絵文字名は「基本コード + 接尾辞」（例: 墨の 7 = `n7p`、警戒の × = `timesph`）。
 */
const PM_SUFFIX = {
  sumi: 'p',
  hazard: 'ph',
  rust: 'pr',
  nickel: 'pn',
  patina: 'pt',
} as const;

export type PmColor = keyof typeof PM_SUFFIX;

/** 難易度ごとの色。かんたん→鬼で 緑青真鍮 → 白銅燐光 → 酸鉄 → 警戒 と上がる */
const LEVEL_COLOR: Record<CalcLevel, PmColor> = {
  1: 'patina',
  2: 'nickel',
  3: 'rust',
  4: 'hazard',
};

/** 文字 → PenchantManufacture の基本コード（色接尾辞を付けると絵文字名になる） */
const PM_CODES: Record<string, string> = {
  '0': 'n0',
  '1': 'n1',
  '2': 'n2',
  '3': 'n3',
  '4': 'n4',
  '5': 'n5',
  '6': 'n6',
  '7': 'n7',
  '8': 'n8',
  '9': 'n9',
  '+': 'pl',
  '-': 'hy',
  '×': 'times',
  '÷': 'div',
  '=': 'eq',
  '?': 'qm',
  '(': 'ro',
  ')': 'rc',
};

/**
 * 文字列を PenchantManufacture のカスタム絵文字に置き換える。
 * 対応表に無い字（空白など）は素の文字のまま残す。
 */
export function decorateExpr(text: string, color: PmColor): string {
  const suffix = PM_SUFFIX[color];
  return [...text]
    .map((ch) => {
      const code = PM_CODES[ch];
      return code === undefined ? ch : `:${code}${suffix}:`;
    })
    .join('');
}

// ----------------------------------------------------------------
// 出題
// ----------------------------------------------------------------

export interface CalcQuestion {
  /** 表示・評価に使うプレーンな式（例: "43 × 12 + 187"） */
  expr: string;
  /** 正解 */
  answer: number;
  level: CalcLevel;
  /** 番号モードのときの対象キャラ番号（DB の生の Num 文字列） */
  charNum?: string;
}

/** 出題中セッションの状態（GameSessionStore に JSON で保存する） */
export interface CalcQuizState {
  question: CalcQuestion;
  /** single = 1問で終わり / streak = 連続正解チャレンジ */
  mode: 'single' | 'streak';
  /** 答えがキャラ番号になる問題を出すモードか */
  numberMode: boolean;
  /** チャレンジ開始時の難易度（連続正解に応じてここから上がる） */
  startLevel: CalcLevel;
  /** 現在の連続正解数 */
  streak: number;
  /** コンティニュー済みか（1チャレンジにつき1回だけ） */
  continued: boolean;
  /** コンティニュー可否の返事待ちか */
  awaitingContinue: boolean;
  /** 出題時刻（時間切れ判定に使う。タイマーは立てない） */
  askedAt: number;
}

/** min〜max（両端含む）の整数 */
function rand(min: number, max: number): number {
  return randomInt(min, max + 1);
}

function pick<T>(items: readonly T[]): T {
  return items[randomInt(items.length)]!;
}

/** 表示用の式を mathjs が読める形へ変換する */
function toEvaluable(expr: string): string {
  return expr.replace(/×/g, '*').replace(/÷/g, '/');
}

/**
 * 表示用の式を評価して答えを返す。
 * 生成時に答えを別途保持せず**必ずこの経路で算出**することで、表示と答えの二重管理を防ぐ。
 */
export function evaluateExpr(expr: string): number {
  return Number(safeEvaluate(toEvaluable(expr)));
}

/** 加算の2項式（和が MAX_ANSWER を超えないよう第2項の上限を絞る） */
function addExpr(min: number, max: number): string {
  const a = rand(min, Math.min(max, MAX_ANSWER - min));
  const b = rand(min, Math.min(max, MAX_ANSWER - a));
  return `${a} + ${b}`;
}

/** 減算の2項式（必ず a >= b にして負数を出さない） */
function subExpr(min: number, max: number): string {
  const a = rand(min, max);
  const b = rand(min, a);
  return `${a} - ${b}`;
}

/** 乗算（右辺を先に決め、積が MAX_ANSWER を超えないよう左辺の上限を絞る） */
function mulExpr(aMin: number, aMax: number, bMin: number, bMax: number): string {
  const b = rand(bMin, bMax);
  const a = rand(aMin, Math.min(aMax, Math.floor(MAX_ANSWER / b)));
  return `${a} × ${b}`;
}

/** 除算（「商 × 除数」から被除数を組み立てるので必ず割り切れる） */
function divExpr(qMin: number, qMax: number, dMin: number, dMax: number): string {
  const d = rand(dMin, dMax);
  const q = rand(qMin, Math.min(qMax, Math.floor(MAX_ANSWER / d)));
  return `${d * q} ÷ ${d}`;
}

/** 加減のみの連鎖式（各ステップの途中経過を 0〜MAX_ANSWER に保つ） */
function addSubChain(min: number, max: number, terms: number): string {
  let total = rand(min, max);
  let expr = String(total);
  for (let i = 1; i < terms; i++) {
    const canAdd = total + min <= MAX_ANSWER;
    const op = canAdd && total >= min ? pick(['+', '-'] as const) : canAdd ? '+' : '-';
    if (op === '+') {
      const t = rand(min, Math.min(max, MAX_ANSWER - total));
      expr += ` + ${t}`;
      total += t;
    } else {
      const t = rand(min, Math.min(max, total));
      expr += ` - ${t}`;
      total -= t;
    }
  }
  return expr;
}

/** 鬼の混合パターン（乗除1回＋加減1回の3項）。乗除項を先に確定させてから加減項を収める */
function mixedExpr(): string {
  const term = randomInt(2) === 0 ? mulExpr(11, 99, 11, 36) : divExpr(11, 99, 11, 36);
  const value = evaluateExpr(term);
  const canAdd = value + 101 <= MAX_ANSWER;
  const canSub = value >= 101;
  const op = canAdd && canSub ? pick(['+', '-'] as const) : canAdd ? '+' : '-';
  const t =
    op === '+' ? rand(101, Math.min(499, MAX_ANSWER - value)) : rand(101, Math.min(499, value));
  return `${term} ${op} ${t}`;
}

/**
 * 難易度ごとの式を組み立てる。
 *
 * | Lv | 項数 | 演算子  | 数値範囲                            |
 * | 1  | 2    | + -     | 1〜9                                |
 * | 2  | 2    | + - ×   | 加減 1〜99 / 乗 2〜9 × 2〜9         |
 * | 3  | 2    | + - × ÷ | 加減 11〜999 / 乗除 2〜99 × 2〜9    |
 * | 4  | 2〜3 | + - × ÷ | 加減 101〜499 / 乗除 11〜99 × 11〜36 |
 *
 * 鬼で3項にするのは「加減のみ」か「加減乗除の混合」のときだけ（乗除のみは2項固定）。
 */
function buildExpr(level: CalcLevel): string {
  switch (level) {
    case 1:
      return randomInt(2) === 0 ? addExpr(1, 9) : subExpr(1, 9);
    case 2:
      switch (randomInt(3)) {
        case 0:
          return addExpr(1, 99);
        case 1:
          return subExpr(1, 99);
        default:
          return mulExpr(2, 9, 2, 9);
      }
    case 3:
      switch (randomInt(4)) {
        case 0:
          return addExpr(11, 999);
        case 1:
          return subExpr(11, 999);
        case 2:
          return mulExpr(2, 99, 2, 9);
        default:
          return divExpr(2, 99, 2, 9);
      }
    case 4:
      switch (randomInt(4)) {
        case 0:
          return addSubChain(101, 499, rand(2, 3));
        case 1:
          return mulExpr(11, 99, 11, 36);
        case 2:
          return divExpr(11, 99, 11, 36);
        default:
          return mixedExpr();
      }
  }
}

/** 指定難易度の問題を1問生成する */
export function generateQuestion(level: CalcLevel): CalcQuestion {
  const expr = buildExpr(level);
  return { expr, answer: evaluateExpr(expr), level };
}

// ----------------------------------------------------------------
// ナンバーテールズ番号モード
// ----------------------------------------------------------------

/** 番号モードの棄却サンプリング試行上限 */
const NUMBER_MODE_MAX_TRIES = 3000;

/**
 * 番号モードの対象になるキャラを「番号の数値 → レコード」で引ける形にする。
 *
 * - `"2-alt"` のような非数値 `Num` は除外
 * - `"0"` / `"00"` / `"000"` は数値 0 に潰れて誰を指すか一意に定まらないため除外
 */
export function numericCharacterNums(characters: CharacterRecord[]): Map<number, CharacterRecord> {
  const byNum = new Map<number, CharacterRecord>();
  for (const character of characters) {
    const raw = String(character.Num).trim();
    if (!/^\d+$/.test(raw)) continue;
    const value = Number(raw);
    if (value <= 0 || value > MAX_ANSWER) continue;
    if (!byNum.has(value)) byNum.set(value, character);
  }
  return byNum;
}

/**
 * 答えが公開済みキャラの番号になる問題を生成する。該当が出なければ null。
 *
 * ponytail: 目標番号からの逆算はせず「答えがキャラ番号になるまで引き直す」棄却サンプリング。
 * 公開済みキャラ番号は 1〜99 に 90 個あるので実測でも数十回に収まる。
 * 番号ごとの出題確率に偏りが出るが、外れたら null を返して通常出題へ倒すので実害はない。
 * 厳密に均一な出題確率が要るようになったら逆算生成へ差し替えること。
 */
export function generateNumberQuestion(
  level: CalcLevel,
  characters: CharacterRecord[],
): CalcQuestion | null {
  const byNum = numericCharacterNums(characters);
  if (byNum.size === 0) return null;

  for (let i = 0; i < NUMBER_MODE_MAX_TRIES; i++) {
    const question = generateQuestion(level);
    const hit = byNum.get(question.answer);
    if (hit) return { ...question, charNum: String(hit.Num).trim() };
  }
  return null;
}

// ----------------------------------------------------------------
// 定期出題（公開ノート）
// ----------------------------------------------------------------

/**
 * 定期出題の現在の問題。
 *
 * 個人セッション（GameSessionStore）は user_id キーなので、全員に開かれた公開出題には使えない。
 * BotStateStore に JSON で「今の1問」だけを保持し、次の出題時に上書きする。
 */
export interface PublicCalcQuiz {
  /** 出題ノートの ID（この投稿へのリプライだけを回答として受け付ける） */
  noteId: string;
  expr: string;
  answer: number;
  level: CalcLevel;
  /** 番号モードのときの対象キャラ番号 */
  charNum: string | null;
  /** 出題した担当キャラの番号（正解者の親密度加算先） */
  posterNum: string;
  postedAt: number;
  /** 既に回答したユーザー（1人1回まで） */
  answeredUserIds: string[];
}

/** BotStateStore から読んだ JSON を PublicCalcQuiz として復元する（壊れていれば null） */
export function parsePublicCalcQuiz(raw: string | null): PublicCalcQuiz | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as PublicCalcQuiz;
    if (typeof parsed?.noteId !== 'string' || typeof parsed?.answer !== 'number') return null;
    return { ...parsed, answeredUserIds: parsed.answeredUserIds ?? [] };
  } catch {
    return null;
  }
}

/** 定期出題の本文（前回の答えを添え、回答方法を明示する） */
export function publicQuestionText(
  question: CalcQuestion,
  previousAnswer: number | null,
): string {
  const intro = previousAnswer === null ? '' : `前回の答えは ${previousAnswer} だったよ。\n`;
  return `${intro}${questionText(question)}\n答えは私宛にリプライしてね`;
}

// ----------------------------------------------------------------
// 入力解析
// ----------------------------------------------------------------

/** 難易度指定を読み取る（指定が無ければ null） */
export function parseLevelRequest(text: string): CalcLevel | null {
  const normalized = text.trim();
  if (/鬼|超難|激ムズ|激むず|最難関|地獄/.test(normalized)) return 4;
  if (/むずかし|難しい|難問|上級|ハード|むずい|ムズ/.test(normalized)) return 3;
  if (/ふつう|普通|中級|標準|ノーマル/.test(normalized)) return 2;
  if (/かんたん|簡単|やさし|易し|初級|カンタン|イージー/.test(normalized)) return 1;
  return null;
}

/** 連続正解チャレンジの指定か */
export function isStreakRequest(text: string): boolean {
  return /チャレンジ|連続|ストリーク|連チャン/.test(text);
}

/** ナンバーテールズ番号モードの指定か */
export function isNumberModeRequest(text: string): boolean {
  return /番号|ナンバーテールズ/.test(text);
}

/**
 * 回答を解析する。手役クイズ（`parseQuizAnswer`）と同じ保守的な方針で、
 * 本文全体が数値のみか、明示形（「答えは42」「42だと思う」）のみ受理する。
 * 文中に紛れた無関係な数字を回答と誤認すると、連続正解が理不尽に途切れるため。
 */
export function parseCalcAnswer(text: string): number | null {
  const normalized = toHalfWidthDigits(text.trim());

  const solo = /^(\d{1,4})[\s、。!！?？]*$/.exec(normalized);
  if (solo) return Number(solo[1]);

  const explicit = /(?:答え|こたえ|回答)\s*(?:は|が|:|：)?\s*(\d{1,4})/.exec(normalized);
  if (explicit) return Number(explicit[1]);

  const guess = /(?<!\d)(\d{1,4})(?!\d)\s*(?:だと思う|かな|でしょ|です|だよ|だね|[!！])/.exec(
    normalized,
  );
  if (guess) return Number(guess[1]);

  return null;
}

// ----------------------------------------------------------------
// 文面
// ----------------------------------------------------------------

export const CALC_QUIZ_CW_LABEL = '「計算問題・答え合わせ」';

/**
 * 出題文。
 * 絵文字はローカルインスタンスでしか描画されないため、プレーンな式も必ず併記する
 * （リモートのフォロワーが問題を読めなくなるのを防ぐ）。
 */
export function questionText(question: CalcQuestion, opts?: { streak?: number }): string {
  const deco = decorateExpr(`${question.expr} = ?`, LEVEL_COLOR[question.level]);
  const meta = [`難易度: ${CALC_LEVEL_LABELS[question.level]}`];
  if (opts?.streak) meta.push(`${opts.streak}問連続中`);
  return `${deco}\n( ${question.expr} = ? )\n${meta.join(' / ')}`;
}

/** 答え合わせの CW 本文（番号モードのキャラ開示は呼び出し元で追記する） */
export function answerCwBody(
  question: CalcQuestion,
  given: number | null,
  correct: boolean,
): string {
  const line = decorateExpr(`${question.expr} = ${question.answer}`, LEVEL_COLOR[question.level]);
  const verdict = correct
    ? '正解！'
    : given === null
      ? `時間切れ……正解は ${question.answer} だよ`
      : `不正解……君の答え: ${given}／正解は ${question.answer} だよ`;
  return `${line}\n( ${question.expr} = ${question.answer} )\n${verdict}`;
}

/** 連続正解チャレンジの記録発表（コンティニューの有無を必ず明記する） */
export function streakResultCwBody(
  question: CalcQuestion,
  given: number | null,
  streak: number,
  continued: boolean,
): string {
  const body = answerCwBody(question, given, false);
  return `${body}\n\n連続正解記録: ${streak}問\nコンティニュー: ${continued ? 'あり' : 'なし'}`;
}
