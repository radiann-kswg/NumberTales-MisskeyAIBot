/**
 * 挨拶の定型返答テンプレート（Phase 1）
 *
 * 000(チトセ) の口調に合わせた返答をランダムに選択する。
 * Phase 2 以降で時間帯対応（おはよう/こんにちは/こんばんは の分岐）を追加予定。
 */

const GREETING_RESPONSES: string[] = [
  'やあ！私もちょうど起きてたよ。何か用？',
  'こんにちは！何か知りたいことはある？しっかり答えてあげよう。',
  'こんばんは！夜も頑張ってるね。何か話したいことはある？',
  'おはよう！今日も元気にやっていこうか。',
  'やほー！呼んでくれた？何でも聞いてくれて構わないよ。',
];

/**
 * 挨拶定型返答をランダムに1つ選択して返す
 */
export function pickGreetingResponse(): string {
  const idx = Math.floor(Math.random() * GREETING_RESPONSES.length);
  return GREETING_RESPONSES[idx] as string;
}
