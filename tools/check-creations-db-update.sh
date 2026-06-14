#!/usr/bin/env bash
#
# check-creations-db-update.sh
# サブモジュール `_creations-db` に upstream 更新があるかを判定するゲートスクリプト。
#
#   exit 0  : 更新あり（本処理を実行すべき）  -> 標準出力: "UPDATE_AVAILABLE <local>..<remote>"
#   exit 10 : 最新（何もしない）              -> 標準出力: "UP_TO_DATE <local>"
#   exit 1  : エラー（fetch 失敗等）
#
# スケジュールタスクから呼び出され、exit 0 の時だけ最適化処理を走らせる想定。
# 単体でも `bash tools/check-creations-db-update.sh` で手動確認できる。

set -euo pipefail

# リポジトリルートへ移動（このスクリプトの 1 つ上の階層）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

SUBMODULE="_creations-db"
# .gitmodules に branch 設定があればそれを、無ければ develop を追跡
BRANCH="$(git config -f .gitmodules --get "submodule.${SUBMODULE}.branch" 2>/dev/null || echo "develop")"

if [ ! -d "$SUBMODULE/.git" ] && [ ! -f "$SUBMODULE/.git" ]; then
  echo "ERROR: submodule '$SUBMODULE' is not initialized" >&2
  exit 1
fi

# upstream を取得
if ! git -C "$SUBMODULE" fetch --quiet origin "$BRANCH"; then
  echo "ERROR: failed to fetch origin/$BRANCH for $SUBMODULE" >&2
  exit 1
fi

LOCAL="$(git -C "$SUBMODULE" rev-parse HEAD)"
REMOTE="$(git -C "$SUBMODULE" rev-parse "origin/$BRANCH")"

if [ "$LOCAL" != "$REMOTE" ]; then
  echo "UPDATE_AVAILABLE ${LOCAL:0:8}..${REMOTE:0:8} (branch: $BRANCH)"
  exit 0
fi

echo "UP_TO_DATE ${LOCAL:0:8} (branch: $BRANCH)"
exit 10
