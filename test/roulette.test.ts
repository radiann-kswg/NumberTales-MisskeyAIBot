import { describe, it, expect } from 'vitest';
import { handleRoulette, isRouletteEligible } from '../dist/features/f06/index.js';
import { setEmojiCache } from '../dist/bot/responder/emoji.js';

const emoji = (name: string) => ({ name, aliases: [], category: 'corefolder', tags: [] });
const chara = (Num: string, Name_JP: string) => ({ Num, Name_JP, Progress: 'released' });

/** 0(零)・00(零百) の released 化（2026-10-04）で、絵文字の無い個体や 000 と絵文字名が衝突する個体が引かれないことを固定する */
describe('キャラ番号ルーレット — 抽選対象はコアフォルダ絵文字を持つ個体だけ', () => {
  it('絵文字が登録済みの個体だけが対象になり、0/00 は 000 と衝突するので除外される', () => {
    setEmojiCache([emoji('aphrnts0_corefolder'), emoji('aphrnts57_corefolder')]);
    const all = [chara('000', 'チトセ'), chara('0', '零'), chara('00', '零百'), chara('57', 'ゴナ'), chara('99', 'なし')];
    expect(all.filter(isRouletteEligible).map((c) => c.Num)).toEqual(['000', '57']);

    const result = handleRoulette([chara('0', '零'), chara('00', '零百'), chara('57', 'ゴナ'), chara('99', 'なし')]);
    expect(result.cwBody).toContain('57(ゴナ)');
  });

  it('対象が 1 人もいなければ引けない旨を返す', () => {
    setEmojiCache([emoji('aphrnts57_corefolder')]);
    expect(handleRoulette([chara('99', 'なし')]).text).toContain('引けるキャラクターがいない');
  });
});
