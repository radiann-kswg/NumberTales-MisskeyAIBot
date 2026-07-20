# VM 作業記録 — git アップグレードと OS 移行（2026-07-20）

> 種別: 実作業記録（VM 実機への変更を伴う）
> 実施日: 2026-07-20
> 対象: GCP VM `misskey-bots-group-numbertales`（`numbertales-misskey-surver` / us-central1-a / e2-small）
> 関連: [deployment.md](./deployment.md) / [vm-os-upgrade.md](./vm-os-upgrade.md)

---

## 1. 結論（先出し）

| 項目 | 結果 |
| --- | --- |
| **デプロイ失敗（2026-07-19 `fc9fa60`）** | ✅ **解決**。原因は VM の git 2.25.1。CI 緑化を確認 |
| **OS 20.04 → 22.04 → 24.04** | ✅ **完了**（Ubuntu 24.04.4 LTS） |
| **旧 Misskey インスタンス** | ✅ **撤去**（未稼働の残骸と判明。バックアップ保全済み） |
| Bot | ✅ 稼働（ただし作業中に **13 分間の停止**が1度発生。§6-4） |

**最終状態**: Ubuntu 24.04.4 LTS / git 2.54.0 / Node.js v22.23.1 / `dpkg --audit` クリーン /
更新待ち 0 / pm2 systemd 管理下で online / CI **success（24s）**。

**最大の収穫は「この VM に旧 Misskey が同居していた」と判明したこと。** 詳細は §4・§5。

---

## 2. デプロイ失敗の原因と解決

### 2-1. 原因

2026-07-19 の `fc9fa60`（PR #25）で `Deploy to GCP VM` が **exit 129** で失敗していた。
ジョブが十数秒で落ちるため SSH 接続失敗に見えたが、実ログ（`gh run view --log-failed`）に明確な証拠があった。

```
git submodule update --init --recursive --filter=blob:none
  → usage: git submodule ...          (--filter 非対応 → || フォールバックで生存)
git sparse-checkout set --no-cone --stdin
  → usage: git sparse-checkout (init|list|set|disable) <options>
  → Process exited with status 129    ← ここで終了
```

VM の git が **2.25.1**（Ubuntu 20.04 標準）で、`--no-cone`（2.36+）・`reapply`（2.27+）・
`--filter=blob:none`（2.36+）のいずれにも非対応だった。

> **教訓**: 事前の推測（「SSH 接続失敗か Secrets 失効が濃厚」）は外れていた。
> `gh run view <run-id> --log-failed` で**実ログを読めば 1 分で判明する**話だった。推測で切り分けない。

### 2-2. 解決

`ppa:git-core/ppa` から **git 2.25.1 → 2.50.1** へ更新。Bot 無停止。

検証は3段階で行った。

1. 失敗していた2コマンドを VM 上で直接実行 → 両方成功
2. `--no-cone` を実際に叩く **APPLIED パス**を、本番に触れず `/tmp` の使い捨てリポジトリで再現検証
   （本番の sparse 解除は影響が読めないため実施せず）
3. CI 再実行（`gh run rerun 29666284136`）→ **success**

> **事前計画書の棚卸し（2026-07-20）**: 本インシデントの対応手順は当初
> `docs/2026-07-20_vm-git-upgrade-runbook.md` として別途作成されていた（git 未追跡）。
> 全手順の実施完了に伴い本記録へ集約し、未収録だったロールバック手順
> （`ppa-purge` で標準版へ戻す）のみ [vm-os-upgrade.md](./vm-os-upgrade.md) §4 へ移設して削除した。
> なお同ランブックは必要バージョンを「2.35+」と記していたが、**正しくは 2.36+**
> （実測では 2.25.1 で失敗・2.50.1 で成功しており、安全側の 2.36 を採用）。

---

## 3. OS アップグレード 20.04 → 22.04

### 3-1. 事前準備

- ディスクスナップショット `pre-2204-upgrade-20260720`（READY / 256GB / 実データ 30GB）
- `.env` と `.cache/session.db` をローカルへ退避（後にリポジトリ外の `_backups/` へ移設。§8-3）
- 空だった root 所有の `~/.git`（コミット0件・追跡0件）を `~/.git.bak-20260720` へ退避

### 3-2. 最初の失敗 — node-* による依存破綻

`do-release-upgrade` が約30秒で abort。

```
ERROR Could not calculate the upgrade
ERROR Dist-upgrade failed: 'E:Error, pkgProblemResolver::Resolve generated breaks'
# apt.log: Broken node-yargs Depends on node-escalade < none @un H >
```

distro 由来の `node-*` が **275 個**入っており、`node-escalade` が jammy に存在しないため破綻。
**当初 git-core PPA を疑ったが無罪だった**（apt.log が明確に否定）。

孤立パッケージ **384 個**を `autoremove --purge` して解決。
`git` / `nodejs` / `docker-ce` / `openssh-server` が対象外であることを事前に実測確認した。

> `apt-get -s autoremove | grep git` は `gyp [0.1+20180428git4d467626-3ubuntu1]` の
> バージョン文字列に誤マッチする。判定は必ず `grep "^Remv "` で行うこと。

### 3-3. 二度目で成功、ただし孤児化

パッケージ適用は完走したが、**tmux 自体が更新対象に含まれていたため tmux サーバーが落ち**、
`do-release-upgrade` が端末を失って `confirmRestart()` で停止した。
パッケージ処理は完了済み（`Processing triggers` まで到達）だったため実害はなく、手動 `reboot` で復旧。

### 3-4. 結果

Ubuntu 22.04.5 LTS。以下すべて確認済み。

| 検証項目 | 結果 |
| --- | --- |
| git | **2.50.1 維持**（PPA が生き残ったため再有効化不要。22.04 標準の 2.34 なら要件割れだった） |
| node | v22.23.1 維持 |
| Bot | online / `wsConnected: true` / pm2 `startup` により再起動後 **↺ 0** で自動復帰 |
| apt sources | 有効行は jammy のみ（focal 残留なし） |
| デプロイ経路 | `submodule --filter=blob:none` OK / `setup-creations-db-sparse.sh` exit 0 |
| CI | `gh run rerun` → **success（24s）** |

---

## 4. 【重要】VM に Misskey 本体が同居していると判明

24.04 への移行を試みた際、`postgresql-15` の削除拒否で中断した。調査の結果、
**この VM は Bot 専用サーバーではなく、Misskey インスタンス本体が同居している**ことが判明した。

| 稼働中 | 実体 |
| --- | --- |
| Misskey | PostgreSQL の **`mk1` DB（87M）** + nginx（80/443 listen） + `misskey` ユーザー（systemd --user） |
| Bot | pm2 `numbertales-bot`（SQLite `.cache/session.db`） |

`postgresql-15` は **手動インストール**（`apt-mark showmanual` に出る）、PGDG 公式リポジトリ由来。

> **`postgresql` / `nginx` を停止・削除してはならない。** Bot 自身は SQLite しか使わないため
> 「PostgreSQL は不要」と誤判断しやすいが、**同居する Misskey の本番データが入っている。**

---

## 5. 旧 Misskey の撤去と 24.04 完走

### 5-1. 24.04 が一度中断した

```
ERROR Dist-upgrade failed: 'The package 'postgresql-15' is marked for removal
  but it is in the removal deny list.
```

24.04 の標準 PostgreSQL は 16 のため 15 が削除対象になるが、deny list が拒否して依存計算が破綻した。
**保護機構が正しく働いた結果であり、回避せず原因を調べたのが正解だった。**

### 5-2. 調査 — 本番 Misskey は別ホストだった

「かつて GCE で Misskey を動かそうとした名残」というオーナーの認識を、消す前に裏取りした。

| 調査項目 | 結果 |
| --- | --- |
| `radiann6631.net` の DNS | **162.43.7.161** ← この VM（136.115.125.64）ではない |
| nginx の `server_name` | `misskey.numbertales-radiann.net`（別ドメイン） |
| Misskey アプリ | **未稼働**（port 3000 に何もいない / systemd サービスなし / アプリディレクトリなし） |
| `misskey` ユーザー | `systemd --user` と `sd-pam` のみ。実体なし |
| nginx アクセスログ | **インターネットからの脆弱性スキャンのみ**（`/cgi-bin/index2.asp`・`/SDK/webLanguage` 等） |

**未稼働の残骸が 80/443 を開けたまま、攻撃対象面を広げていた**状態だった。

### 5-3. 撤去

バックアップを取得・整合性確認してから、段階的に（停止 → 確認 → 削除）実施した。

- **保全**: `mk1_20260720.sql.gz`（`CREATE TABLE` 107件・gzip 検証済み）/ `pg_roles_20260720.sql` /
  `nginx-conf_20260720.tar.gz` をリポジトリ外
  `_backups/NumberTales-MisskeyAIBot/2026-07-20_vm-misskey-removal/` へ（README 付き）。
  スナップショット `pre-2204-upgrade-20260720` にも当時の全状態が含まれる
- **削除**: `nginx` / `postgresql-15` ほか6パッケージ + 孤立22件、`mk1` DB とクラスタ、
  `/var/lib/postgresql` `/etc/postgresql` `/var/log/postgresql` `/var/www`、`misskey` ユーザー

副次効果として **80/443/5432 が閉じ**、**24.04 のブロッカーが解消**し、
e2-small（メモリ 2GB）から不要な常駐が消えた。

### 5-4. 24.04 完走

ブロッカー解消後に再実行し、Ubuntu **24.04.4 LTS** へ到達。
ただし設定フェーズが途中で止まっており、**修復が必要だった**（§6-5）。

---

## 6. 踏んだ地雷（再発防止）

### 6-1. `pkill -f` を SSH 越しに使って自分を切断した

`sudo pkill -f "release-upgrader-sshd"` で**自分の SSH セッションごと落ちた**。
`pkill -f` はコマンドライン全体にマッチするため、SSH で送った文字列がリモート側シェルの
コマンドラインに現れ、**パターンが自分自身にマッチする**。掃除は PID 指定で行う。

同じ理由で **`pgrep -f` も自己マッチする**。`[d]o-release-upgrade` のブラケットトリックも、
パターン文字列自体がコマンドラインに含まれるため無効。変数展開で回避する。

```bash
P="do-release"; pgrep -f "${P}-upgrade"   # 親シェルには ${P}-upgrade としか出ない
```

### 6-2. ufw のレート制限を自分で踏んで締め出された

この VM は `22/tcp LIMIT IN`（`ufw limit ssh`）が有効で、**30秒に6接続超でブロック**される。
15秒間隔の監視スクリプトでこれを踏み、しかも**監視ループが接続を試み続けるためブロックが解除されず**、
ループを止めるまで回復しなかった。

VM は正常稼働していたのに SSH だけ不通になるため**サーバー障害と誤認しやすい**。
GCE シリアルコンソール（`gcloud compute instances get-serial-port-output`）で
`[UFW LIMIT BLOCK] ... DPT=22` を見つけて自己原因と判明した。**SSH ポーリングは60秒以上空ける。**

### 6-3. 監視スクリプトの設計ミス4件

| # | 内容 | 結果 |
| --- | --- | --- |
| 1 | 終了条件を「成功（jammy 到達）」だけで組んだ | abort による即時終了を検出できず、**13分間「実行中」と誤認**。ログサイズ 0 で気づいた |
| 2 | 状態キーに `uptime` を含めた | 毎分値が変わり**変化検出が無意味化**、通知過多 |
| 3 | ポーリング間隔 15 秒 | §6-2 の ufw ブロックを誘発。**監視自体が障害を作った** |
| 4 | 状態キーに `phase`（ログ由来）を含めた | `tail -N` の窓が流れてフェーズ表示が前後し、**往復通知**が発生 |

**教訓**:

- 監視は「成功条件」だけでなく**失敗条件を必ず明示する**。「無言＝正常」ではない。
- **状態キーには判定に必要なものだけを入れる。** `uptime` も `phase` も見れば安心できる情報だが、
  判定には不要で、混ぜた分だけ変化検出が壊れた（#2・#4 は同じ根）。
- **監視が対象システムに与える負荷（接続頻度）を勘定に入れる。** #3 は観測行為そのものが障害を作った。

最終的に有効だった判定は以下。

```bash
# 成功: os が目標コードネームになった
# 失敗: プロセスが消えたのに os が元のまま（2回連続で確定）
if [ "$proc" = "no" ] && [ "$os" = "jammy" ]; then deadcount=$((deadcount+1)); fi
```

---

### 6-4. Bot を 13 分間止めた（唯一のサービス断）

24.04 移行後の `apt-get upgrade` で nodejs 系が更新された際、**pm2 デーモンが再起動して
管理下のプロセスを失った**。`pm2 list` が空になり、Bot が停止した。

- 発見の経緯: 検証コマンドで `pm2 list | grep numbertales` が空だったことに気づいた。
  heartbeat の `ts` と現在時刻を比較して **786 秒（13分）前で停止**していたと確定
- 復旧: `pm2 start ecosystem.config.cjs --env production`
- **さらに systemd unit も `inactive` になっていた**（＝次の VM 再起動で自動復帰しない状態）

**復旧時に順序を間違えて二次被害を出しかけた**: 先に `pm2 start` でデーモンを起動したため、
unit の `ExecStart=pm2 resurrect` が既存デーモンに接続するだけで PID ファイルを作らず、
systemd が `Failed with result 'protocol'` で失敗した。
`pm2 kill` してから `systemctl start` する正しい順序で復旧した（手順は
[vm-os-upgrade.md](./vm-os-upgrade.md) §2-4）。

**教訓**: OS/パッケージ更新後は `pm2 list` と `systemctl is-active pm2-$(whoami)` を**両方**確認する。
片方だけでは「プロセスは動いているが自動復帰は壊れている」状態を見逃す。

### 6-5. 24.04 は「完走したように見えて」582 個が未設定だった

OS バージョン表記は 24.04.4 になり Bot も動いていたが、`dpkg --audit` が
**582 個の「展開済み・未設定」パッケージ**を報告していた。`secureboot-db` が
`iHR`（要再インストール）で詰まり、以降の設定処理が中断していた。

`sudo dpkg --configure -a` で 582 → 0 まで解消し、残った `secureboot-db` は
`apt-get -f install` が noble 版（1.9build1）への更新を提案してきたのでそれに従って解決した。

**教訓**: 最初に `dpkg --remove --force-remove-reinstreq` での強制削除を試みたが、
実際には**標準手順（`-f install`）が正規の解決策を持っていた**。
強制フラグは最後の手段であり、標準手順を先に尽くすこと。
また **OS バージョン表記だけを見て「完了」と判断しない**こと。`dpkg --audit` まで見る。

---

## 7. 実施した変更の一覧

| 対象 | 変更 | 可逆性 |
| --- | --- | --- |
| VM: OS | 20.04.6 → 22.04.5 → **24.04.4 LTS** | スナップショット `pre-2204-upgrade-20260720` から復元可 |
| VM: git | 2.25.1 → **2.54.0**（`ppa:git-core/ppa` を noble へ張り替え） | PPA 削除＋標準版（2.43）で戻せる |
| VM: パッケージ | 孤立 384 + 22 個を `autoremove --purge`、582 個を `dpkg --configure -a` | スナップショット |
| **VM: 旧 Misskey** | **削除**（nginx / postgresql / `mk1` DB / `misskey` ユーザー） | `_backups/.../2026-07-20_vm-misskey-removal/` とスナップショットから復元可 |
| VM: `~/.git` | `~/.git.bak-20260720` へリネーム | リネームで戻せる（中身は空） |
| VM: pm2 | プロセス再登録・`pm2 save`・systemd 管理へ復帰 | — |
| repo | docs 3件（`develop`） | git 履歴 |

**Bot の設定・データ（`.env` / `.cache/session.db`）には一切変更を加えていない。**
旧 Misskey のデータは削除したが、論理バックアップとスナップショットの二重で保全している。

---

## 8. 残作業

1. `deploy.yml` に `workflow_dispatch` を追加すると、切り分け時に run ID 指定なしで再実行できる（任意）
2. VM 上の残骸（実害なし）
   - `~/upgrade-2204.log` / `~/upgrade-2404.log` / `~/misskey-backup-20260720/`
   - `/etc/apt/sources.list.d/*.distUpgrade` / `*.save`
   - `~/.git.bak-20260720`（空リポジトリ。不要と確認できれば削除可）
3. ~~ローカルバックアップの保管方針~~ → **対応済み（2026-07-20）**。
   `.cache/` は AGENTS.md 上「消していい場所」と定義されており、そこにバックアップを置くと
   キャッシュ整理のたびに確認が必要になる（実際、整理依頼を受けた際に危うく消すところだった）。
   リポジトリ外の `_backups/NumberTales-MisskeyAIBot/2026-07-20_vm-misskey-removal/` へ
   README 付きで移設し、`.cache/` は空にした。以後のバックアップも同領域へ取る
   （手順は [vm-os-upgrade.md](./vm-os-upgrade.md) §1-2）

### 次に OS を上げるときの注意（24.04 → 26.04 LTS 想定）

本記録 §6 の地雷はいずれも再発しうる。特に:

- `setsid` で起動（tmux は自身が更新対象で落ちる）
- SSH ポーリングは 60 秒以上（ufw `22/tcp LIMIT IN`）
- **完了判定は OS 表記ではなく `dpkg --audit` で行う**
- 作業後に `pm2 list` と `systemctl is-active pm2-$(whoami)` を**両方**確認

---

*作業者: Claude Code (Opus 4.8) / 承認・判断: リポジトリオーナー*
