# VM 作業記録 — git アップグレードと OS 移行（2026-07-20）

> 種別: 実作業記録（VM 実機への変更を伴う）
> 実施日: 2026-07-20
> 対象: GCP VM `misskey-bots-group-numbertales`（`numbertales-misskey-surver` / us-central1-a / e2-small）
> 関連: [deployment.md](./deployment.md) / [vm-os-upgrade.md](./vm-os-upgrade.md)

---

## 1. 結論（先出し）

| 項目 | 結果 |
| --- | --- |
| **デプロイ失敗（2026-07-19 `fc9fa60`）** | ✅ **解決**。原因は VM の git 2.25.1。2.50.1 へ更新し CI 緑化を確認 |
| **OS 20.04 → 22.04** | ✅ **完了**（Ubuntu 22.04.5 LTS） |
| **OS 22.04 → 24.04** | ⏸ **保留**。PostgreSQL 15→16 移行が前提のため見送り（後述） |
| Bot | ✅ 稼働継続。作業を通じてサービス断なし（再起動は pm2 `startup` で自動復帰） |
| **Misskey インスタンス** | ✅ 無傷（`mk1` DB / nginx / postgresql すべて健全） |

**最大の収穫は「この VM に Misskey 本体が同居している」と判明したこと。** 詳細は §4。

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

---

## 3. OS アップグレード 20.04 → 22.04

### 3-1. 事前準備

- ディスクスナップショット `pre-2204-upgrade-20260720`（READY / 256GB / 実データ 30GB）
- `.env` と `.cache/session.db` をローカル `.cache/vm-backup-20260720/` へ退避
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

## 5. 24.04 を見送った理由

```
ERROR Dist-upgrade failed: 'The package 'postgresql-15' is marked for removal
  but it is in the removal deny list.
```

24.04 の標準 PostgreSQL は 16 のため 15 が削除対象になるが、deny list が拒否して依存計算が破綻する。
**これは保護機構が正しく働いた結果であり、回避すべきではない。**

進めるには `pg_upgradecluster` による 15→16 移行が前提で、**Misskey の停止を伴う**。
一方で急ぐ理由はない。

- 22.04 の標準サポート: **2027年4月**（ESM で 2032年）
- PostgreSQL 15 のサポート: **2027年11月**
- 当初の目的（20.04 のサポート切れ脱出、デプロイ失敗の解消）は**達成済み**

よって **22.04 で完了**とし、24.04 は Misskey のダウンタイムを計画できる日に実施する方針とした。
手順は [vm-os-upgrade.md](./vm-os-upgrade.md) の「24.04 へ進むためのブロッカー」節に記載。

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

### 6-3. 監視スクリプトの設計ミス3件

| # | 内容 | 結果 |
| --- | --- | --- |
| 1 | 終了条件を「成功（jammy 到達）」だけで組んだ | abort による即時終了を検出できず、**13分間「実行中」と誤認**。ログサイズ 0 で気づいた |
| 2 | 状態キーに `uptime` を含めた | 毎分値が変わり**変化検出が無意味化**、通知過多 |
| 3 | ポーリング間隔 15 秒 | §6-2 の ufw ブロックを誘発。**監視自体が障害を作った** |

**教訓**: 監視は「成功条件」だけでなく**失敗条件を必ず明示する**こと。
「無言＝正常」ではない。また、監視が対象システムに与える負荷（接続頻度）を軽視しない。

最終的に有効だった判定は以下。

```bash
# 成功: os が目標コードネームになった
# 失敗: プロセスが消えたのに os が元のまま（2回連続で確定）
if [ "$proc" = "no" ] && [ "$os" = "jammy" ]; then deadcount=$((deadcount+1)); fi
```

---

## 7. 実施した変更の一覧

| 対象 | 変更 | 可逆性 |
| --- | --- | --- |
| VM: git | 2.25.1 → **2.50.1**（`ppa:git-core/ppa`） | PPA 削除＋標準版再インストールで戻せる |
| VM: OS | 20.04.6 → **22.04.5 LTS** | スナップショット `pre-2204-upgrade-20260720` から復元可 |
| VM: パッケージ | 孤立 384 個を `autoremove --purge` | 同上（`node-*` 275 / python2 / x11 / fonts 系） |
| VM: `~/.git` | `~/.git.bak-20260720` へリネーム | リネームで戻せる（中身は空） |
| repo | docs 3件を更新・新規（`develop`） | git 履歴 |

**Bot の設定・データ（`.env` / `session.db`）および Misskey のデータには一切変更を加えていない。**

---

## 8. 残作業

1. **24.04 への移行**（PostgreSQL 15→16 移行とセット。Misskey ダウンタイム要計画）
2. `deploy.yml` に `workflow_dispatch` を追加すると、切り分け時に run ID 指定なしで再実行できる（任意）
3. VM 上の残骸（実害なし）
   - `~/upgrade-2204.log` / `~/upgrade-2404.log`
   - `/etc/apt/sources.list.d/*.distUpgrade` / `*.save`
   - `~/.git.bak-20260720`（空リポジトリ。不要と確認できれば削除可）

---

*作業者: Claude Code (Opus 4.8) / 承認・判断: リポジトリオーナー*
