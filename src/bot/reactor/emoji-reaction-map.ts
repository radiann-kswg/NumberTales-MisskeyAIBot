/**
 * TL リアクション用絵文字マップ
 *
 * カテゴリ「10.挨拶・Misskeyスラング」の絵文字のみ使用。
 * 各カテゴリは感情・文脈のカテゴリに対応し、ランダムに1つ選択される。
 */
export const REACTION_EMOJI_MAP = {
  /** 完成・達成・成功報告 */
  achievement: [
    'yattaze_aphrnts41',      // やったぜ！成功・歓喜
    'omedeto_aphrnts36',      // おめでとう
    'sugoi_aphrnts57',        // すごい
    'igyo_aphrnts88',         // 偉業
    'sasuga_aphrnts61',       // さすが
    'completed_aphrnts72',    // 完了！
  ],

  /** 疲労・お疲れ・就寝前 */
  tired: [
    'otukaresama_aphrnts31',      // お疲れ様
    'hitoyasumi_shiyo_aphrnts58', // 一休みしよ・休憩
    'murisinaide_aphrnts20',      // 無理しないで
  ],

  /** 共感・同意・いいね */
  agree: [
    'iine_aphrnts42',           // いいね
    'wakaru_aphrnts22',         // わかる・共感
    'tashikani_aphrnts75',      // たしかに
    'hontouni_sou_aphrnts92',   // 本当にそう・同意
    'watashimo_aphrnts3x11',    // 私も・共感
  ],

  /** 面白い・発見・知見 */
  interesting: [
    'omoshiroi_i_aphrnts65',     // 面白い！興味津々
    'tensaika_aphrnts8',         // 天才・発想の勝利
    'tiken_aphrnts71',           // 知見
    'soreda_aphrnts99',          // それだ！着想
    'realize_current_aphrnts44', // 閃いた・電撃
    'hirameita_aphrnts62',       // ひらめいた！
  ],

  /** かわいい・素敵・好き */
  cute: [
    'kawaii_aphrnts6',  // かわいい
    'suteki_aphrnts26', // 素敵
    'suki_aphrntsp2',   // 好き
    'yoi_aphrnts76',    // 良い・うっとり・癒しモーメント
  ],

  /** 朝の挨拶 */
  greeting_morning: ['ohayo_aphrnts5'],

  /** 帰宅・ただいま */
  greeting_return: ['okaeri_aphrnts66', 'tadaima_aphrnts37'],

  /** 出発・いってきます */
  greeting_leave: ['ittekimasu_aphrnts56', 'itterasshai_aphrnts23'],

  /** おやすみ */
  greeting_night: ['oyasumi_aphrnts94'],

  /** 応援・気合い入れ */
  cheer: ['ganbare_aphrnts93', 'ikuzo_letsgo_aphrnts11', 'sorosoro_yaruka_aphrnts32'],

  /** 悲しみ・落ち込み・辛い状況への共感 */
  sympathy: ['murisinaide_aphrnts20', 'daijoubu_q_aphrnts7', 'araara_aphrnts9'],
} as const;

export type ReactionCategory = keyof typeof REACTION_EMOJI_MAP;

/**
 * メンション返信時のリアクション絵文字マップ（intent 別）
 *
 * 返信に添える軽いリアクションとして自然な絵文字を選定。
 * いずれかをランダム選択する。
 */
export const MENTION_REACTION_MAP: Record<string, readonly string[]> = {
  greeting: ['yoroshiku_aphrnts27', 'iine_aphrnts42', 'mochiron_aphrnts33'],
  'character-switch': ['okay_aphrnts25', 'yoroshiku_aphrnts27'],
  'form-switch': ['iine_aphrnts42', 'okay_aphrnts25'],
  'creative-consultation': ['omoshiroi_i_aphrnts65', 'tensaika_aphrnts8', 'makasete_aphrnts35', 'hirameita_aphrnts62'],
  chat: ['naruhodo_aphrnts24', 'wakaru_aphrnts22', 'iine_aphrnts42', 'tashikani_aphrnts75', 'wakatta_aphrnts52', 'sounano_aphrnts73'],
  calculate: ['naruhodo_aphrnts24', 'sugoi_aphrnts57', 'wakatta_aphrnts52'],
  numerology: ['omoshiroi_i_aphrnts65', 'naruhodo_aphrnts24'],
  'numerology-consultation': ['murisinaide_aphrnts20', 'naruhodo_aphrnts24', 'omoshiroi_i_aphrnts65'],
  dice: ['yattaze_aphrnts41', 'okay_aphrnts25'],
  trivia: ['omoshiroi_i_aphrnts65', 'tiken_aphrnts71'],
  'game-slot':    ['yattaze_aphrnts41', 'omoshiroi_i_aphrnts65'],
  'game-poker':   ['omoshiroi_i_aphrnts65', 'tensaika_aphrnts8'],
  'game-yacht':   ['yattaze_aphrnts41', 'omoshiroi_i_aphrnts65'],
  'game-hitblow': ['tensaika_aphrnts8', 'omoshiroi_i_aphrnts65'],
  'game-mahjong': ['yattaze_aphrnts41', 'omoshiroi_i_aphrnts65', 'ee_ooo_aphrnts89'],
  'reminder-set':    ['iine_aphrnts42', 'okay_aphrnts25', 'wakatta_aphrnts52'],
  'reminder-list':   ['naruhodo_aphrnts24', 'wakatta_aphrnts52'],
  'reminder-cancel': ['wakatta_aphrnts52', 'okay_aphrnts25'],
};
