#!/usr/bin/env bash
#
# setup-creations-db-sparse.sh
# サブモジュール `_creations-db` に sparse-checkout（non-cone / denylist）を冪等適用し、
# NumberTales の一次創作系（Primary / SemiPrimary）だけを作業ツリーに残すゲート付きセットアップ。
#
# 目的:
#   - 他作品（Works_NumberTales 以外の 8 作品）と、NumberTales 内でも明らかに他作者が絡む／
#     キャラデザ未着手の種別（Secondary / SelfSecondary / UnprocessedSecondary）を作業ツリーから間引く。
#   - Bot が実際に読むパスと NumberTales の一次〜準一次系（Primary / SemiPrimary）は残す。
#
# 仕組みと安全性:
#   - sparse-checkout は SKIP_WORKTREE ビットを立てて対象を「作業ツリーから消す」だけ。
#     サブモジュールの HEAD / ツリー / スーパープロジェクトの gitlink は一切変更しない。
#   - よって `git -C _creations-db status` は clean のまま。tools/check-creations-db-update.sh
#     （記録済み gitlink と作業 HEAD の SHA 比較）や 6 時間ごとの gitlink 追従コミットには影響しない。
#   - sparse 設定は `.git/modules/_creations-db/{config,info/sparse-checkout}` に置かれるローカル状態で
#     コミットされない。よってクローン毎に本スクリプトを一度走らせる必要がある（deploy に配線済み）。
#   - ネットワーク非依存・複数回実行安全（適用済みなら作業ツリーに触れず no-op）。
#
# 前提:
#   - 呼び出し側で先に `git submodule update --init _creations-db` を済ませておくこと。
#
#   exit 0  : 適用済み(no-op) もしくは今回適用した   -> stdout: "UP_TO_DATE ..." / "APPLIED ..."
#   exit 1  : エラー（サブモジュール未初期化 / 適用後に必須ファイルが欠落 等）
#
# 手動確認: bash tools/setup-creations-db-sparse.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

SUB="_creations-db"

if [ ! -e "$SUB/.git" ]; then
  echo "ERROR: submodule '$SUB' is not initialized (run: git submodule update --init $SUB)" >&2
  exit 1
fi

# sparse-checkout パターン（non-cone / gitignore 極性）:
#   通常行 = 残す(include)、"!" 行 = 再除外。include に無いものは既定で除外。
#   /data/Works_NumberTales/ を丸ごと include したうえで、非一次系の種別だけを "!" で間引く
#   （denylist 方式。上流 develop のリネームに対し allowlist より頑健）。
read -r -d '' SPARSE_PATTERNS <<'EOF' || true
/pkg/nodejs/
/data/db_meta.json
/data/db_type.json
/data/Works_NumberTales/
!/data/Works_NumberTales/DataBases/db_Secondary.json
!/data/Works_NumberTales/DataBases/db_SelfSecondary.json
!/data/Works_NumberTales/DataBases/db_UnprocessedSecondary.json
!/data/Works_NumberTales/Images/DB_Secondary/
!/data/Works_NumberTales/Images/DB_SelfSecondary/
EOF

# すでに同一パターンが適用済みか（真の no-op 判定）。
# 順序差・末尾空白差を無視して「パターン集合」として比較する。
already_applied() {
  [ "$(git -C "$SUB" config --bool core.sparseCheckout 2>/dev/null || echo false)" = "true" ] || return 1
  local current expected
  current="$(git -C "$SUB" sparse-checkout list 2>/dev/null | sed 's/[[:space:]]*$//' | sort || true)"
  expected="$(printf '%s\n' "$SPARSE_PATTERNS" | sed 's/[[:space:]]*$//' | sort)"
  [ "$current" = "$expected" ]
}

if already_applied; then
  echo "UP_TO_DATE sparse already applied (_creations-db: NumberTales Primary/SemiPrimary only)"
else
  printf '%s\n' "$SPARSE_PATTERNS" | git -C "$SUB" sparse-checkout set --no-cone --stdin
  git -C "$SUB" sparse-checkout reapply
  echo "APPLIED sparse-checkout (_creations-db: NumberTales Primary/SemiPrimary only)"
fi

# --- 適用後アサーション（無言フォールバック対策） ---
# 上流のリネーム等で必須パスが間引かれると、Bot は Cloudflare API / 固定キャラへ
# 無言フォールバックしてしまう（クラッシュしないので気付きにくい）。ここで検知して落とす。
missing=0

# (1) 硬依存: どのコミットでも存在すべき。作業ツリーに無ければエラー。
REQUIRED_HARD=(
  "pkg/nodejs/index.mjs"
  "data/db_meta.json"
  "data/Works_NumberTales/DataBases/db_Primary.json"
)
for rel in "${REQUIRED_HARD[@]}"; do
  if [ ! -e "$SUB/$rel" ]; then
    echo "ERROR: required path missing after sparse-checkout: $rel" >&2
    missing=1
  fi
done

# (2) 任意依存（存在時のみ保持されるべき）: サブモジュールのコミットツリーに在るのに
#     作業ツリーから消えていたら、パターン不備による間引きミス＝無言フォールバック要因。
#     コミット側に無い場合はスキップ（例: develop の gitlink は RoleplayPrompts 追加前）。
CONDITIONAL_KEEP=(
  "data/Works_NumberTales/RoleplayPrompts/DB_Primary"
)
for rel in "${CONDITIONAL_KEEP[@]}"; do
  if [ -n "$(git -C "$SUB" ls-tree -r --name-only HEAD -- "$rel" 2>/dev/null)" ] && [ ! -e "$SUB/$rel" ]; then
    echo "ERROR: committed path pruned by sparse-checkout (silent-fallback risk): $rel" >&2
    missing=1
  fi
done

[ "$missing" -eq 0 ] || exit 1

exit 0
