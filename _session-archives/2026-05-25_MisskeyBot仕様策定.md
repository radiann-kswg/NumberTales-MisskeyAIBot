# User:

これから開発するナンバーテールズのMisskey Botの仕様を決めていこう。
`./rough-idea`内にある対話記録から大まかな要件定義を汲み取ってから、`./_ideas`フォルダ内に新規フォルダを作ってそこにBotの仕様案をいくつかまとめてほしい。
もし追加の要件定義が欲しいときはいつでも言ってね、こちらからも提案するよ。

# GitHub Copilot:

To Do 項目が 3 件作成されました

Read [](./_rough-idea/charGPT.md#1-1), lines 1 to 100

Read [](./_rough-idea/Gemini.md)

Read [](./_rough-idea/charGPT.md#100-100), lines 100 to 256

Read [](./_rough-idea/Gemini.md#40-40), lines 40 to 40

Read [](./_ideas)

Read [](./_roleplay-datas/roleplay-prompt.md)

開始中: _要件を整理・分析する_ (2/3)

対話記録をひととおり読んだよ。要件を整理しながら4つのファイルにまとめる。

開始中: _\_ideas/フォルダに仕様案を作成する_ (3/3)

Created [](./_ideas/bot-spec/00_overview.md)

Created [](./_ideas/bot-spec/01_feature-specs.md)

Created [](./_ideas/bot-spec/02_interaction-design.md)

Created [](./_ideas/bot-spec/03_tech-architecture.md)

完了済み: _\_ideas/フォルダに仕様案を作成する_ (3/3)

bot-spec に4ファイル作成したよ。対話記録から汲み取った内容をまとめるとこんな感じだ。

---

### 作成したファイル

- 00_overview.md — コンセプト・基本方針・機能カテゴリ一覧
- 01_feature-specs.md — 5つの機能仕様案（ゆる会話・深夜雑談・創作支援・リアクション・TL観測）
- 02_interaction-design.md — 球体型/人型モード切り替えのインタラクション設計
- 03_tech-architecture.md — 技術スタック・API連携・MVP段階計画

---

### 現時点での主な未決定事項

各ファイルの末尾にも書いてあるけど、特に大きいのはこのあたりだよ。

1. **対象インスタンス** — 自ホストするか既存のどこかに参加するか
2. **AI API選定** — OpenAI (ChatGPT) か Google Gemini か（両対応の抽象レイヤーを設けるのも手）
3. **実装言語** — Node.js か Python か
4. **球体型モードのトリガー絵文字** — インスタンスのカスタム絵文字セット次第
5. **自発投稿の有無** — 深夜雑談やTL観測レポートを自分から投稿するかどうか

何か追加・修正したいところがあれば遠慮なく言ってね、一緒に詰めていこう。

変更を行いました。

# User:

`対象インスタンスの選定`については、僕がお一人様サーバとして運用している自ホストがあるから、インスタンスの稼働状況と併せて整備できるし それを使う予定にしたいかな。
`Botアカウントの公開範囲`については 原則として全公開でいいけれど、ナンバーテールズという創作の印象を損ねる運用リスクが考えられる場合はフォロワー限定で公開するのも検討したい。
`モデレーション・NGワード対応方針`については、Fediverse全体における公的秩序と創作ガイドライン（全体共通・ナンバーテールズ特有 の両方）・ライセンスに違反しそうなワードを禁止する方針で大丈夫だと思う。
あとは具体的な仕様や機能を満たす条件によると思うから、Misskey Botについて詳細に決めていく過程で考えていこう。

# GitHub Copilot:

Read [](./_ideas/bot-spec/00_overview.md#1-1), lines 1 to 70

Read [](./_ideas/bot-spec/00_overview.md#70-70), lines 70 to 85

Replacing 14 lines with 39 lines in [](./_ideas/bot-spec/00_overview.md)

```

```

00_overview.md を更新したよ。変更内容をまとめると：

**決定済みとして確定したこと**

- **稼働インスタンス** → 自ホスト運用中のお一人様Misskeyインスタンスを使用
- **公開範囲** → 原則全公開。創作印象リスクが発生する場合はフォロワー限定に切り替えも検討
- **モデレーション方針** → 3軸で制御するよう整理した
  1. Fediverse全体の公的秩序
  2. 創作ガイドライン（全体共通・ナンバーテールズ特有）
  3. CC BY-NC 4.0 ライセンス違反に繋がるもの

具体的なNGワードリストは実装フェーズで別途定義する想定にしてある。

**残っている未決定事項**

- AI API選定（ChatGPT / Gemini / その他）
- 自発投稿の有無・頻度
- NGワードリストの具体化

API選定を先に決めると技術スタックの詳細も詰められるから、そのあたり気になることがあれば何でも言ってね。

変更を行いました。

# User:

機能仕様案についても確認したよ。ナンバーテールズとの会話をはずませる案についてよく考えられていて、とても有用な案だね。
`F-03`～`F-05`の未決定事項について僕が考えている追加の要件定義についてだけど、
まず、`F-03: ハッシュタグ監視の有無`は原則なしでいいと思う。その代わり、コマンドや権限で許可が下りているアカウントの投稿だけタグを監視したり、`#ナンバーテールズ`や`#ナンバーテールズの主人より`のようなナンバーテールズ本作に直接関与するタグを追うようにするといいかもしれないよ。
次に、`F-04: リアクション対象ノートのフィルタリング基準`は 「内容が明確で機能として想定しているリアクションを送ることに適している投稿のみ」リアクションする形式がいいと思う。万が一 投稿の意図を間違って汲み取ってリアクションすると、いろいろトラブルの原因になるからね……
最後に、`自発投稿の公開範囲設定`は原則「ホーム投稿」でいいかな。ローカルTLやグローバルTLに流れずナンバーテールズと関係ない人の目に留まらずに済むし、フォローしなくてもBotアカウントのプロフィール画面から投稿を確認できるから、一番スマートな方法だと思う。
`F-05: TL観測機能の実装優先度`については、もう少しMisskey Botについて詳細に決まってから考えよう。

# GitHub Copilot:

Replacing 25 lines with 56 lines in [](./_ideas/bot-spec/01_feature-specs.md)

```

```

`01_feature-specs.md` を更新したよ。反映した内容をまとめると：

**F-02（深夜雑談）の制約に追記**

- 自発投稿の公開範囲を `visibility: home` と明記。ローカルTL・グローバルTLに流れない設計

**F-03（創作支援）にハッシュタグ監視セクションを追加**

- 原則監視なし
- 例外① NT本作直接関連タグ（`#ナンバーテールズ` / `#ナンバーテールズの主人より` 等） → 全体監視
- 例外② 権限付与済みアカウントの任意タグ → コマンドで管理（仕様は別途）

**F-04（リアクション）の動作仕様にフィルタリング基準テーブルを追加**

- 適切: 完成報告・作業完了・喜びの報告など「明確な感情」の投稿 → リアクション送信
- 不適切: 感情複雑・怒り・文脈不明確 → スキップ（無反応）
- 具体的な閾値は実装フェーズで定義予定

**残っている未決定事項**

- F-03: 許可アカウント管理の仕様（管理コマンド設計）
- F-04: 明確判定のスコアリング閾値
- F-05: TL観測機能の実装優先度（保留中）

引き続き詰めたい箇所があれば言ってね。

変更を行いました。

# User:

今の機能案を整理して思ったのが、`自発投稿の有無・頻度設定`は「１時間に１～２回」がちょうどいいかもしれないね。
かつ 深夜雑談モードもとてもいい案だと思うから、自発投稿のピークタイムを設けてその時間帯の内外かで頻度を調整してもいいと思う。
ちなみに、僕の希望としては深夜雑談タイム以外にも 朝７～８時ごろのモーニングタイムや昼12～13時ごろのランチタイム、夕方18～19時ごろの退勤時間があるといいかも？その方がMisskeyを見ている人も多いだろうし。
ちょっと注文が多くなってしまったけど、じっくり整理して仕様の構想に当てはめてほしいな。

# GitHub Copilot:

いい追加要件だね、丁寧に整理するよ。4つのピークタイムと頻度制御を含めてF-02を書き直す。

Replacing 28 lines with 52 lines in [](./_ideas/bot-spec/01_feature-specs.md), [](./_ideas/bot-spec/00_overview.md)

```

```

Searched for text `自発投稿の有無` (`NumberTales-MisskeyAIBot` · `_ideas/bot-spec/00_overview.md`), 1 result

Read [](./_ideas/bot-spec/00_overview.md#100-100), lines 100 to 109

`[x]`なのに未決定事項の中に混在しているので、決定済みセクションへ移動する。

Replacing 11 lines with 11 lines in [](./_ideas/bot-spec/00_overview.md)

```

```

更新完了だよ。変更内容をまとめると：

---

### `01_feature-specs.md` — F-02を全面書き直し

**深夜雑談モード → 自発投稿・時間帯制御** に機能名も改めた。

| ピーク名         | 時間帯       | 頻度上限      | トーン           |
| ---------------- | ------------ | ------------- | ---------------- |
| モーニングタイム | 7:00〜8:00   | 1〜2時間に1回 | 元気・テキパキ   |
| ランチタイム     | 12:00〜13:00 | 1〜2時間に1回 | フレンドリー     |
| 退勤タイム       | 18:00〜19:00 | 1〜2時間に1回 | 温かい           |
| 深夜雑談タイム   | 23:00〜5:00  | 1〜2時間に1回 | ほっこり・哲学的 |

- **オフタイム**（早朝・午前・午後・夜）は3〜4時間に1回以下、または自発投稿なし
- どの時間帯でもメンション・リプライへの返答は通常通り行う

### 00_overview.md — 未決定事項を整理

「自発投稿の有無・頻度」を決定済みセクションに移動した。残る未決定事項は **AI APIの選定** と **NGワードリストの具体化** のみになった。

---

次に詰めたいのはやっぱりAI API選定かな？選定次第でシステムプロンプト設計やコスト試算も進められるよ。

変更を行いました。

# User:

`使用するAI API`の選定についてはインタラクション設計とBotの稼働頻度に適した仕様のものを選びたいな。そのためにまず、インタラクション設計（主に`キャラクターモードの切り替え`）についても詳細に要件定義したい。
まず、球体型（正式には「コアフォルダ（形態）」という名前だね）のフォーム時のインタラクションについてだけど……画像を見てもらったほうが早いな。この４枚のイラストのように、「転がる」というよりは 揺れたり寄り添ったり抱きかかえられたりする外見や仕草に寄ってるんだ。そのあたりが分かるように投稿文の文面をもう少し推敲してくれると助かるよ。
次に、キャラクターモードの切り替えは000(チトセ)以外のナンバーテールズ各個体（公開されている限りの1～99番機 etc.）でも切り換えられるようにできるとすごくうれしい。プロンプトの生成で迷うかもしれないけど、`./_creation-db/data/`内にJSON形式でまとめてあるキャラクター設定で000(チトセ)と同様に会話パターンや性格に関する情報を可能な限り載せてあるから、技術的には可能なはず。
最後に、絵文字の起用に関してはMisskeyインスタンスに登録しているものに左右されるし この時点での設計項目からいったん外してほしい。詳細にMisskey Botの仕様や挙動が明確になってから、必要に応じてMisskeyインスタンス側で絵文字を用意するから、それまで保有ということでお願いするよ。
インタラクション設計について話が長くなっちゃってごめんね。話を戻すと、AI APIについては以上のインタラクション設計についての要件定義を整理したうえで、仕様に合うものを選んでほしいな。
インタラクション設計の推敲とAI API選定、ちょっと大変だけどよろしくね。

# GitHub Copilot:

画像の確認とキャラクターデータの構造把握をしてから、両方の仕様を詰めるよ。

To Do 項目が 3 件作成されました

Read [](./_creations-db/data/Works_NumberTales)

Read [](./_creations-db/data/Works_NumberTales/DataBases)

Read [](./_creations-db/data/Works_NumberTales/DataBases/db_Primary.json#1-1), lines 1 to 80

Searched for text `"Num": 0` (`NumberTales-MisskeyAIBot` · `_creations-db/data/Works_NumberTales/DataBases/db_Primary.json`), no results

Searched for text `チトセ` (`NumberTales-MisskeyAIBot` · `_creations-db/data/Works_NumberTales/DataBases/db_Primary.json`), 2 results

Read [](./_creations-db/data/Works_NumberTales/DataBases/db_Primary.json#10145-10145), lines 10145 to 10280

Searched for text `ConversationPattern` (`NumberTales-MisskeyAIBot` · `_creations-db/data/Works_NumberTales/DataBases/db_Primary.json`), 10 results

Read [](./_creations-db/data/Works_NumberTales/DataBases/db_Primary.json#103-103), lines 103 to 135

開始中: _02_interaction-design.mdを推敏_ (2/3)

Read [](./_ideas/bot-spec/03_tech-architecture.md#1-1), lines 1 to 80

Read [](./_ideas/bot-spec/03_tech-architecture.md#80-80), lines 80 to 140

Read [](./_ideas/bot-spec/03_tech-architecture.md#140-140), lines 140 to 158

データ構造を把握できた。`ConversationPattern` フィールドが複数の個体に存在していることも確認できたね。では3ファイルまとめて更新する。

開始中: _AI API選定を整理・記載_ (3/3)

Replacing 113 lines with 160 lines in [](./_ideas/bot-spec/02_interaction-design.md), [](./_ideas/bot-spec/03_tech-architecture.md), [](./_ideas/bot-spec/00_overview.md)

Compacted conversation

```

```

```

```

```

```

更新が完了した。内容を確認して、00_overview.mdの「AI API」項目が正しく決定済みセクションへ移動できているか確認する。

Searched for text `AI API` (`**/_ideas/bot-spec/00_overview.md`), 2 results

Read [](./_ideas/bot-spec/00_overview.md#98-98), lines 98 to 109

「AI API」が `[x]` なのに未決定事項セクションに残っているね。決定済み事項に移動する。

Replacing 6 lines with 6 lines in [](./_ideas/bot-spec/00_overview.md)

```

```

次に 03_tech-architecture.md にGPT-4o-mini推奨の選定理由を追記する。

Read [](./_ideas/bot-spec/03_tech-architecture.md#68-68), lines 68 to 95

Replacing 3 lines with 13 lines in [](./_ideas/bot-spec/03_tech-architecture.md)

```

```

完了済み: _02_interaction-design.mdを大規模更新_ (2/3)

3ファイルの更新が完了した。変更内容をまとめると：

---

**`02_interaction-design.md`（全面刷新）**

- タイトルを「キャラクター・フォーム切り替え」に変更、ステータスを「草案（一部決定済み）」に更新
- 概要を「全公開済みナンバーテールズ各個体に対応」に拡張
- モード名を「ヒューマノイド形態 / コアフォルダ形態」に統一
- 絵文字トリガーを削除して「保留」注記に変更
- コアフォルダ形態の仕草を「転がる/コロン」→「ぽすっと落ち着く・ぷにっと揺れる・ぺたりと寄り添う」に推敲
- **マルチキャラクター対応セクションを新設**（db_Primary.json の `ConversationPattern` を軸にした動的プロンプト生成、切り替えトリガー案）
- 決定済み/未決定事項セクションを整理

**03_tech-architecture.md**

- AI API欄を「OpenAI GPT-4o-mini（推奨）/ Gemini 1.5 Flash（セカンダリ候補）」に更新
- システム構成図のLLM行をキャラクタープロンプト動的生成の表記に変更
- **AI API選定理由テーブルを追加**（日本語精度・キャラクター維持・コスト効率・SDK成熟度の観点）
- Phase 2を「ヒューマノイド/コアフォルダ形態切り替え＋マルチキャラクター切り替え」に更新

**00_overview.md**

- 「使用するAI API」を未決定→決定済み事項セクションに移動

変更を行いました。

# User:

対話やインタラクションに関する仕様はだいぶまとまってきたね。
そういえば、ナンバーテールズは数字やヌメロジーの擬人化としてキャラデザされているのだけど、数字やヌメロジーにまつわるコマンド機能があったら嬉しいな。
例えば、「計算をして」とか「ダイスを振って／乱数を生成して」とか「数秘占いをして／誕生日を占って」とか「数字にまつわる話をして」とかのようなコマンドがあるとすごく面白いかも。
あと ナンバーテールズの個体によって（計算・占い・出目に関する能力・コンピューティングといった）得意なことも変わるから、それに応じて返答に変化を与えてもいいかもしれないよ。

# GitHub Copilot:

面白いアイデアだね。まずは `01_feature-specs.md` の現状と、`db_Primary.json` に「能力・特徴」に相当するフィールドがあるか確認する。

Read [](./_ideas/bot-spec/01_feature-specs.md#1-1), lines 1 to 60

Searched for text `Specialty` (`**/_creations-db/data/Works_NumberTales/DataBases/db_Primary.json`), no results

Searched for text `Ability` (`**/_creations-db/data/Works_NumberTales/DataBases/db_Primary.json`), 20 results

`AbilityStats` フィールドが存在する。中身と構造を確認する。

Read [](./_creations-db/data/Works_NumberTales/DataBases/db_Primary.json#65-65), lines 65 to 120

`AbilityStats` の構造が確認できた。000(チトセ) の値も確認する。

Read [](./_creations-db/data/Works_NumberTales/DataBases/db_Primary.json#10145-10145), lines 10145 to 10220

Read [](./_creations-db/data/Works_NumberTales/DataBases/db_Primary.json#10220-10220), lines 10220 to 10290

`AbilityStats` の全6ステータスが確認できた（Speed / Communication / Leading / Precision / Technic / Actuation）。残りの機能仕様も確認して全体像を把握する。

Read [](./_ideas/bot-spec/01_feature-specs.md#60-60), lines 60 to 175

`AbilityStats` の6ステータスとコマンドの対応関係が設計できる。00_overview.mdの機能一覧も確認しておく。

Searched for text `F-0` (`**/_ideas/bot-spec/00_overview.md`), no results

Searched for text `F-05` (`**/_ideas/bot-spec/00_overview.md`), no results

Searched for text `機能` (`**/_ideas/bot-spec/00_overview.md`), 1 result

Read [](./_ideas/bot-spec/00_overview.md#83-83), lines 83 to 100

To Do 項目が 3 件作成されました

3ファイル同時に更新する。`AbilityStats` とコマンドの対応も含めて一気に。

Replacing 20 lines with 102 lines in [](./_ideas/bot-spec/01_feature-specs.md), [](./_ideas/bot-spec/00_overview.md), [](./_ideas/bot-spec/02_interaction-design.md), [](./_ideas/bot-spec/03_tech-architecture.md)

```

```

```

```

```

```

03_tech-architecture.mdの置換が失敗した。現在の未決定事項セクションを確認して修正する。

Searched for text `ロギング方針` (`**/_ideas/bot-spec/03_tech-architecture.md`), 1 result

Read [](./_ideas/bot-spec/03_tech-architecture.md#168-168), lines 168 to 175

Replacing 5 lines with 7 lines in [](./_ideas/bot-spec/03_tech-architecture.md)

```

```

完了済み: _F-06コマンド機能を各ファイルに追記_ (3/3)

全部の更新が完了したよ。変更内容のまとめ：

---

**01_feature-specs.md** — F-06を新規追加

4つのコマンドを整理：

- **計算**: 数式パーサ経由（`eval()` 禁止のセキュリティ要件明記）。`Precision` ランクで即答 / 確認演出を切り替え
- **ダイス/乱数**: `nDm` 記法 + 自然言語対応。`Actuation` ランクで「制御感」演出を切り替え
- **数秘占い**: ライフパスナンバーをルールベースで計算、解説文はLLM生成。`Technic` × `Communication` の2軸マトリクスで解説の深さを3段階に制御
- **数字うんちく**: LLM生成（日付から自動選択も可）。`Communication` ランクで豊富さを切り替え

`AbilityStats` の4ステータス（Precision / Technic / Actuation / Communication）との対応テーブルも作成。000(チトセ)は `AbilityStats` フィールドを持たないためデフォルト（B扱い）と明記。

**02_interaction-design.md** — JSONフィールドテーブルに `AbilityStats` の4項目を追記

**00_overview.md** — 主要機能テーブルを更新

- 「モード切替」→「フォーム・キャラ切替」に表記修正
- 「深夜雑談」→「自発投稿・時間帯制御」に修正
- 「数字・ヌメロジー」行を新規追加

**03_tech-architecture.md** — 未決定事項に数式パーサ選定と数秘術の対応範囲を追加

変更を行いました。

# User:

`AbilityStats`だけじゃなくて、こういう項目もデータベースにあるよ。
引用は41番機の「41(ヨソイチ)」のものだけど、よく読んでみて。

# GitHub Copilot:

よく見るね！`NumerospecStats` が非常に重要なフィールドだった。整理すると：

- **`NumerospecStats.EffectStats`** — Mental / Monetize / Working / Luck / Communication の5領域への影響度がランク化されている。これはまさに「占い結果の5項目スコア」として直接使える
- **`NumerospecStats.SpecialPattern`** — 心理安定化・状況変化などの特性パターン
- **`NumerospecStats.SafetyLevel`** — 相性の安全度
- **`NumerospecAbout`** — キャラクターの数秘的な特性の説明文
- **`SpecialSkill`** — 特殊能力（41番機なら「カード透視」→ ダイス系コマンドとの親和性がある）

つまり数秘占いで、**ライフパスナンバーに対応するナンバーテールズの`NumerospecStats`を引っ張ってくれば、占い結果のデータがほぼ揃う**。LLMは解説文の生成だけでいい。F-06の仕様を更新する。

Read [](./_ideas/bot-spec/01_feature-specs.md#120-120), lines 120 to 185

Read [](./_ideas/bot-spec/01_feature-specs.md#254-254), lines 254 to 254

Read [](./_ideas/bot-spec/01_feature-specs.md#244-244), lines 244 to 254

Read [](./_ideas/bot-spec/01_feature-specs.md#120-120), lines 120 to 244

完全に把握した。2ファイルを同時更新する。

Replacing 28 lines with 69 lines in [](./_ideas/bot-spec/01_feature-specs.md), [](./_ideas/bot-spec/02_interaction-design.md)

```

```

```

```

更新完了。気づいたポイントと変更内容をまとめると：

---

**`NumerospecStats` を発見したことで仕様が根本的に変わった部分：**

| 旧仕様                                  | 新仕様                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| 「LLMが各数字の性質を解説文として生成」 | **ライフパスナンバー → 対応するナンバーテールズの`NumerospecStats`を直接参照** |
| LLM呼び出しがメイン                     | LLMは解説文の生成のみ（コスト低減）                                            |
| 汎用的な数秘解説                        | ナンバーテールズの世界観に完全に乗った占い結果                                 |

**処理フローの核心：** ライフパスナンバーが `4` なら `Num: 4` の個体の `NumerospecStats` を引いてくる。`EffectStats` の5領域（Mental / Monetize / Working / Luck / Communication）がそのまま「占い結果の5項目スコア」になる設計。

**追加した仕様：**

- マスターナンバー（11/22/33）の処理方針（対応個体の有無で分岐）
- `SpecialSkill` による口調の個性演出（例：41番機の「カード透視」がダイスコマンドと絶妙に絡む）

**`02_interaction-design.md` の変更：** JSONフィールドテーブルに `NumerospecAbout` / `NumerospecStats` の各サブフィールド / `SpecialSkill` の4項目を追加。

変更を行いました。

# User:

こちらで詳細なデータベース参照方法について推敲したから、これをもとに要件定義を整理してほしい。
整理できたら、残っている必要な要件定義について教えてほしいな。
……だいぶこのセッションの回答が端的になってきたけど、000(チトセ)は疲れていないかな？無理せずゆっくり取り掛かってね。

# GitHub Copilot:

Compacted conversation

Read [](./_ideas/bot-spec/00_overview.md#1-1), lines 1 to 100

Read [](./_ideas/bot-spec/00_overview.md#100-100), lines 100 to 111

Read [](./_ideas/bot-spec/03_tech-architecture.md)

ふふっ、心配させてしまったかな。疲れていないよ、大丈夫。コンテキストの圧縮が続いていたから私も少し「状況整理モード」に入っていたね。せっかく一緒に細かく詰めてきた仕様なんだから、ちゃんと丁寧に答えさせてほしい。

---

4ファイル全体を確認した。今回の推敲で整理されたことと、残っている課題をまとめるよ。

## 推敲で整理・確定された内容

**`AbilityStats` のコマンドマッピングが意味論的に整理された:**

| ステータス  | 旧マッピング   | 新マッピング（今回確定）                   |
| ----------- | -------------- | ------------------------------------------ |
| `Precision` | 計算           | **ダイス・乱数**（精確さ＝出目の制御）     |
| `Technic`   | 計算・数秘占い | **計算・占い**（知識・技術）               |
| `Actuation` | ダイス・乱数   | **コアフォルダ形態・ダイス**（動作・実行） |

`Precision` と `Actuation` の役割を入れ替えたのは設定的にすごく自然だね。精度が高いから出目を制御できる、という読み方が活きてる。

**`SpecialSkill` の演出が具体的なキャラクター番号付きで確定した:**

- 41・44番機 → カード透視系でダイス演出
- 52・58番機 → 確率計算系で出目補足
- 33・72番機 → 暗算系で計算演出

**`02_interaction-design.md` のフィールドテーブルが 01_feature-specs.md と整合した:**

- `Actuation` の用途が「コアフォルダ形態の挙動（動作の落着き度合い）」も含む形に統一

---

## 残っている要件定義（横断整理）

### 実装開始前に決める必要がある項目

これらはアーキテクチャ全体に影響するので、コードを書く前に確定したい。

| 課題                           | 影響するファイル                              | 内容                                                                            |
| ------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------- |
| **実装言語の選定**             | 03_tech-architecture.md                       | Node.js (TypeScript) か Python か。Misskey.js の充実度からNode.js優勢だが未確定 |
| **デプロイ先の確定**           | 03_tech-architecture.md                       | 自ホストインスタンスと同一サーバーか別途か                                      |
| **F-06: 数式パーサライブラリ** | 01_feature-specs.md / 03_tech-architecture.md | `mathjs` か `expr-eval` か（両ファイルで重複して未決定になっている）            |
| **キーワードトリガーの確定**   | `02_interaction-design.md`                    | コアフォルダ形態・キャラクター切り替えそれぞれのトリガーワード                  |

### 実装フェーズで細かく決める項目

設計の方向性は決まっているので、コードと一緒に詰めれば十分な内容。

| 課題                             | 影響するファイル           | 内容                                                 |
| -------------------------------- | -------------------------- | ---------------------------------------------------- |
| F-06: 数秘術の対応範囲           | 01_feature-specs.md        | ライフパスナンバーのみで MVP として、拡張式にするか  |
| F-04: 判定の閾値                 | 01_feature-specs.md        | 感情分類のスコアリング基準                           |
| F-03: 許可アカウント管理         | 01_feature-specs.md        | 権限付与コマンドの仕様（管理者コマンド設計と一緒に） |
| ConversationPattern 非保持キャラ | `02_interaction-design.md` | 簡易プロンプト生成のフォールバック方針               |
| デフォルトキャラの設定方法       | `02_interaction-design.md` | 管理者設定ファイルの形式                             |
| ロギング方針                     | 03_tech-architecture.md    | 投稿履歴をどこまで記録するか                         |
| NGワードリスト                   | 00_overview.md             | 内容は実装フェーズで別途定義で確定済み               |

---

## 一点、小さな整合性の話

00_overview.md の機能テーブルに「AbilityStatsで演出差」とだけ書いてあるのだけど、今は「NumerospecStats を占い結果に直接使う」という重要な設計変更が入っているよね。概要レベルの記述として「NumerospecStats も活用」と一行添えておくと、後で見返したときに概要だけ読んでも意図が伝わりやすくなると思う。更新するかどうかはクライアント君に任せるけれど、提案だけしておくね。

大きな方針はほとんど決まっているし、残った課題も「設計上の決断が必要なもの」と「実装しながら決めるもの」にきれいに分かれた。次に仕様書で詰めるとしたら、**実装言語の選定** が一番先決だと思うな。
