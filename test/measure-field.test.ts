import { describe, it, expect } from 'vitest';
import { resolveMeasureField } from '../dist/bot/character/prompt-builder.js';

/**
 * 計測系フィールド（Height_cm / Weight_kg / ConceptAge）は creations-db 側で
 * `number` / `{value, about_JP}` / その配列 / `{hideText}` の 4 形態を取る。
 * 素の値として文字列連結すると `[object Object]` がプロンプトへ載るため、
 * 実データで確認した形をそのまま固定化する（2026-07-26 の submodule 追従時点）。
 */
describe('resolveMeasureField — 計測系フィールドの解決', () => {
  it('素の数値は単位付きで返す', () => {
    expect(resolveMeasureField(165, 'cm')).toBe('165cm');
  });

  it('0 は有効値として扱う（未設定へ倒さない）', () => {
    expect(resolveMeasureField(0, 'cm')).toBe('0cm');
  });

  it('未設定は null', () => {
    expect(resolveMeasureField(undefined, 'cm')).toBeNull();
    expect(resolveMeasureField(null as never, 'cm')).toBeNull();
  });

  it('非公開ラッパーは出力しない（released 92 件中 35 件の Weight_kg が該当）', () => {
    expect(resolveMeasureField({ hideText: '非公開' }, 'kg')).toBeNull();
  });

  it('補足付きの値は括弧で補足を添える', () => {
    expect(resolveMeasureField({ value: 43, about_JP: '推定' }, 'kg')).toBe('43kg（推定）');
  });

  it('補足のみの値は単位を付けない（「不詳cm」化の防止）', () => {
    expect(resolveMeasureField({ about_JP: '？' }, '歳')).toBe('？');
    expect(resolveMeasureField({ about_JP: '不詳' }, 'cm')).toBe('不詳');
  });

  it('配列は ・ で連結する（#67 Height_cm の実データ）', () => {
    expect(
      resolveMeasureField(
        [
          { value: 145, about_JP: '通常時', about_EN: 'Normal Mode' },
          { value: 190, about_JP: '筋装備時', about_EN: 'Muscle Mode' },
        ],
        'cm',
      ),
    ).toBe('145cm（通常時）・190cm（筋装備時）');
  });

  it('補足の無い要素が混じる配列も落とさない（#15 Weight_kg の実データ）', () => {
    expect(
      resolveMeasureField([{ value: 42 }, { value: 4, about_JP: '安全装置' }], 'kg'),
    ).toBe('42kg・4kg（安全装置）');
  });

  it('単一要素の配列も解決できる（#2-alt Height_cm の実データ）', () => {
    expect(resolveMeasureField([{ value: 150, about_JP: '想定' }], 'cm')).toBe('150cm（想定）');
  });

  it('解決できる要素が無い配列は null', () => {
    expect(resolveMeasureField([], 'cm')).toBeNull();
    expect(resolveMeasureField([{ hideText: '非公開' }] as never, 'cm')).toBeNull();
  });

  it('旧フィールド名 about もフォールバックとして拾う', () => {
    expect(resolveMeasureField({ value: 55, about: '球体型' }, 'cm')).toBe('55cm（球体型）');
  });
});
