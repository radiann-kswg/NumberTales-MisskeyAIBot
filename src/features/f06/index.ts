// F-06 コマンドディスパッチャー
// 入力テキストを解析して計算・数秘術の各機能に振り分ける

import { safeEvaluate } from './calculator.js';
import { lifePathNumber, honmeisei } from './numerology.js';
import {
  calcResponse,
  calcErrorResponse,
  lifePathCwBody,
  lifePathHeadline,
  kyuseiCwBody,
  kyuseiHeadline,
  numerologyErrorResponse,
  NUMEROLOGY_CW_LABEL,
} from './responder.js';

export type NumerologyType = 'life-path' | 'kyusei' | 'tarot';

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
      .replace(/√/g, 'sqrt');
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
