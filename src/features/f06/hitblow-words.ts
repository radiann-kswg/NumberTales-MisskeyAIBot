/**
 * ヒット＆ブロウ アルファベットモード用の補助データ
 *
 * - ワードウルフ風モード: 正解を意味のある一般英単語（安全性を確認済みの手動選定リスト）にする
 * - 予想ワードの放送事故ガード: 英語の不適切表現を含む予想が来た場合にやんわり注意しゲームを継続する
 */

/** 桁数（文字数）ごとの正解候補（すべて安全性を確認済みの一般英単語・大文字表記） */
const WORD_BANK: Record<number, string[]> = {
  2: ['GO', 'TO', 'ON', 'IN', 'AT', 'BE', 'OF', 'SO', 'IS', 'IT', 'MY', 'NO', 'OK', 'UP', 'WE', 'US', 'AM', 'HI'],
  3: ['CAT', 'DOG', 'SUN', 'SKY', 'SEA', 'RUN', 'FLY', 'ICE', 'TEA', 'BOX', 'KEY', 'MAP', 'BED', 'BAG', 'JOY', 'RED', 'BIG', 'HOT', 'WIN', 'TOP'],
  4: ['MOON', 'STAR', 'FIRE', 'WIND', 'SNOW', 'LAKE', 'TREE', 'BIRD', 'FISH', 'GOLD', 'BLUE', 'ROSE', 'CAKE', 'BOOK', 'LOVE', 'RAIN', 'LEAF', 'GATE', 'DESK', 'LAMP'],
  5: ['APPLE', 'TIGER', 'HAPPY', 'SMILE', 'LIGHT', 'OCEAN', 'DREAM', 'MUSIC', 'HEART', 'SUGAR', 'CLOUD', 'RIVER', 'PLANT', 'STONE', 'MAGIC', 'HONEY', 'PIANO', 'TABLE', 'CHAIR', 'BEACH'],
  6: ['ORANGE', 'FLOWER', 'SILVER', 'SPRING', 'SUMMER', 'WINTER', 'GARDEN', 'PLANET', 'ISLAND', 'FRIEND', 'ANIMAL', 'CASTLE', 'BASKET', 'BUTTON', 'CANDLE', 'PENCIL', 'PURPLE', 'YELLOW', 'COFFEE', 'SCHOOL'],
  7: ['RAINBOW', 'FREEDOM', 'JOURNEY', 'HARMONY', 'CRYSTAL', 'THUNDER', 'PICTURE', 'KITCHEN', 'MORNING', 'EVENING', 'FANTASY', 'CAPTAIN', 'DIAMOND', 'JASMINE', 'PENGUIN'],
  8: ['SUNSHINE', 'ELEPHANT', 'MOUNTAIN', 'CHILDREN', 'COMPUTER', 'PRINCESS', 'DAUGHTER', 'BIRTHDAY', 'SANDWICH', 'FOOTBALL', 'HOSPITAL', 'CALENDAR', 'UMBRELLA', 'UNIVERSE', 'DINOSAUR'],
  9: ['SUNFLOWER', 'ADVENTURE', 'BUTTERFLY', 'TELEPHONE', 'DELICIOUS', 'FRAGRANCE', 'SANDSTONE', 'CROCODILE', 'KNOWLEDGE', 'NEWSPAPER', 'CHOCOLATE', 'BEAUTIFUL', 'DIRECTION'],
  10: ['STRAWBERRY', 'WATERMELON', 'VOLLEYBALL', 'UNIVERSITY', 'BIRTHSTONE', 'FRIENDSHIP', 'GENERATION', 'STATIONARY', 'DISCUSSION', 'BASKETBALL'],
  11: ['GRASSHOPPER', 'CATERPILLAR', 'INFORMATION', 'DESTINATION', 'CELEBRATION', 'RESPONSIBLE', 'INTELLIGENT', 'IMAGINATION', 'APPLICATION', 'EXPLANATION'],
  12: ['NEIGHBORHOOD', 'CONVERSATION', 'RELATIONSHIP', 'ORGANIZATION', 'INTRODUCTION', 'CIRCUMSTANCE', 'ACCOMPLISHED', 'CONSTRUCTION', 'PRESENTATION'],
  13: ['COMMUNICATION', 'QUALIFICATION', 'UNDERSTANDING', 'INVESTIGATION', 'DEMONSTRATION', 'CONSIDERATION', 'EXTRAORDINARY', 'ENTERTAINMENT'],
  14: ['RECOMMENDATION', 'IMPLEMENTATION', 'RESPONSIBILITY', 'TRANSFORMATION', 'ADMINISTRATION', 'CHARACTERISTIC', 'TRANSPORTATION'],
  15: ['CONGRATULATIONS', 'INTERNATIONALLY', 'STRAIGHTFORWARD', 'ACCOMPLISHMENTS', 'PSYCHOLOGICALLY', 'ENVIRONMENTALLY'],
};

/** 指定文字数の正解候補一覧を返す（未対応の文字数は空配列） */
export function wordsOfLength(length: number): readonly string[] {
  return WORD_BANK[length] ?? [];
}

/**
 * 予想ワードに含まれると「放送事故」になりうる英語表現（部分一致・大文字小文字を無視）。
 * 実在の英単語を自由に打てるアルファベットモードの性質上、偶然／意図的に卑語が
 * 混ざる予想が来ても、ゲームを中断せずやんわり注意して続行するために使う。
 */
const EN_FLAGGED_SUBSTRINGS = [
  'FUCK', 'SHIT', 'BITCH', 'ASSHOLE', 'CUNT', 'NIGGER', 'NIGGA', 'FAGGOT',
  'WHORE', 'SLUT', 'RAPE', 'RETARD', 'DICK', 'COCK', 'PUSSY', 'PORN',
];

/** 予想ワードが放送事故的な表現を含むかどうかを判定する */
export function containsFlaggedWord(word: string): boolean {
  const upper = word.toUpperCase();
  return EN_FLAGGED_SUBSTRINGS.some((flagged) => upper.includes(flagged));
}
