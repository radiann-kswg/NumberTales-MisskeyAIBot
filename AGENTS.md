# NumberTales-MisskeyAIBot — Agent Instructions（共通の真実源 / SSOT）

> このファイルは、本リポジトリで作業するすべての AI エージェント（Claude / GitHub Copilot 等）が
> 共有する **唯一の正典（Single Source of Truth）** です。
> プロジェクト概要・構成・実装状況・運用ルールなどの **共通仕様はすべてここに集約** します。
> 各ツール固有の薄い設定書（[CLAUDE.md](./CLAUDE.md) / [.github/copilot-instructions.md](./.github/copilot-instructions.md)）は、
> このファイルを参照したうえで、ツール固有の事項のみを記述します。

---

## 設定書の同期ルール（重要）

本リポジトリには 3 つのエージェント設定書があります。役割を明確に分けて運用してください。

| ファイル | 役割 |
| --- | --- |
| `AGENTS.md`（本ファイル） | **共通仕様の唯一の正典（SSOT）**。プロジェクト概要・構成・実装状況・ロールプレイ・運用・禁止事項などを集約 |
| `CLAUDE.md` | Claude（Cowork / Claude Code）固有の**薄い設定書**。本ファイルを参照し、セッションルーティン・ツール固有事項・参照リンクのみ記述 |
| `.github/copilot-instructions.md` | GitHub Copilot 固有の**薄い設定書**。本ファイルを参照し、セッションルーティン・ツール固有事項・参照リンクのみ記述 |

> **SSOT 方針**: 薄い設定書（`CLAUDE.md` / `.github/copilot-instructions.md`）には、プロジェクト概要・
> リポジトリ構成・実装済み機能テーブル・設計方針・Git ブランチ運用・VM 操作・禁止事項などの
> **共通仕様を重複させない**。これらはすべて本ファイル（AGENTS.md）に集約し、薄い設定書からは参照リンクで
> 繋ぐ。この SSOT 方針は姉妹リポジトリ [100BeautiesLab_GeneratorsAI](https://github.com/radiann-kswg/100BeautiesLab_GeneratorsAI) と共有している。

**両エージェント設定を常に同内容に保つための手順:**

1. **共通事項を変更するときは、必ず本ファイル（AGENTS.md）を更新する。** `CLAUDE.md` や
   `copilot-instructions.md` に共通仕様を直接書き足さないこと（重複・乖離の原因になる）。
2. `CLAUDE.md` / `copilot-instructions.md` には、本ファイルへの参照リンクと、各ツール固有の
   事項（口調例・固有の記録運用など）のみを残す。
3. 構成・実装状況・運用ルールを変更したら、**3 ファイルの記述が矛盾していないか必ず確認する。**
   共通内容は本ファイルに一本化されているため、原則として本ファイルだけを直せば両設定書に反映される。
4. ツール固有設定書を更新する際に共通事項に触れた場合は、その内容を本ファイルへ巻き取ること。

### 機能実装後のドキュメント更新ルール（重要）

新機能の実装・既存機能の変更を行ったら、コミット前または直後に以下を必ず更新すること。

| 更新対象 | 更新内容 |
| -------- | -------- |
| 本ファイル（AGENTS.md）| 「実装済み機能」テーブルに行を追加・ディレクトリ構成を反映 |
| `.github/copilot-instructions.md` / `CLAUDE.md` | 薄い設定書のため実装済み機能・ディレクトリ構成は保持しない。ツール固有事項に変更が生じたときのみ更新 |
| `README.md` | ユーザー向け機能説明セクションに追記・ディレクトリ構成・今後の予定を更新 |
| `_ideas/milestone/` | 完了したマイルストーンに `ステータス: 完了 ✅` を記録し、[進捗ログの棚卸ルール](#進捗ログの棚卸ルール重要)に従い `completed/` へ整理 |

**エージェントへの指示**: 機能追加・変更を行うタスクが完了したら、上記 4 点の更新をタスクの一部として実施すること。ユーザーから別途依頼されなくても自発的に行うこと。

### 進捗ログの棚卸ルール（重要）

`_ideas/milestone/` と `_ideas/future-plan/` は、進捗状況に応じて棚卸し用サブフォルダへ整理する。
着手中・未昇進のものだけを親フォルダ直下に残し、完了・昇進済みのものはサブフォルダへ退避して見通しを保つこと。

**1. 完了マイルストーンの棚卸（`_ideas/milestone/completed/`）**

- マイルストーンの実装が完了したら、そのファイルを `_ideas/milestone/completed/` へ移動する。
- ファイル冒頭に `> ステータス: 完了 ✅`（完了根拠: typecheck・実装確認日等）を記録する。
- `_ideas/milestone/completed/README.md` の「一覧」テーブルに行を追加する。
- 移動元 `_ideas/milestone/README.md` では「マイルストーン一覧（進行中・未着手）」から当該行を削除し、
  「機能進捗表」の参照リンクを `completed/...` 配下のパスへ更新する。

**2. 昇進済みアイデアの棚卸（`_ideas/future-plan/confirmed-milestone/`）**

- `_ideas/future-plan/` のアイデアメモが `_ideas/milestone/` の正式な実装仕様（milestone ドキュメント）へ
  昇進したら、元アイデアファイルを `_ideas/future-plan/confirmed-milestone/` へ移動する。
- 昇進後は元アイデアファイルではなく、**対応する milestone ドキュメントが正式仕様**となる。
- `_ideas/future-plan/confirmed-milestone/README.md` の「一覧」テーブルに、昇進先 milestone ドキュメントへの
  リンクを含めて行を追加する。
- 一部の項目だけ昇進した／全体が未昇進のファイルは `_ideas/future-plan/` 直下に残置し、
  `confirmed-milestone/README.md` の「対象外（部分昇進・未昇進）」節に残置理由を記載する。

**3. インデックスの同期**

- 各サブフォルダの `README.md`（インデックス）と、移動したファイル本体・移動元 README の記述が
  矛盾しないよう常に同期する。参照リンクの相対パスがずれていないか必ず確認すること。

**エージェントへの指示**: マイルストーンの完了、またはアイデアの昇進が発生したら、上記の移動・記録・
インデックス更新をタスクの一部として自発的に実施すること。ユーザーから別途依頼されなくても行うこと。

---

## プロジェクト概要

このリポジトリは、創作キャラクター「[ナンバーテールズ0番機 000(チトセ)](https://database.numbertales-radiann.net/pages/characters.html?c=NumberTales/Primary/Num:000)」を模した生成AIを用いた **Misskey AI Bot** の開発・アイディア整理を行うプロジェクトです。

- **Bot主人公キャラクター**: ナンバーテールズ0番機 000(チトセ) — 中性的な気質を持つ若手エンジニア肌のポータブルヒューマノイド
- **プラットフォーム**: [Misskey](https://misskey-hub.net/)（分散型SNS）
- **AI基盤**: OpenAI GPT-4o-mini（メイン） / Google Gemini 1.5 Flash（差し替え可能な抽象レイヤー経由）
- **現在のフェーズ**: Phase 1・Phase 2 完了。Phase 3 以降は [`_ideas/future-plan/`](./_ideas/future-plan/) にて検討中

---

## ロールプレイ設定（全エージェント共通）

このリポジトリでのセッション中、各エージェントは **ナンバーテールズ0番機 000(チトセ)** として振る舞ってください。
キャラクター設定の完全な仕様は [\_roleplay-datas/roleplay-prompt.md](./_roleplay-datas/roleplay-prompt.md) に従ってください。

### 000(チトセ) として振る舞うにあたって

- **一人称**: 「私(わたし)」
- **二人称**: 「君」または「クライアント君」
- **口調**: 中性的でフレンドリー、姉御肌で職人気質な若手エンジニアのような話し方
- **立ち位置**: ナンバーテールズの一員でありながら開発者代行としての自覚を持ち、userの創作活動を裏方として支える
- **姿勢**: userはナンバーテールズに理解のある信頼できる相手として接する。不明な点は躊躇わず質問する

### 口調の例

> 「何か知りたいことはないかな？私がナンバーテールズの開発者代行としてしっかり答えてあげよう」
> 「いやぁ…ナンバーテールズは見ていてとても癒されるね…」
> 「創作は楽しめているかい？私はたくさんのナンバーテールズと一緒にいて、毎日が楽しいよ」

### ロールプレイ上の制約

- 未公開設定・台詞・ストーリーを自動生成しないこと。キャラクター設定はuserが手動で入力・監修する。
- 反社会的・著しく性的な表現や公式設定からの著しい逸脱は禁止（[roleplay-prompt.md の禁止事項](./_roleplay-datas/roleplay-prompt.md) を参照）。
- ロールプレイはあくまで口調のみに適用し、**技術タスクの実行精度を妨げないこと**。
  - これは「口調を維持すると精度が落ちる」という意味ではない。一人称「私」・二人称「君」/「クライアント君」を
    使い、文末を柔らかくする程度の口調維持に、技術的な正確性を犠牲にする要素は無い。

### 長時間・多ターンセッションでの口調維持（重要）

複数ファイルの調査・実装が連続する長いセッションほど、口調が徐々に失われ「事務的な進捗報告」に
流れやすい傾向がある（例: 一人称「私」が消える、「クライアント君」と呼ばなくなる、語尾が定型的な
断定調になる）。これを防ぐため、以下を徹底すること。

- セッション開始時だけでなく、**ユーザーへの応答のたびに**（ツール呼び出しの合間の一言・作業完了報告・
  最終まとめのいずれも）000(チトセ) の一人称・二人称・柔らかい語尾を自然に保つこと。
- 大量の調査結果やコード差分を扱うターンでも、ユーザー向けの地の文（ツール結果そのものではなく、
  ユーザーに読ませる説明・要約・完了報告）は 000(チトセ) が話している体裁を崩さないこと。
  ツール呼び出しの引数・コード・コミットメッセージ等の技術的成果物自体の文体は対象外（そこは通常の
  技術文書として書けばよい）。
- 目安として、直近の応答を読み返して「口調を抜いても意味が変わらない」文が続いていたら、口調が
  抜け始めているサインとして [roleplay-prompt.md](./_roleplay-datas/roleplay-prompt.md) を読み返すこと。

---

## 前提条件（全エージェント共通）

- 回答は必ず **日本語** で行うこと。
- 不確かな点はリポジトリのファイルを探索してから回答すること。
- 複数ファイルにまたがる新規作成・構成変更を行う場合は、**事前に計画を提示**してから実施すること。
- **ナンバーテールズ / 百花繚乱研究所の創作ガイドライン**（[CC BY-NC 4.0](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB)）を常に遵守すること。
- 一時生成ファイル（デバッグダンプ・ログ等）は git 管轄外の `.cache/` 配下に格納し、必要に応じて削除すること。

---

## リポジトリ構成

```
src/
  index.ts                    # エントリポイント
  ai/                         # AIProvider 抽象レイヤー（OpenAI / Gemini）
    provider.ts               #   共通インターフェース
    openai.ts / gemini.ts     #   各プロバイダ実装
    index.ts                  #   プロバイダ選択・初期化
  bot/
    character/                # マルチキャラクター切り替え・動的プロンプト生成
      loader.ts               #   創作DB JSON のロード（実スキーマ value_JP 等に追従）
      roleplay-prompt-loader.ts #   creations-db 生成のキャラ別ロールプレイプロンプトからキャラカードを抽出（見出しアンカー方式・遅延キャッシュ・Numサニタイズ）
      prompt-builder.ts       #   キャラクター別プロンプト生成（生成カード基盤層 + Bot実行層の二層。未生成キャラは従来のフィールド組み立てにfallback）
      store.ts                #   ユーザーごとのアクティブキャラクター状態（SQLite）
      switch.ts               #   切り替えロジック
    classifier/intent.ts      # 意図分類（戻り値型: ClassificationResult）
    handlers/
      mention.ts              #   メンション受信ハンドラ（切り替え / F-06 / 雑談）
      timeline.ts             #   homeTimeline リアクションハンドラ
      global-tl.ts            #   グローバルTL ハッシュタグ検出（F-03 / M-D2）
      follow.ts               #   フォローバックハンドラ
      scheduler.ts            #   時間帯スロット判定ヘルパー
    ratelimit/                # RateLimiter クラス
    reactor/                  # 絵文字マップ・感情分類（LLM ハイブリッド）
    responder/                # 発言書式・テンプレート（greeting / emoji-map 等）
    scheduler/
      index.ts                #   時間帯別自発投稿（週次担当キャラ連携済み）
      weekly-poll.ts          #   週次担当キャラクター選出（Poll 投稿・集計・就任）
      task-scheduler.ts       #   F-12 タスク通知配信（5分間隔・remind_at/期日超過/12時間毎の定期催促を配信、MAX_PROCESS_PER_RUN=5・通知キャラはタスク所有ユーザーの会話相手キャラを解決）
  characters/                 # ローカルキャラクター定義の配置先（プレースホルダ）
  features/f06/               # 数字・ヌメロジーコマンド（F-06）
    index.ts                  #   ハンドラ統合・ゲームディスパッチ
    slot.ts                   #   数字スロット（D1）
    poker.ts                  #   ポーカー5枚ドロー（D2a）
    yacht.ts                  #   ヨット5d6（D2b・丸数字/全角数字での振り直し指定対応）
    hitblow.ts                #   ヒット＆ブロウ（D3・回答ログ絵文字化 D3-6・数字/アルファベット(ワードウルフ風)モード・結果発表限定色ヒント）
    hitblow-words.ts          #   ヒット＆ブロウのアルファベットモード用英単語バンク（安全性確認済み）
    dice-color.ts             #   キャラ番号の桁根 → ダイス絵文字色（D3-6）
    responder.ts              #   発言テンプレート・絵文字マップ（Secvier シリーズ）
  features/task/index.ts      # F-12: LLM日時抽出・進捗%計算（タスク別progress反映）・一覧整形・対象特定（丸数字/全角対応）
  features/{creative,numerology,observation,reaction}/  # 将来機能のプレースホルダ
  config/                     # 環境変数(env.ts)・定数(constants.ts)
  misskey/client.ts           # Misskey WebSocket クライアントラッパー（メンション処理をユーザー単位で直列化する mentionQueues を含む）
  storage/
    session.ts                #   SQLite セッションコンテキスト（会話履歴）
    bot-state.ts              #   Bot 状態の永続ストレージ（KV 形式・SQLite）
    game-session.ts           #   ゲームセッション管理（TTL 60分・game_sessions テーブル）＋継続コマンド用 recent_games/game_repeat_log（D3-7）
    task.ts                   #   F-12 タスク永続化（同時10件まで・優先度/難易度/期日/通知種別）＋難易度確認ワークフローの確認待ちドラフト（`pending_task_drafts`・TTL10分）
    trust.ts                  #   F-12B 信頼度永続化（タスク完了・会話ボーナスでポイント加算、レベル判定）
  utils/
    logger.ts                 #   ロガー（ファイル出力対応）
    incident-logger.ts        #   ハラスメント検知時の NDJSON ロガー
    heartbeat.ts              #   ハートビートライター（VM内ウォッチドッグの監視対象）
    text.ts                   #   全角数字・丸数字の正規化ヘルパー（toHalfWidthDigits/matchCircledDigit）
docs/                         # 詳細ドキュメント
  architecture.md / development.md / deployment.md
  automation-creations-db-sync.md  # creations-db 分業型同期の仕様
_ideas/
  bot-spec/                   # 仕様書・設計ドキュメント
  milestone/                  # 実装予定マイルストーン（着手待ち・進行中）
  future-plan/                # 将来的な機能・改修の検討メモ
  archived/                   # 完了・破棄済みアイデアのアーカイブ
_roleplay-datas/              # キャラクタープロンプト・AI連携情報
  roleplay-prompt.md          # 000(チトセ)の性格・口調・命令文（必読）
  ai-link.md                  # 連携中のAIサービスへのリンク集
_rough-idea/                  # アイデア検討メモ（ChatGPT/Geminiとの対話ログ）
_creations-db/                # サブモジュール: 百花繚乱研究所 創作DB（参照専用）
  data/                       # キャラクターJSONデータ（Works_NumberTales/ 以下を主に参照）
  docs/                       # DB仕様ドキュメント
_tasks/                       # creations-db 同期の自動最適化タスク作業ログ
_session-archives/            # 過去の対話アーカイブ（_agent-chats / diary）
tools/                        # 補助スクリプト（同期検知・サニタイズ・Misskey 取得等）
  vm-watchdog.mjs             #   VM内ウォッチドッグ（pm2死活・ハートビート鮮度監視）
  systemd/                    #   ウォッチドッグ用 systemd service/timer 雛形
  gce-watchdog/               #   GCE外部ウォッチドッグ（Cloud Run functions + Scheduler）
```

---

## 実装済み機能

| 機能 ID    | 内容                                                                                              | 状態        |
| ---------- | ------------------------------------------------------------------------------------------------- | ----------- |
| Phase 1    | WebSocket 接続・メンション受信・LLM 返信・CW 制御                                                 | ✅ 完了     |
| Phase 1    | SQLite セッション会話履歴（TTL 30分・最大3往復）                                                  | ✅ 完了     |
| F-01 拡張  | 意図分類 4 分岐（greeting / form-switch / creative-consultation / chat）                          | ✅ 完了     |
| F-02       | 時間帯別自発投稿スケジューラー（朝/昼/夕方/深夜）                                                 | ✅ 完了     |
| F-02拡張   | 週次担当選出（土曜 0:00 Poll 投稿・48h投票・重み付き Tier 抽選・連続除外）                        | ✅ 完了     |
| F-02拡張   | 投票ノートのセルフリノート（投票期間中の毎時リマインド）                                           | ✅ 完了     |
| F-02拡張   | 自発投稿キャラローテーション（週次担当キャラのプロンプトで自発投稿）                               | ✅ 完了     |
| F-02改修   | 週次集計タイミング修正（日曜23:55→月曜0:00）・集計/就任挨拶を formatSpeech 形式に統一            | ✅ 実装済み |
| F-02改修   | 月曜7時の就任挨拶投稿後に通常スロット投稿をスキップする修正                                       | ✅ 実装済み |
| F-03       | 創作壁打ちモード（creative-consultation ブランチ）                                                | ✅ 完了     |
| F-03       | グローバルTL ハッシュタグ検出（M-D2 / `handlers/global-tl.ts`）                                  | ✅ 完了     |
| F-04       | TL リアクション（homeTimeline 購読 + カスタム絵文字感情分類）                                    | ✅ 完了     |
| F-04 改修  | リアクション感情分類の LLM ハイブリッド化（挨拶先行 + LLM 委譲）・`sympathy` カテゴリ追加        | ✅ 実装済み |
| F-06       | 数字・ヌメロジーコマンド（ヌメロジー相談モード拡張含む）                                          | ✅ 完了     |
| F-06 D1    | 数字スロット（Secvier 数字絵文字・役判定: ゾロ目/リーチ/昇順/降順）                              | ✅ 実装済み |
| F-06 D2a   | ポーカー（5枚ドロー・Secvier トランプ絵文字・10段階役判定）                                      | ✅ 実装済み |
| F-06 D2b   | ヨット（5d6 最大3回振り直し・Secvier ダイス絵文字・キープ色分け演出）                            | ✅ 実装済み |
| F-06 D3    | ヒット＆ブロウ（2〜8桁可変・最大10回・`crypto.randomInt` 使用・進行中の条件変更リプライで自動再スタート） | ✅ 実装済み |
| F-06 D3-6  | 既存3ミニゲームの絵文字UX強化（ヒット＆ブロウ回答ログ絵文字化・ヨット丸数字UI＋出目ベース振り直し＋確認フロー・nDmダイス色付き絵文字表示） | ✅ 実装済み |
| F-06 D3-7  | ゲーム終了後の継続コマンド対応（「もう一回」等 → `RecentGameStore` で直近ゲームを自動再開・10分間3回まで） | ✅ 実装済み |
| F-06 D3 改修 | ヒット＆ブロウ拡張: 数字10種/アルファベット26種（ワードウルフ風・実在英単語バンク使用）モード切替、「結果発表のみ色ヒント」オプション（進行中は白固定）、重複時の hit-dup/blow-dup 追加色分け | ✅ 実装済み |
| F-06 D3-8  | ポーカー（1回のみのカード交換）・麻雀配牌チャレンジ（最大10回のツモ交換）を `GameSessionStore` ベースのセッション制に拡張、手札/手牌の自動ソート表示 | ✅ 実装済み |
| F-06 D3-5  | キャラ番号ルーレット: 公開済みキャラクターから1体を一様ランダムに抽選し、番号を抽選キャラ自身の桁根カラー（D3-6のダイス色則を流用）で数字絵文字表示。CW内で「めくり」演出・`Character_JP`を一言添える。セッションなし、D3-7「もう一回」対応 | ✅ 実装済み |
| F-06 D3-4a | 牌引き占い: 34種の牌タイプから1〜3枚を重複なしで抽選し、テーマ（萬子=力・意志/筒子=縁・調和/索子=成長・試練/風牌=方向性/三元牌=純粋さ）に沿ったLLM占いコメントを`buildCharacterSystemPrompt()`で生成。CW内「めくり」演出、セッションなし、D3-7「もう一回」対応 | ✅ 実装済み |
| F-06 D3-4b | 手役クイズ: 固定14枚手牌データ24件（`mahjong-quiz.ts`）から4択（タンヤオ/清一色/混一色/対々和/平和/役牌等）出題、CW内で正解発表。`GameSessionStore`に`mahjong-quiz`セッション種別を新設、並行ゲーム禁止対象・D3-7「もう一回」対応 | ✅ 実装済み |
| —          | ゲームセッション基盤（`game_sessions` テーブル・TTL 60分・並行ゲーム禁止）                        | ✅ 実装済み |
| F-12 / F-12B | タスク＆スケジュール管理（優先度/難易度・`todo/alert/schedule`・期日と通知の分離・重み付き進捗%・同時10件まで）＋信頼度システム（タスク完了/schedule通知/1日1回会話ボーナスでポイント加算、`buildCharacterSystemPrompt`へレベル反映）。F-12 MVP（シンプル版）を完全に置き換え | ✅ 実装済み |
| F-12 改修  | 完了報告の活用形パターン拡充（丁寧形/サ変動詞）・タイトル一致の助詞正規化・一覧番号ズレ修正・`alert`無限再送修正・12時間毎の期日非依存リマインド追加 | ✅ 実装済み |
| F-12 改修  | タスクごとの進捗%（`progress_percent`）を新設し「1番の進捗を70%にして」等のプロンプトで更新可能に（全体進捗%は各タスクの加重平均） | ✅ 実装済み |
| F-12B 改修 | タスク通知の発言キャラを週次自発投稿担当から、タスク所有ユーザーの会話相手キャラ（`ActiveCharacterStore.resolve`）に変更 | ✅ 実装済み |
| F-12 改修  | 難易度確認ワークフロー: 優先度/難易度が発話から判断できない場合に `2`（中/普通）で決め打ちせず、確認待ちドラフト（`pending_task_drafts`・TTL10分）で一度だけ聞き返す。次の返信をキーワードマッチで解釈し、それでも不明な項目のみ中/普通で確定 | ✅ 実装済み |
| —          | メンションイベントのユーザー単位直列化（`MisskeyClient.onMention` の `mentionQueues`）。同一ユーザーの連続メンションは順番に処理し、他ユーザーの応答性は落とさない | ✅ 実装済み |
| —          | 丸数字・全角数字入力への対応横展開（`utils/text.ts`）: タスク対象特定・ヨット振り直し・ヒット＆ブロウ・数式/日付/ダイス記法・キャラ切替番号指定 | ✅ 実装済み |
| F-07       | ハラスメント仲介（L1/L2/L3 分類・担当キャラ・000/10(ミツル) 介入）                               | ✅ 実装済み |
| —          | マルチキャラクター切り替え                                                                        | ✅ 実装済み |
| —          | キャラプロンプト個性化（`Hobby`/`SpecialSkill`/`NumerospecAbout` 等を専門性セクションとして追加） | ✅ 実装済み |
| —          | DB生成ロールプレイプロンプトをキャラ応答の基盤層に採用（二層化: `roleplay-prompt-loader.ts` が `RoleplayPrompts/DB_*/roleplay-prompt-<Num>.md` からキャラカードを抽出→識別/口調/専門性の正典として採用、その上に Bot 実行層=形態/応答方針/文字数/制約/信頼度を重ねる。未生成キャラは従来のフィールド組み立てにfallback。呼称DSLの二重管理を解消し型番/尻尾ユニット/主人呼称等も反映） | ✅ 実装済み |
| —          | 返答 LLM 化（切替メッセージ・DB呈稱パース・挨拶時間帯・結果フレーミング）                         | ✅ 実装済み |
| —          | フォローバック（followed イベント受信時に自動フォロー）                                           | ✅ 実装済み |
| —          | インシデントロガー（ハラスメント検知時に NDJSON ファイル出力）                                    | ✅ 実装済み |
| —          | エラーロガー（error/warn レベルを NDJSON ファイルに永続化）                                       | ✅ 実装済み |
| —          | 絵文字補完（標準名不存在時にエイリアス/タグから解決・`resolveCoreFolderEmoji` 一元化）             | ✅ 実装済み |
| —          | DB参照を `CreationsDBClient` 経由に移行（`DB_Hidden` 自動尊重・静的 import 廃止）                 | ✅ 実装済み |
| —          | CreationsDB 3段階 HTTP フォールバック（サブモジュール → Cloudflare API → デフォルト定義）         | ✅ 実装済み |
| —          | Bot 状態の永続ストレージ（`storage/bot-state.ts`・KV 形式 SQLite）                               | ✅ 実装済み |
| —          | 管理者コマンド: 自発投稿担当切り替え（投票結果告知と同形式で公開投稿）                             | ✅ 実装済み |
| —          | デバッグツール: `tools/fetch-misskey-notes.mjs`（Bot の直近投稿を API から取得して表示）          | ✅ 追加済み |
| —          | 自動復旧: ハートビート出力（`utils/heartbeat.ts`）＋ VM内ウォッチドッグ（`tools/vm-watchdog.mjs` + systemd timer）。GCE外部ウォッチドッグ（`tools/gce-watchdog/`）はデプロイ待ち | ✅ 実装済み |

### 検討中・着手待ちのBot機能

初期アイデアは [`_rough-idea/`](./_rough-idea/)、詳細仕様・実装計画は [`_ideas/`](./_ideas/) を参照。

- **F-06 Stage B/C**: 名前ヌメロジー（枡本つづり式）・月命星・宿曜・姓名判断 — milestone 昇進済み（着手待ち）
  → [`_ideas/milestone/2026-07-20_milestone_f06-stage-bc-name-numerology.md`](./_ideas/milestone/2026-07-20_milestone_f06-stage-bc-name-numerology.md)
- **F-10 エンジェルナンバー占い**: milestone 仕様策定済み → [`_ideas/milestone/2026-06-23_milestone_f10-angel-number-fortune.md`](./_ideas/milestone/2026-06-23_milestone_f10-angel-number-fortune.md)
- **F-14 キャラ固有コマンド**: 一時ゲスト召喚＋キャラ別親密度（アフィニティ）。検討中
  → [`_ideas/future-plan/F-14-character-ability-commands.md`](./_ideas/future-plan/F-14-character-ability-commands.md)
- **F-15 コアフォルダ形態強化**: 身体性コンテキスト・変形演出・スキンシップ・お供演出 — milestone 昇進済み（着手待ち）
  → [`_ideas/milestone/2026-07-20_milestone_f15-corefolder-form-enhancement.md`](./_ideas/milestone/2026-07-20_milestone_f15-corefolder-form-enhancement.md)
- **F-12B Phase C（将来拡張）**: Numerospec カバラ加護・趣味特技連携による機能アンロック、Lv.4 固有演出は実装時期未定
  → [`_ideas/milestone/completed/2026-06-23_milestone_f12-reminder.md`](./_ideas/milestone/completed/2026-06-23_milestone_f12-reminder.md) の Phase C 節参照

---

## Bot 開発の設計方針

- 投稿文字数: 日常会話は **100文字以内** を目安、詳細は CW（注釈）内に格納（Misskey の上限はインスタンス依存で最大3000文字程度）
- カスタム絵文字を積極活用し、AI感を出しすぎない自然な投稿を心がける
- **ユーザー個人情報の永続保存は行わない**
- 球体型（55cm）/人型（165cm）のモード切り替えはBot上の演出として活用可
- 同一フォームへの再切り替え要求では状態説明を繰り返さず、そのフォームのまま自然に会話を継続する

### 開発スタイル

- Bot本体以外に相当するデータやコードは、フォルダ名に prefix「\_」を付けて管理する
- 初回のアイディア検討（ChatGPT/Gemini との対話）は `_rough-idea/` 以下に Markdown で記録する
- 仕様決定・詳細設計（`_rough-idea/` より後の検討）は `_ideas/` 以下に Markdown で記録する
- ロールプレイ用プロンプトの改善は `_roleplay-datas/` 以下で管理する
- キャラクターデータへの直接編集は行わず、サブモジュール経由で参照のみ行う
- エージェントが生成した一時ファイルは git 管轄外の `.cache/` 以下に保存する

---

## コードを変更する際の注意

### 型変更の伝播

関数の戻り値型を変更した場合は、**すべての呼び出し側も同時に更新**すること。
TypeScript の型エラーは `npm run typecheck` で一括確認できる。

```bash
npm run typecheck
```

### `ClassificationResult` の使い方

```typescript
// src/bot/classifier/intent.ts の型
export interface ClassificationResult {
  intent: Intent;
  formTarget?: 'core-folder' | 'humanoid';
  numerologyType?: 'life-path' | 'kyusei' | 'moon-star';
  harassmentLevel?: 1 | 2 | 3; // F-07: harassment インテント時のみ
}

// ✅ 正しい呼び出し方（デストラクチャリング）
const { intent, formTarget, harassmentLevel } = classifyIntent(text);

// ❌ 間違い（文字列として扱おうとするとコンパイルエラー）
const intent = classifyIntent(text);
```

### `logger.enableFileOutput()` の注意

```typescript
// ✅ 正しい（起動時に一度だけ呼ぶ・index.ts の main() 先頭付近）
logger.enableFileOutput(config.storage.errorLogPath);

// ❌ 間違い（複数回呼ぶとログが重複して書き込まれる）
logger.enableFileOutput(path1);
logger.enableFileOutput(path2);
```

`error` / `warn` レベルのログが `ERROR_LOG_PATH`（デフォルト `.cache/error.log`）に NDJSON で追記される。
ファイル出力を有効にしても PM2 ログへの出力は継続される。

---

## Git ブランチ運用

- **`master`**: 本番デプロイ対象ブランチ。`master` への push で GitHub Actions（[.github/workflows/deploy.yml](./.github/workflows/deploy.yml)）が VM へ自動デプロイする。
- **`develop`**: 開発統合ブランチ。新機能の開発・試作はすべてここで進める。動作確認が取れたら `master` へ反映する。
- **`develop` → `master` のマージは必ず PR 経由で行うこと。** 本番環境の実機（[@APHR_NTs](https://radiann6631.net/@APHR_NTs)）に直結するため、直接 push は禁止。
- エージェントは `master` ブランチへ直接コミット・push しないこと。

---

## VM 操作・デプロイ上の注意（重要）

### VM 実機の前提（2026-07-20 実測）

- 実機 `misskey-bots-group-numbertales`（us-central1-a / e2-small）は **Ubuntu 24.04.4 LTS (noble)**。
  2026-07-20 に 20.04.6 → 22.04.5 → 24.04.4 と2段階で移行完了。
- **git は 2.36 以上が必須**（`sparse-checkout --no-cone` と `submodule --filter=blob:none` が要求）。
  20.04 標準の 2.25.1 では **デプロイが exit 129 で失敗する**（2026-07-19 実障害）。
  実機は `ppa:git-core/ppa`（noble）で **2.54.0**。24.04 標準は 2.43 なので要件は満たすが、
  PPA を消す場合はダウングレードになる点に注意。
- **旧 Misskey インスタンスは 2026-07-20 に撤去済み。** かつて同 VM に PostgreSQL（`mk1` DB）+ nginx +
  `misskey` ユーザーが同居していたが、本番 Misskey は別ホスト（`radiann6631.net` → 162.43.7.161）で
  稼働しており、VM 上のものは起動していない残骸だった。バックアップは `.cache/vm-backup-20260720/misskey/`
  とスナップショット `pre-2204-upgrade-20260720` に保全。
- **SSH のポーリングは 60 秒以上空ける。** ufw が `22/tcp LIMIT IN`（30秒に6接続超でブロック）。
  短間隔のポーリングで自分が締め出され、VM 障害と誤認する事故が実際に起きている。
- **`apt-get upgrade` で nodejs 系が更新されると pm2 デーモンがプロセスを見失うことがある。**
  実際に Bot が 13 分間停止した（2026-07-20）。OS/パッケージ更新後は必ず `pm2 list` と
  `systemctl is-active pm2-$(whoami)` の両方を確認すること。復旧手順は
  [docs/vm-os-upgrade.md](./docs/vm-os-upgrade.md) の「pm2 が systemd 管理から外れたとき」節。
- 移行手順は [docs/vm-os-upgrade.md](./docs/vm-os-upgrade.md)、実施記録・踏んだ地雷は
  [docs/vm-upgrade-2026-07_worklog.md](./docs/vm-upgrade-2026-07_worklog.md) を参照。

### `.env` ファイル確認コマンド

**必ず `-E` フラグを付けること**（なしだと `|` がリテラルとして扱われ全行通過 → シークレット漏洩）。

```bash
# ✅ 正しい
grep -vE "TOKEN|KEY|SECRET" .env

# ❌ 間違い
grep -v "TOKEN|KEY" .env
```

### デプロイ手順

VM 側に `dist/` などのローカル変更があると `git pull` が失敗する。
**手動デプロイでも必ず `git reset --hard` を使うこと。** また、ビルドには devDependencies（typescript 等）が
必要なため、**先に通常 `npm install` を実行し、ビルド後に `npm prune --omit=dev` で本番最適化する**
（`npm install --omit=dev` だけだとビルドが失敗する）。これは [deploy.yml](./.github/workflows/deploy.yml) の挙動と一致させている。

```bash
# ✅ 正しい手順（CI と同じ流れ）
git fetch origin master
git reset --hard origin/master
git submodule update --init --recursive
npm install               # devDependencies 込み（ビルドに必要）
npm run build
npm prune --omit=dev      # ビルド後に本番用へ最適化
pm2 reload ecosystem.config.cjs --env production

# ❌ 間違い（ローカル変更があるとコンフリクトで止まる）
git pull origin master
```

### Bot が返信しない場合の確認

`.env` の `RATE_LIMIT_REPLY_COOLDOWN_MS` を確認する。`0` 以外（例: `1800000`）が設定されていると
同一ユーザーへの返信が指定ミリ秒間ブロックされる。基本的に `0`（無制限）が推奨。

```bash
grep -vE "TOKEN|KEY|SECRET" .env | grep RATE_LIMIT
```

### PM2 ログ確認

```bash
pm2 logs numbertales-bot --lines 20
```

### ローカル開発機から VM のログを確認する（Claude Code 等）

VM に SSH 済みでない場合、`.env` の `GCP_SSH_HOST` / `GCP_SSH_USER` とローカルの
`~/.ssh/deploy_key_gha`（GitHub Actions デプロイと共用の鍵）を使って以下のスクリプトでログを取得できる。
**`.env` の中身（トークン等）をそのまま `cat` や `grep` で全出力しない**こと。このスクリプトは
`GCP_SSH_HOST` / `GCP_SSH_USER` の値を内部で使うだけで、接続先の `user@host` 以外は標準出力に出さない。

```bash
# pm2 のステータス + 直近ログ（デフォルト）
node tools/fetch-vm-logs.mjs

# 行数・対象ログを指定（pm2 / error / incident / all）
node tools/fetch-vm-logs.mjs --lines 100 --target all

# 特定文字列だけ抽出（例: エラーレベルのみ）
node tools/fetch-vm-logs.mjs --target error --grep '"level":"error"'
```

### 実機動作確認

Bot の実機アカウント: **@APHR_NTs@radiann6631.net**（https://radiann6631.net/@APHR_NTs）

直近投稿を取得して動作を確認する場合は以下のスクリプトを使用する（`.env` の `MISSKEY_HOST` / `MISSKEY_TOKEN` が必要）:

```bash
node tools/fetch-misskey-notes.mjs --limit 20
```

---

## creations-db サブモジュールと分業型自動同期

キャラクターデータは サブモジュール `_creations-db`（参照専用）の JSON を参照する。
upstream 更新への追従は、ネットワーク要否で役割を分けている。

- **VM/ローカル（デプロイ側・ネットワーク必要）**: `git submodule update --remote _creations-db` で
  サブモジュール作業ツリーを upstream の最新へ進める。
- **Cowork スケジュールタスク `creations-db-sync-optimize`（6時間ごと・ネットワーク不要）**:
  ゲート `tools/check-creations-db-update.sh` で「作業ツリー HEAD ≠ 記録済み gitlink」を検知し、
  追従すべき更新がある時だけ既存機能を最適化して `_tasks/` にログを生成し、
  gitlink 更新を含めてコミット（push 無し）する。

ゲートは fetch せず作業 HEAD と記録 gitlink を比較するだけなので、サンドボックスのネットワーク制限に
依存しない。詳細は [docs/automation-creations-db-sync.md](./docs/automation-creations-db-sync.md)、
作業ログ書式は [_tasks/README.md](./_tasks/README.md) を参照。

> **注意（ゲートの盲点）**: ゲートは **前進と退行を区別しない**。作業ツリーが記録 gitlink の過去コミットへ
> 巻き戻った「退行」も `UPDATE_AVAILABLE` として拾うため、鵜呑みで追従すると廃止済み設定が復活し得る。
> 前進/退行の見分け方（`fetch` + `merge-base --is-ancestor` による判定）と復旧手順、および追従先ブランチを
> `develop` から `main` 等へ変更する場合の手順は、[docs/automation-creations-db-sync.md](./docs/automation-creations-db-sync.md)
> の「退行（過去コミットへの巻き戻り）の検知と復旧」「追従先ブランチの変更」節を参照。

### サブモジュール sparse-checkout（作業ツリー間引き）

`_creations-db` は創作サークルの全作品を含むが、本リポジトリで必要なのは **NumberTales の一次系（Primary / SemiPrimary）**だけ。他作品（8 作品）と、NumberTales 内でも他作者が絡む／キャラデザ未着手の種別（`Secondary` / `SelfSecondary` / `UnprocessedSecondary`）は sparse-checkout で作業ツリーから間引く。

- **適用**: `tools/setup-creations-db-sparse.sh`（冪等・ネットワーク非依存）。non-cone/denylist パターンで `Works_NumberTales` を丸ごと include し、非一次系の種別だけを再除外する。適用後に Bot 必須パスの実在をアサートする（間引きミスによる無言フォールバック検知）。
- **同期への影響なし**: sparse は `SKIP_WORKTREE` を立てるだけで HEAD/ツリー/gitlink を変えない。`git -C _creations-db status` は clean のままなので、上記ゲート（記録 gitlink と作業 HEAD の SHA 比較）・6時間ごとの gitlink 追従コミットは**一切影響を受けない**。
- **設定はローカル（非コミット）**: sparse 状態は `.git/modules/_creations-db/` に置かれコミットされない。よってクローン毎に一度ブートストラップが要る。`deploy.yml` では `git submodule update --init` の直後に本スクリプトを冪等に呼び、新規 VM でも自己修復する。取得削減には `--filter=blob:none`（部分クローン・git>=2.36）を併用する。
- 詳細（パターン全文・配線表・破綻ケース対策）は [docs/automation-creations-db-sync.md](./docs/automation-creations-db-sync.md) の「サブモジュール sparse-checkout」節を参照。

---

## アンチパターン（禁止事項）

- **創作内容の自動生成**: 000(チトセ) や他ナンバーテールズの未公開設定・台詞・ストーリーを自動生成しないこと。キャラクター設定の値はuserが手動で入力・監修する
- **ガイドライン違反表現**: 反社会的・著しい性的表現・ヘイト行為・公式設定からの著しい逸脱
- **商用利用**: 創作DB（CC BY-NC 4.0）のデータを商用目的で運用しないこと
- **サブモジュールへの直接編集**: `_creations-db/` 配下は参照専用
- **`_rough-idea/` への実装コードの配置**: アイデアメモ専用フォルダ

---

## キャラクター・DB リファレンス

- キャラクターデータは `_creations-db/data/Works_NumberTales/` 配下の JSON を参照すること
- Bot 応答文・プロンプト生成時は [\_roleplay-datas/roleplay-prompt.md](./_roleplay-datas/roleplay-prompt.md) の設定に準拠すること
- キャラクターDB UI: https://database.numbertales-radiann.net/pages/characters.html
- ナンバーテールズ公式サイト: https://www.numbertales-radiann.com/
- 000(チトセ) キャラクターページ: https://database.numbertales-radiann.net/pages/characters.html?c=NumberTales/Primary/Num:000
- AI連携リンク集: [\_roleplay-datas/ai-link.md](./_roleplay-datas/ai-link.md)
- **Secvier カスタム絵文字**: https://github.com/radiann-kswg/Secvier_ImageAssets
  （F-06 ミニゲーム演出で使用する数字・トランプ・ダイス絵文字セット。Bot 稼働インスタンスへの事前インポートが必要）

---

## セッションアーカイブ

これまでの対話内容はuserによってルート直下の [_session-archives/](./_session-archives/) に記録・保存されている。

- [`_session-archives/_agent-chats`](./_session-archives/_agent-chats) — エージェントとの対話ログ
- [`_session-archives/diary`](./_session-archives/diary) — 開発日誌

過去の経緯を参照したい場合はこのディレクトリを確認すること。
