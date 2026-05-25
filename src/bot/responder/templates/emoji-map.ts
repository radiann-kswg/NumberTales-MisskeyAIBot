/**
 * 000(チトセ) 絵文字マッピング辞書
 *
 * インスタンス (radiann6631.net) のカスタム絵文字から意図・感情別に選定。
 * キー名は使用コンテキストを表し、各値は絵文字名のプール（ランダム選択される）。
 */
export const EMOJI_POOL = {
  /** おはよう系挨拶 */
  morning: ['ohayo_aphrnts5'],

  /** おやすみ系挨拶 */
  night: ['oyasumi_aphrnts94'],

  /** 汎用挨拶（こんにちは・やあ等） */
  general_greeting: [
    'yoroshiku_aphrnts27',
    'iine_aphrnts42',
    'kakkokawaii_aphrnts13',
  ],

  /** 雑談・チャット全般（同意・納得・興味） */
  chat: [
    'naruhodo_aphrnts24',
    'wakaru_aphrnts22',
    'iine_aphrnts42',
    'omoshiroi_i_aphrnts65',
    'soreda_aphrnts99',
    'sorehasou_aphrnts17',
    'sugoi_aphrnts57',
    'tashikani_aphrnts75',
    'tasukaru_aphrnts60',
  ],

  /** 応援・励まし */
  support: [
    'ganbare_aphrnts93',
    'murisinaide_aphrnts20',
    'otukaresama_aphrnts31',
  ],

  /** エラー・謝り */
  error: ['gomennasai_aphrnts29'],
} as const;

export type EmojiContext = keyof typeof EMOJI_POOL;
