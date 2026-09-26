#!/usr/bin/env sh
# Pre-push quality gate. Runs on `git push` and validates ONLY what the push
# introduces — the commits and the files changed in this push — so it stays
# fast and doesn't re-check the whole repo.
#
# Checks, in order:
#   1. Branch name convention (feature/<JIRA-KEY>-...)
#   2. Commit messages in the pushed range (commitlint / conventional commits)
#   3. Prettier formatting on changed files
#   4. ESLint (incl. import order) on changed app source
#
# Git passes the push refs on stdin as: <local ref> <local sha> <remote ref> <remote sha>
set -eu

# 1) Branch name.
./scripts/check-branch-name.sh

ZERO=0000000000000000000000000000000000000000
files=""
from=""
to=""

while read -r _local_ref local_sha _remote_ref remote_sha; do
  # Skip branch deletions (nothing to push).
  [ "$local_sha" = "$ZERO" ] && continue

  if [ "$remote_sha" = "$ZERO" ]; then
    # New branch on the remote: base off main, else the root commit.
    base=$(git merge-base "$local_sha" origin/main 2>/dev/null || true)
    [ -n "$base" ] || base=$(git rev-list --max-parents=0 "$local_sha" | tail -n 1)
  else
    base="$remote_sha"
  fi

  files="$files
$(git diff --name-only --diff-filter=ACMR "$base" "$local_sha")"
  from="$base"
  to="$local_sha"
done

# Delete-only push (or nothing to do).
[ -n "$to" ] || exit 0

# De-dupe and drop blanks.
files=$(printf '%s\n' "$files" | sort -u | sed '/^$/d')
[ -n "$files" ] || exit 0

echo "[pre-push] validating $(printf '%s\n' "$files" | wc -l | tr -d ' ') changed file(s) in $from..$to"

# 2) Commit messages in the pushed range.
yarn commitlint --from "$from" --to "$to"

# Most formatting/lint failures are auto-fixable — point the dev at `yarn fix`.
fix_hint() {
  echo "" >&2
  echo "✗ $1" >&2
  echo "  Run 'yarn fix' to auto-fix formatting and import order, then amend/commit and push again." >&2
  exit 1
}

# 3) Prettier on changed files (xargs guarded: never run on empty input).
fmt=$(printf '%s\n' "$files" | grep -E '\.(ts|tsx|js|jsx|cjs|mjs|json|md|yml|yaml)$' || true)
if [ -n "$fmt" ]; then
  printf '%s\n' "$fmt" | xargs yarn prettier --check || fix_hint "formatting issues"
fi

# 4) ESLint on changed app source only (that's where eslint configs live).
#    eslint is an app dependency, not a root one, so run each app's own eslint
#    via `yarn workspace ... exec`. Absolute paths keep it cwd-independent.
api_es=$(printf '%s\n' "$files" | grep -E '^apps/api/.*\.ts$' || true)
if [ -n "$api_es" ]; then
  printf '%s\n' "$api_es" | sed "s#^#$PWD/#" \
    | xargs yarn workspace @rms/api exec eslint --max-warnings 0 || fix_hint "lint / import-order issues in apps/api"
fi

web_es=$(printf '%s\n' "$files" | grep -E '^apps/web/.*\.(ts|tsx)$' || true)
if [ -n "$web_es" ]; then
  printf '%s\n' "$web_es" | sed "s#^#$PWD/#" \
    | xargs yarn workspace @rms/web exec eslint --max-warnings 0 || fix_hint "lint / import-order issues in apps/web"
fi

echo "[pre-push] all checks passed"
