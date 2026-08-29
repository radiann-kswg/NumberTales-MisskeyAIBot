import { describe, it, expect } from 'vitest';
import { buildCharacterSystemPrompt } from '../dist/bot/character/prompt-builder.js';

/**
 * 口調ガードの回帰テスト。
 *
 * 場面指示（挨拶・切り替え・朝の起動）を受けた LLM が、キャラ設定を無視して
 * 一律に明るく喋る劣化（実機バグ 2026-08-30 / 52(イツギ)・49(ヨチカ)）を防ぐため、
 * カード経路・fallback 経路の双方でガード文が必ず載ることを固定する。
 */

describe('buildCharacterSystemPrompt: 口調ガード', () => {
  it('カード経路（52）にキャラカードの口調とガードが両方載る', () => {
    const prompt = buildCharacterSystemPrompt({ Num: '52', Name_JP: '52(イツギ)' }, 'chat');
    expect(prompt).toContain('穏やかで控えめな口調'); // creations-db のカードが基盤層に載っている
    expect(prompt).toContain('主人（ユーザー）の呼び方が設定にある場合');
    expect(prompt).toContain('感嘆符の連発やテンションの底上げ');
  });

  it('fallback 経路（カード未生成）にもガードが載る', () => {
    const prompt = buildCharacterSystemPrompt({ Num: '999999', Name_JP: 'テスト機' }, 'chat');
    expect(prompt).toContain('【口調・テンションの厳守】');
    expect(prompt).toContain('感嘆符の連発やテンションの底上げ');
  });

  it('コアフォルダ形態でも口調そのものは上書きしない', () => {
    const prompt = buildCharacterSystemPrompt({ Num: '52', Name_JP: '52(イツギ)' }, 'chat', 'core-folder');
    expect(prompt).not.toContain('ひらがな多め');
    expect(prompt).toContain('キャラクター設定のまま変えないこと');
  });
});
