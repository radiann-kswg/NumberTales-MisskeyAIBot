import { describe, it, expect } from 'vitest';
import { BotStateStore, STATE_KEY_CALC_QUIZ_PUBLIC } from '../dist/storage/bot-state.js';
import { GameSessionStore } from '../dist/storage/game-session.js';
import { handleCalcQuizAnswer, handleCalcQuizContinue } from '../dist/features/f06/index.js';
import { generateQuestion, parsePublicCalcQuiz } from '../dist/features/f06/calc-quiz.js';

/**
 * PR #37 の Copilot レビュー指摘（2026-08-22 トリアージ）に対する回帰ガード。
 * - 公開出題の回答者記録がスナップショット経由の setState でロストアップデートしない
 * - 次の問題を含む返信には containsNewQuestion が立つ（LLM フレーミング抑止の根拠）
 */
describe('BotStateStore.updateState — 公開出題の回答者追記', () => {
  it('2ユーザーが同じスナップショットから追記しても両方残る', () => {
    const store = new BotStateStore(':memory:');
    const base = { noteId: 'n1', expr: '1 + 1', answer: 2, level: 1, charNum: null, posterNum: '000', answeredUserIds: [] };
    store.setState(STATE_KEY_CALC_QUIZ_PUBLIC, JSON.stringify(base));
    for (const userId of ['u1', 'u2']) {
      // 各ハンドラは古いスナップショット `base` しか持っていない想定
      store.updateState(STATE_KEY_CALC_QUIZ_PUBLIC, (raw) => {
        const cur = parsePublicCalcQuiz(raw) ?? base;
        return JSON.stringify({ ...cur, answeredUserIds: [...cur.answeredUserIds, userId] });
      });
    }
    expect(parsePublicCalcQuiz(store.getState(STATE_KEY_CALC_QUIZ_PUBLIC))?.answeredUserIds).toEqual(['u1', 'u2']);
    store.close();
  });
});

describe('F06Result.containsNewQuestion — 次の問題を含む返信', () => {
  const streakState = (over: Record<string, unknown> = {}) => {
    const question = generateQuestion(1);
    return {
      question, mode: 'streak' as const, numberMode: false, startLevel: 1 as const,
      streak: 0, continued: false, awaitingContinue: false, askedAt: Date.now(), ...over,
    };
  };

  it('連続正解時の返信には立つ', () => {
    const sessions = new GameSessionStore(':memory:');
    const state = streakState();
    const result = handleCalcQuizAnswer(state, state.question.answer, sessions, 'u1', []);
    expect(result.containsNewQuestion).toBe(true);
    sessions.close();
  });

  it('コンティニュー受諾時の返信には立つ／不正解・辞退では立たない', () => {
    const sessions = new GameSessionStore(':memory:');
    const state = streakState({ awaitingContinue: true });
    expect(handleCalcQuizContinue(state, true, sessions, 'u1', []).containsNewQuestion).toBe(true);
    expect(handleCalcQuizContinue(streakState(), false, sessions, 'u2', []).containsNewQuestion).toBeUndefined();
    const wrong = streakState();
    expect(handleCalcQuizAnswer(wrong, wrong.question.answer + 1, sessions, 'u3', []).containsNewQuestion).toBeUndefined();
    sessions.close();
  });
});
