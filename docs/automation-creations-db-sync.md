# 自動化: creations-db 同期・最適化タスク（分業型）

サブモジュール [`_creations-db`](../_creations-db)（百花繚乱研究所 創作DB / 参照専用）に
upstream 更新があった時、リポジトリ内の既存機能を自動で追従・最適化するための仕組み。

Cowork の実行サンドボックスは外部ネットワークがブロックされているため、
**ネットワークが必要な fetch 系は VM/ローカルのデプロイ側**で行い、
**ネットワーク不要な最適化・ログ・コミットは Cowork のスケジュールタスク**が行う、という分業型で構成している。

## 役割分担

| 担当 | 処理 | ネットワーク |
| --- | --- | --- |
| VM/ローカル（デプロイ手順の一部） | `git submodule update --remote _creations-db` で作業ツリーを最新化 | 必要 |
| Cowork スケジュールタスク `creations-db-sync-optimize` | 追従待ち更新の検知 → 既存機能の最適化 → ログ生成 → コミット（push 無し） | 不要 |

## 構成要素

| 要素 | 役割 |
| --- | --- |
| `tools/check-creations-db-update.sh` | サブモジュール作業ツリー HEAD と、スーパープロジェクトが記録済みの gitlink を比較する**ネットワーク非依存**のゲート |
| スケジュールタスク `creations-db-sync-optimize` | 6時間ごと（cron `0 */6 * * *`）にゲートを実行し、追従待ち更新がある時だけ本処理を走らせる |
| `_tasks/` | 最適化作業ログの出力先（[_tasks/README.md](../_tasks/README.md)） |

## ゲートスクリプトの判定（ネットワーク非依存）

`tools/check-creations-db-update.sh` は fetch を行わず、以下を比較するだけ。

- 作業ツリー HEAD: `git -C _creations-db rev-parse HEAD`
- 記録済み gitlink: `git rev-parse HEAD:_creations-db`

| exit code | stdout | 意味 |
| --- | --- | --- |
| `0` | `UPDATE_AVAILABLE <recorded>..<working>` | 追従すべき更新あり → 本処理を実行 |
| `10` | `UP_TO_DATE <sha>` | 記録済みと一致 → 何もしない |
| `1` | `ERROR: ...` | エラー（サブモジュール未初期化等） |

手動確認:

```bash
bash tools/check-creations-db-update.sh
```

最適化コミットで gitlink が作業 HEAD に追いつくため、コミット後は `UP_TO_DATE` に戻る。

## 自動実行フロー（Cowork タスク側）

1. ゲートスクリプトで「作業ツリー HEAD ≠ 記録済み gitlink」を判定。
2. 追従すべき更新がある場合のみ以下を実行（いずれもネットワーク不要・ローカル完結）:
   1. 差分を把握: `git -C _creations-db log --oneline <recorded>..<working>` / `diff --stat` / `CHANGELOG.md`。
   2. 影響を受けるリポジトリ側の機能（例: `src/bot/character/loader.ts` のフィールドマッピング、
      `src/features/f06/` のヌメロジー参照など）を最適化。
   3. `npm run typecheck` で型整合を確認。
   4. `_tasks/YYYY-MM-DD-HHmm-creations-db-sync.md` に作業ログを生成。
   5. 関連ドキュメントを整理。
   6. コード・ドキュメント・ログ・`_creations-db` のポインタ更新をステージして `git commit`（**push しない**）。

## VM/ローカル側のデプロイ手順への組み込み

サブモジュールの最新化（fetch 相当）はデプロイ時に実行する。CLAUDE.md のデプロイ手順に含まれる
`git submodule update --init --recursive` を、最新追従する場合は次のように行う:

```bash
git fetch origin master
git reset --hard origin/master
git submodule update --remote _creations-db   # ← 作業ツリーを upstream develop の最新へ進める
npm install --omit=dev
npm run build
pm2 reload ecosystem.config.cjs
```

これで作業ツリー HEAD が進み、次回（最大6時間後）の Cowork タスクが追従コミットを生成する。

## 退行（過去コミットへの巻き戻り）の検知と復旧

**ゲートの盲点（重要）**: `tools/check-creations-db-update.sh` は「作業ツリー HEAD ≠ 記録済み gitlink」で
`UPDATE_AVAILABLE` を返すが、これは **前進（追従すべき更新）と退行（作業ツリーが記録 gitlink の過去コミットへ
巻き戻っている状態）を区別しない**。退行状態のまま「いつもの追従」を回すと、廃止済みフィールドが復活するなど、
以前の追従作業がまるごと巻き戻る。

> 実例（2026-07-15）: 作業ツリーが `develop` の過去コミット `7d44e5bd`（記録 gitlink `f78cfdbc` の **47 コミット前の
> 祖先**）へ退行していた。原因はサブモジュール内のローカル `develop` ブランチ参照が過去で止まっていたこと。
> `f78cfdbc` は 7/11 に `NumberMarkLocation` / `IdentityMotif` を廃止（`AppearanceDetail` へ一本化）済みで、
> 退行版 `7d44e5bd` はそれらをまだ持っていた。ゲートの `UPDATE_AVAILABLE` を鵜呑みにしていたら、廃止対応が巻き戻っていた。

### 前進か退行かの見分け方

- **commit date や SHA の登場順を信用しない**。サブモジュールは grafted 状態のことがあり、`fetch` 前は
  `git log A..B` も ancestry も追えず、upstream が rebase 運用だと commit date も当てにならない。
- ネットワークが使える環境（VM/ローカル）で `fetch` してから ancestry で判定する:

```bash
git -C _creations-db fetch origin develop
git -C _creations-db rev-parse origin/develop        # upstream の真の最新 HEAD
WORK=$(git -C _creations-db rev-parse HEAD)           # 作業ツリー HEAD
REC=$(git rev-parse HEAD:_creations-db)               # 記録済み gitlink
# 作業ツリー HEAD が記録 gitlink の「祖先」なら退行
git -C _creations-db merge-base --is-ancestor "$WORK" "$REC" && echo "REGRESSION(退行)" || echo "前進 or 分岐"
```

- `CHANGELOG.md` の見出し（`### ...`）の包含関係も有効な判定材料（新しい側は古い側の全エントリを含む）。

### 退行時の復旧手順

```bash
git -C _creations-db fetch origin develop
git -C _creations-db checkout develop
git -C _creations-db merge --ff-only origin/develop   # develop ブランチ自体を最新へ ff 前進
git submodule status _creations-db                     # 先頭の '+' が消えれば gitlink と一致
bash tools/check-creations-db-update.sh                # UP_TO_DATE を確認
```

- **detached HEAD で置かず、ローカル `develop` ブランチ自体を ff 前進させる**こと。これで参照が過去で止まる
  退行の再発を防げる（`git submodule update --remote` だけだと detached HEAD になり、ローカル develop が古いまま残る）。
- gitlink が既に正しく作業ツリーだけ退行していた場合、復旧後にスーパープロジェクト側の差分は出ない＝**コミット不要**。
- **改善余地**: ゲートに「作業 HEAD が記録 gitlink の祖先なら `REGRESSION` として弾く」判定を足せば、この取り違えを
  自動で防げる（未実装・要検討）。

## 注意

- サブモジュール `_creations-db` は **参照専用**。サブモジュール内のファイルは直接編集しない。
- 創作内容（未公開設定・台詞・ストーリー）の自動生成は行わない。最適化はコード側の追従に限定する。
- スケジュールタスクはアプリ起動中に実行される。起動していなかった場合は次回起動時に実行される。
- ゲートはネットワークを使わないため、サンドボックスの許可リスト設定に依存しない。

## スケジュール変更

頻度やプロンプトを変えたい場合は、スケジュールタスク `creations-db-sync-optimize` を更新する。

## 追従先ブランチの変更（例: `develop` → `main`）

現状の追従先は `develop`（`.gitmodules` の `submodule._creations-db.branch`）。upstream 側に安定版ブランチ
（例: `main`）を新設し、Bot が参照する追従先をそちらへ切り替える構想がある。`develop` は rebase/force-push
運用で grafted・退行トラブルが起きやすいため、**マージのみ・rebase しない安定ブランチを追従先にすると
サブモジュール運用は堅牢になる**。切り替える場合は以下の順で行う。

### 前提の確認（切り替え前に必須）

1. **追従先ブランチが upstream に実在すること**を確認する。

   ```bash
   git -C _creations-db ls-remote --heads origin   # 目的のブランチ名が heads に出るか
   ```

   > 2026-07-15 時点では `develop` と `addon-ai-tag` のみで、`main`/`master` は未作成。追従先が存在しない
   > ブランチへは切り替えられないため、先に upstream 側で当該ブランチを公開してもらう。

2. **新ブランチが現行 `develop` の最新スキーマを内包すること**を確認する。内包しないと Bot 側コードと
   データのスキーマがずれ、[退行の検知と復旧](#退行過去コミットへの巻き戻りの検知と復旧) と同種の
   食い違いが発生する。

   ```bash
   git -C _creations-db fetch origin <新branch>
   git -C _creations-db merge-base --is-ancestor $(git -C _creations-db rev-parse develop) origin/<新branch> \
     && echo "OK: 新ブランチは develop 最新を内包" || echo "NG: スキーマずれの恐れ"
   ```

### 切り替え作業

1. `.gitmodules` の `submodule._creations-db.branch` を新ブランチ名へ変更する。
2. `git submodule update --remote _creations-db` で作業ツリーを新ブランチ HEAD へ進め、gitlink 再設定を
   **Bot リポジトリの `develop` ブランチ上でコミット → PR で `master`**（Git ブランチ運用に従う。`master` 直 push 禁止）。
3. 本ドキュメントと `AGENTS.md` の「creations-db」節・デプロイ手順内の branch 名記述を新ブランチ名へ更新する
   （SSOT は `AGENTS.md`。`CLAUDE.md` は薄い設定書なので原則触らない）。
4. ゲート `tools/check-creations-db-update.sh` は作業 HEAD と記録 gitlink を比較するだけの**ブランチ非依存**
   設計につき、追従先が変わっても**変更不要**。
