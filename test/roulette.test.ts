import { afterEach, describe, it, expect } from 'vitest';
import { handleRoulette, isRouletteEligible } from '../dist/features/f06/index.js';
import { resolveCoreFolderEmoji, setEmojiCache } from '../dist/bot/responder/emoji.js';

const emoji = (name: string) => ({ name, aliases: [], category: 'corefolder', tags: [] });
const chara = (Num: string, Name_JP: string) => ({ Num, Name_JP, Progress: 'released' });

afterEach(() => setEmojiCache([]));

/** 0(零)・00(零百) の released 化（2026-10-04）で、絵文字の無い個体や 000 と絵文字名が衝突する個体が引かれないことを固定する */
describe('キャラ番号ルーレット — 抽選対象はコアフォルダ絵文字を持つ個体だけ', () => {
  it('絵文字が登録済みの個体だけが対象になり、0/00 は 000 と衝突するので除外される', () => {
    setEmojiCache([emoji('aphrnts0_corefolder'), emoji('aphrnts57_corefolder')]);
    const all = [chara('000', 'チトセ'), chara('0', '零'), chara('00', '零百'), chara('5', 'なし'), chara('57', 'ゴナ'), chara('99', 'なし')];
    expect(all.filter(isRouletteEligible).map((c) => c.Num)).toEqual(['000', '57']);

    const result = handleRoulette([chara('0', '零'), chara('00', '零百'), chara('57', 'ゴナ'), chara('99', 'なし')]);
    expect(result.cwBody).toContain('57(ゴナ)');
  });

  describe('コアフォルダ絵文字 — 名前とエイリアスの番号境界', () => {
    it.each([
      emoji('aphrnts57_corefolder'),
      { ...emoji('custom'), aliases: ['aphrnts57_variant'] },
      { ...emoji('aphrnts57_variant'), category: null, tags: ['corefolder'] },
      { ...emoji('aphrnts57_variant'), category: null },
      { ...emoji('custom'), aliases: ['aphrnts57_variant'], category: null },
    ])('57 の絵文字を 5 として解決しない: %j', (entry) => {
      expect(resolveCoreFolderEmoji('5', [entry])).toBeNull();
      expect(resolveCoreFolderEmoji('57', [entry])).toBe(entry.name);
    });

    it.each([
      emoji('aphrnts5_corefolder'),
      { ...emoji('custom'), aliases: ['aphrnts5_corefolder'] },
      emoji('aphrnts5_variant'),
      { ...emoji('custom'), aliases: ['aphrnts5_variant'] },
      { ...emoji('aphrnts5_variant'), category: null, tags: ['corefolder'] },
      { ...emoji('aphrnts5'), category: null },
    ])('同じ番号の標準名・エイリアス・カテゴリ・タグ・fallback は維持する: %j', (entry) => {
      expect(resolveCoreFolderEmoji('5', [emoji('aphrnts57_corefolder'), entry])).toBe(entry.name);
    });
  });

  it('絵文字キャッシュが空のとき全キャラが非対象になる（取得失敗時の安全策）', () => {
    // setEmojiCache([]) は afterEach で行われるが、ここでは明示的に空を確認する
    setEmojiCache([]);
    const all = [chara('5', 'ゴ'), chara('57', 'ゴナ'), chara('000', 'チトセ')];
    expect(all.filter(isRouletteEligible)).toHaveLength(0);
    expect(handleRoulette(all).text).toContain('引けるキャラクターがいない');
  });

  it('対象が 1 人もいなければ引けない旨を返す', () => {
    setEmojiCache([emoji('aphrnts57_corefolder')]);
    expect(handleRoulette([chara('99', 'なし')]).text).toContain('引けるキャラクターがいない');
  });

  it('aphrnts57 の絵文字しかないとき 5 番は対象外（プレフィックス衝突防止）', () => {
    setEmojiCache([emoji('aphrnts57_corefolder')]);
    expect(isRouletteEligible(chara('5', 'ゴ'))).toBe(false);
    expect(isRouletteEligible(chara('57', 'ゴナ'))).toBe(true);
  });
});
