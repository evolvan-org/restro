#!/usr/bin/env bash
# Enforces the branch naming convention: <type>/<JIRA-KEY>-<slug>
#   e.g. feature/REST-24-ci-pipeline, fix/REST-101-login-casing
#
# Used by both the local pre-push hook and the CI `conventions` job.
# Pass the branch name as $1; falls back to the current git branch.
set -euo pipefail

branch="${1:-$(git rev-parse --abbrev-ref HEAD)}"

# Long-lived and detached-HEAD refs are always allowed.
case "$branch" in
  main | develop | HEAD | '')
    exit 0
    ;;
esac

pattern='^(feature|fix|chore|hotfix|bugfix|release|docs|refactor|test)/[A-Z]+-[0-9]+(-[a-z0-9._-]+)?$'

if [[ "$branch" =~ $pattern ]]; then
  echo "✓ branch name '$branch' is valid"
  exit 0
fi

cat >&2 <<EOF
✗ Invalid branch name: '$branch'

Expected: <type>/<JIRA-KEY>-<short-description>
  type:     feature | fix | chore | hotfix | bugfix | release | docs | refactor | test
  JIRA-KEY: e.g. REST-24
  example:  feature/REST-24-ci-pipeline-and-precommit-checks
EOF
exit 1
