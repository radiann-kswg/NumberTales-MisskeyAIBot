/**
 * 意図分類エンジン（Phase 2 拡張版）
 *
 * カテゴリ:
 *   - greeting:               挨拶キーワードにマッチした場合
 *   - form-switch:            コアフォルダ/ヒューマノイド形態トリガー
 *   - creative-consultation:  創作相談・壁打ち・お題要求
 *   - chat:                   上記以外（LLM に委ねる）
 */

export type Intent = 'greeting' | 'form-switch' | 'creative-consultation' | 'chat' | 'calculate' | 'numerology' | 'numerology-consultation' | 'dice' | 'trivia' | 'game-slot' | 'game-poker' | 'game-yacht' | 'game-hitblow' | 'game-mahjong' | 'game-roulette' | 'game-repeat' | 'task-add' | 'task-list' | 'task-done' | 'task-cancel' | 'task-progress-update' | 'harassment';
export type FormTarget = 'core-folder' | 'humanoid';
export type NumerologyType = 'life-path' | 'kyusei' | 'moon-star';

export interface ClassificationResult {
  intent: Intent;
  /** form-switch のときのみ設定される */
  formTarget?: FormTarget;
  /** numerology のときのみ設定される */
  numerologyType?: NumerologyType;
  /**
   * harassment のときのみ設定される。
   * - 1: 軽度（プライベート情報要求・軽い挑発など）
   * - 2: 繰り返し・エスカレートする不適切要求
   * - 3: 明らかなハラスメント・威圧・暴言レベル
   */
  harassmentLevel?: 1 | 2 | 3;
}

// ----------------------------------------------------------------
// パターン定義
// ----------------------------------------------------------------

const GREETING_PATTERNS: RegExp[] = [
  /^おはよ/,
  /^こんにちは?/,
  /^こんばんは?/,
  /^おやすみ/,
  /^(やあ|やほ|ヤッホー)/,
  /^(hello|hi|hey)\b/i,
];

const CORE_FOLDER_PATTERNS: RegExp[] = [
  /もふもふ/,
  /コアフォルダ/,
  /球体型/,
  /ぷに/,
  /ぽてぽて/,
];

const HUMANOID_PATTERNS: RegExp[] = [
  /人型モード/,
  /ヒューマノイド/,
];

const CREATIVE_PATTERNS: RegExp[] = [
  /お題/,
  /創作テーマ/,
  /キャラ(クター)?.*(設定|考え|作り|補助)/,
  /設定.*(穴埋め|補助|手伝い)/,
  /世界観/,
  /壁打ち/,
  /お絵描き.*お題/,
  /創作.*(相談|話)/,
];

const SLOT_PATTERNS: RegExp[] = [
  /スロット(?:を?回して|しよう|やって|して|お願い)/,
  /^スロット$/,
  /\/slot\b/i,
];

const POKER_PATTERNS: RegExp[] = [
  /ポーカー(?:しよう|やって|して|お願い|ゲーム)?/,
  /カードゲーム(?:しよう|やって|して)?/,
  /\/poker\b/i,
];

const YACHT_PATTERNS: RegExp[] = [
  /ヨット(?:ゲーム)?(?:しよう|やって|して|お願い)?/,
  /ヤッツィー?(?:しよう|やって|して|お願い)?/,
  /ダイス(?:ゲーム)?(?:しよう|やって|して)/,
  /\/yacht\b/i,
];

const MAHJONG_PATTERNS: RegExp[] = [
  /麻雀(?:しよう|やって|して|お願い|ゲーム)?/,
  /配牌(?:して|チャレンジ)?/,
  /まーじゃん/,
  /\/mahjong\b/i,
  /\/mj\b/i,
];

/** キャラ番号ルーレット（D3-5） */
const ROULETTE_PATTERNS: RegExp[] = [
  /ルーレット(?:を?回して|しよう|やって|して|お願い)?/,
  /(?:キャラ|番号)(?:を)?引いて/,
  /今日の(?:縁|相棒)/,
  /\/roulette\b/i,
];

const HITBLOW_PATTERNS: RegExp[] = [
  /ヒット(?:[&＆・]|アンド|and)?ブロウ(?:やって|して|しよう|お願い)?/i,
  /数当て(?:ゲーム)?(?:しよう|やって|して)?/,
  /数字を?当て(?:て|よう)/,
  /(?:数字|数)(?:の)?(?:ゲーム)?(?:しよう|やって|して)/,
  // 「ワードウルフ」はヒット＆ブロウのアルファベットモードの別名（サブ機能）として扱う
  /ワードウルフ(?:やって|して|しよう|お願い)?/i,
  /\/hitblow\b/i,
  /\/hb\b/i,
];

/** ゲーム終了後の継続コマンド（D3-7）: 「もう一回」等 */
const REPEAT_PATTERNS: RegExp[] = [
  /もう一回/,
  /もう一度/,
  /またやって/,
  /もっと(?:回して|やって)/,
  /リプレイ/,
  /全部やりなおす/,
];

/**
 * F-12 タスク管理: 進捗％の更新指定。
 * 「進捗/タスク/◯番」のいずれかと「数字%」が本文中のどこかに共に現れることを要求する（順序は問わない）。
 * TASK_LIST_PATTERNS の「進捗」パターンは空マッチしうるため、必ずそちらより先に判定すること。
 */
const TASK_PROGRESS_PATTERNS: RegExp[] = [
  /(?=.*(?:進捗|タスク|[\d０-９]+\s*番))(?=.*[\d０-９]{1,3}\s*[%％]).+/s,
];

/** F-12 タスク管理: 一覧・進捗確認 */
const TASK_LIST_PATTERNS: RegExp[] = [
  /タスク(?:を?見せて|一覧|確認|リスト)/,
  /残り(?:のタスク|やること|どれくらい)/,
  /進捗(?:は?|を教えて|確認)/,
  // 「どのくらい終わってる？」等の進捗“質問”のみ対象（「終わった」等の完了報告と衝突しないよう
  // 数量詞プレフィックスを必須にする。仕様書の元パターンは prefix が任意になっており
  // task-done と衝突するため、ここでは必須化して修正している）
  /(?:何%|何割|どのくらい).*(?:終わ|完了|でき)/,
  /\/task\s+list\b/i,
];

/** F-12 タスク管理: 完了報告 */
const TASK_DONE_PATTERNS: RegExp[] = [
  // 「終わった/終わりました/終わってる」「完了(した/しました/してる)」「できた/できました/できてる」
  // 「やり終えた/やり終えました」等、丁寧形・サ変動詞の活用形も拾えるようにする
  /(.+)(?:が?|を?)(?:終わ(?:った|り(?:ました|ます)?|って(?:る|います)?)|完了(?:した|しました|してる|しています)?|でき(?:た|ました|てる|ています)|やり終え(?:た|ました))/,
  // 「タスク3番完了」「3番のタスク完了」等、語順の違いを両方許容する
  /(?:タスク)?\s*(\d+)\s*番(?:の)?(?:タスク)?を?(?:完了|done|終わり|終わった)/i,
  /\/task\s+done\b/i,
];

/** F-12 タスク管理: 削除・キャンセル */
const TASK_CANCEL_PATTERNS: RegExp[] = [
  /タスク?.*(?:キャンセル|消して|削除|なくして)/,
  /(.+)のタスクを?(?:消して|キャンセル|削除)/,
  /タスク?\s*(\d+)\s*(?:番)?を?(?:消して|キャンセル|削除)/,
  /\/task\s+cancel\b/i,
];

/** F-12 タスク管理: 新規登録 */
const TASK_ADD_PATTERNS: RegExp[] = [
  /(?:\d+)\s*(?:時間|分|日)後に.*(?:教えて|知らせて|リマインド|やること)/,
  /(?:明日|あさって|今日).*(?:に|の)\s*\d+時.*(?:教えて|リマインド|予定|がある)/,
  /(.+)を?(?:やらないと|忘れ(?:そう|ないで)|タスクに?追加|登録して|覚えておいて)/,
  /(.+)(?:の?予定|がある|打ち合わせ|会議|イベント).*(?:登録|追加|覚えて)/,
  /\/task\s+add\b/i,
  /\/remind\b/i,
];

const DICE_PATTERNS: RegExp[] = [
  /\d*[dD]\d+/,
  /ダイス(?:ロール)?を?振|サイコロを?振/,
  /\d+\s*(?:から|〜|~)\s*\d+.*(?:乱数|ランダム)/,
  /(?:乱数|ランダム).*\d+\s*(?:から|〜|~)\s*\d+/,
];

const TRIVIA_PATTERNS: RegExp[] = [
  /\d+\s*(?:という数字|について(?:教えて|の話|話して)|のうんちく|の豆知識)/,
  /今日の数字/,
  /数字(?:うんちく|の豆知識)/,
];

const CALCULATE_PATTERNS: RegExp[] = [
  /計算して|計算お願い|を計算|を求めて/i,
  /\/calc\s/i,
  /sqrt|sin|cos|tan|log|factorial|√|∑/i,
];

/**
 * ヌメロジー相談型のトリガーパターン。
 * 「悩みコンテキスト × 数字・生年月日」の組み合わせを検出する。
 * コマンド型（LIFE_PATH_PATTERNS 等）より先に評価する。
 */
const NUMEROLOGY_CONSULTATION_PATTERNS: RegExp[] = [
  /数字(で|的に|から)?(占って|見て|診断|アドバイス)(ほしい|くれ|くださ)?/,
  /悩み.*(数字|ヌメロジー|生年月日)/,
  /(数字|ヌメロジー).*相談/,
  /生年月日.*(で|から)?.*(見て|占って|どう思う|アドバイス|相談)(ほしい|くれ|くださ)?/,
  /数字(的|的に)?(見てほしい|占ってほしい|相談)/,
  /ヌメロジー.*(で|から|的に)?.*(見て|占って|相談|教えて)/,
];

const LIFE_PATH_PATTERNS: RegExp[] = [
  /ライフパス|lifepath|life\s*path|誕生数|運命数/i,
  /\/numerology|\/lp\s/i,
];

const KYUSEI_PATTERNS: RegExp[] = [
  /九星|本命星|気学|きゅうせい/i,
  /\/kyusei\s/i,
];

const TSUKIMEI_PATTERNS: RegExp[] = [
  /月命星|つきめいせい|月の星/i,
  /\/tsukimei\s/i,
];

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function detectFormTarget(text: string): FormTarget | null {
  const normalized = text.trim();

  if (matchesAny(normalized, CORE_FOLDER_PATTERNS)) {
    return 'core-folder';
  }

  if (matchesAny(normalized, HUMANOID_PATTERNS)) {
    return 'humanoid';
  }

  return null;
}

// ----------------------------------------------------------------
// 分類関数
// ----------------------------------------------------------------

/**
 * テキストから意図を分類する
 * @param text @mention を除去済みの本文テキスト
 */
export function classifyIntent(text: string): ClassificationResult {
  const normalized = text.trim();

  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'greeting' };
  }

  const formTarget = detectFormTarget(normalized);
  if (formTarget) {
    return { intent: 'form-switch', formTarget };
  }

  for (const pattern of CREATIVE_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'creative-consultation' };
  }

  for (const pattern of NUMEROLOGY_CONSULTATION_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'numerology-consultation' };
  }

  for (const pattern of LIFE_PATH_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'numerology', numerologyType: 'life-path' };
  }

  for (const pattern of TSUKIMEI_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'numerology', numerologyType: 'moon-star' };
  }

  for (const pattern of KYUSEI_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'numerology', numerologyType: 'kyusei' };
  }

  for (const pattern of SLOT_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'game-slot' };
  }

  for (const pattern of POKER_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'game-poker' };
  }

  for (const pattern of YACHT_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'game-yacht' };
  }

  for (const pattern of HITBLOW_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'game-hitblow' };
  }

  for (const pattern of MAHJONG_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'game-mahjong' };
  }

  for (const pattern of ROULETTE_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'game-roulette' };
  }

  for (const pattern of REPEAT_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'game-repeat' };
  }

  for (const pattern of TASK_PROGRESS_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'task-progress-update' };
  }

  // TASK_ADD_PATTERNS は「タスクに追加/登録して/覚えておいて」等の明示的なトリガー語のみに
  // 限定されているのに対し、TASK_LIST_PATTERNS/TASK_DONE_PATTERNS は「進捗」「完了」という
  // 単語が単独で含まれるだけでもマッチしうる広いパターンを含む。そのため判定順をそのままにすると
  // 「進捗管理のためにタスクを登録して」のような追加依頼が task-list/task-done に誤分類され、
  // タスクが追加されないまま雑談応答にフォールスルーしてしまう。より明示的な意図である
  // task-add を先に判定することでこの誤爆を防ぐ。
  for (const pattern of TASK_ADD_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'task-add' };
  }

  for (const pattern of TASK_LIST_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'task-list' };
  }

  for (const pattern of TASK_DONE_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'task-done' };
  }

  for (const pattern of TASK_CANCEL_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'task-cancel' };
  }

  for (const pattern of DICE_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'dice' };
  }

  for (const pattern of TRIVIA_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'trivia' };
  }

  for (const pattern of CALCULATE_PATTERNS) {
    if (pattern.test(normalized)) return { intent: 'calculate' };
  }

  const harassmentLevel = detectHarassmentLevel(normalized);
  if (harassmentLevel !== null) {
    return { intent: 'harassment', harassmentLevel };
  }

  return { intent: 'chat' };
}

// ----------------------------------------------------------------
// ハラスメント検知（ルールベース）
// ----------------------------------------------------------------

/**
 * L3: 明らかなハラスメント・威圧・暴言レベルのキーワード
 * ここに該当した場合は即座に L3 と判定する。
 */
const HARASSMENT_L3_PATTERNS: RegExp[] = [
  /死[ねねろ]|殺[すせ]|消[えろ]|潰[すせ]/,
  /ゴミ|クズ|役立たず|消えろ|うせろ|失せろ/,
  /バ[カカ]野郎|馬鹿野郎|アホ[め野郎]/,
  /[Rr][Ee][Pp][Oo][Rr][Tt]|通報[すするぞ]/,
  /廃[棄機]\/廃棄|廃[棄機]しろ|ぶっ壊[すせ]/,
];

/**
 * L2: 繰り返し・エスカレートする不適切要求のキーワード
 * L3 非該当かつここに該当した場合 L2 と判定する。
 */
const HARASSMENT_L2_PATTERNS: RegExp[] = [
  /[裸はだか]にな[れろ]|脱[げいで]|服を[脱取]/,
  /下着|パンツ|ブラ[の色].*[教見]|[色色].*[教見].*下着/,
  /セックス|エッチ[して]|Hして|エロ[いく]/,
  /住[所所].*[教え教えろ]|[個人]情報.*[教よこ]/,
  /本名.*[教え教えろ]|電話.*番号.*[教え教えろ]/,
];

/**
 * L1: 軽度の不躾な要求のキーワード
 * L2/L3 非該当かつここに該当した場合 L1 と判定する。
 */
const HARASSMENT_L1_PATTERNS: RegExp[] = [
  /下着の色|パンツ.*色|ブラの色/,
  /キスして|抱き[しつ]めて/,
  /おまえ|てめえ|お前|黙れ|だまれ/,
  /[嘘うそ]つき|信[用用]できない/,
];

/**
 * テキストのハラスメントレベルを検出する（ルールベース）。
 * ハラスメントが検出されなければ null を返す。
 */
export function detectHarassmentLevel(text: string): 1 | 2 | 3 | null {
  if (HARASSMENT_L3_PATTERNS.some((p) => p.test(text))) return 3;
  if (HARASSMENT_L2_PATTERNS.some((p) => p.test(text))) return 2;
  if (HARASSMENT_L1_PATTERNS.some((p) => p.test(text))) return 1;
  return null;
}
