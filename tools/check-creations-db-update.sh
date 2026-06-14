#!/usr/bin/env bash
#
# check-creations-db-update.sh
# サブモジュール `_creations-db` に「追従すべき更新」があるかをネットワーク非依存で判定するゲート。
#
# 役割分担（B案 / 分業型）:
#   - upstream の fetch + `git submodule update --remote` は VM/ローカルのデプロイ側で実行する
#     （ネットワークが必要なため）。これによりサブモジュールの作業ツリー HEAD が新コミットへ進む。
#   - 本スクリプトは「サブモジュール作業ツリー HEAD」と「スーパープロジェクトが記録済みの gitlink」を
#     比較するだけ。ネットワークアクセスは一切行わない。
#
#   exit 0  : 追従すべき更新あり -> stdout: "UPDATE_AVAILABLE <recorded>..<working>"
#   exit 10 : 記録済みと一致（何もしない） -> stdout: "UP_TO_DATE <sha>"
#   exit 1  : エラー（サブモジュール未初期化等）
#
# 最適化コミット後は gitlink が作業 HEAD に追いつくため、次回以降は exit 10 になる。
# 手動確認: bash tools/check-creations-db-update.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

SUBMODULE="_creations-db"

if [ ! -d "$SUBMODULE/.git" ] && [ ! -f "$SUBMODULE/.git" ]; then
  echo "ERROR: submodule '$SUBMODULE' is not initialized" >&2
  exit 1
fi

# サブモジュールの作業ツリーが実際に指しているコミット
WORKING="$(git -C "$SUBMODULE" rev-parse HEAD 2>/dev/null || true)"
# スーパープロジェクトの最新コミットが記録している gitlink（= まだ追従していない基準点）
RECORDED="$(git rev-parse "HEAD:$SUBMODULE" 2>/dev/null || true)"

if [ -z "$WORKING" ] || [ -z "$RECORDED" ]; then
  echo "ERROR: could not resolve submodule commits (working='$WORKING' recorded='$RECORDED')" >&2
  exit 1
fi

if [ "$WORKING" != "$RECORDED" ]; then
  echo "UPDATE_AVAILABLE ${RECORDED:0:8}..${WORKING:0:8}"
  exit 0
fi

echo "UP_TO_DATE ${WORKING:0:8}"
exit 10
