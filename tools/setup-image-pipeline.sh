#!/usr/bin/env bash
#
# setup-image-pipeline.sh
# 数式画像の清書基盤（F-17C）のブートストラップ。サブモジュール `_calcimage-pipeline/`
# （入れ子の `basis/` フォントまで）を取得し、Python の venv を冪等に構築する。
#
# 前提:
#   - python3（3.11+）と python3-venv、libcairo2 が入っていること（Debian 12 なら apt で入る）。
#   - Debian 12 は PEP 668（externally-managed）なのでシステム pip には入れず venv を使う。
#
# 使い方:
#   bash tools/setup-image-pipeline.sh
#   その後 .env に TYPESET_PYTHON=_calcimage-pipeline/.venv/bin/python を設定する。
#
#   exit 0 : 構築済み（no-op）もしくは今回構築した
#   exit 1 : エラー（python3 が無い / 描画テストに失敗）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

SUB="_calcimage-pipeline"
VENV="$SUB/.venv"

git submodule update --init --recursive "$SUB"

if [ ! -x "$VENV/bin/python" ]; then
  command -v python3 >/dev/null || { echo "ERROR: python3 not found" >&2; exit 1; }
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q -r "$SUB/requirements.txt"
  echo "CREATED venv at $VENV"
else
  echo "UP_TO_DATE venv at $VENV"
fi

# 描画テスト（libcairo2 が無いとここで落ちる）
mkdir -p .cache
"$VENV/bin/python" "$SUB/scripts/typeset.py" '\frac{1}{2}' -o .cache/typeset-smoke.png --bg white --cell 3
echo "OK typeset smoke test → .cache/typeset-smoke.png"
