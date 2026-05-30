#!/usr/bin/env bash
#
# Apply (or update) the repository branch-protection ruleset from
# .github/rulesets/main-release-protection.json. Idempotent: if a ruleset with
# the same name exists it is updated in place, otherwise it is created.
#
#   Requires: gh CLI authenticated with admin on the repo.
#   Usage:    ./scripts/apply-branch-protection.sh [owner/repo]
set -euo pipefail

cd "$(dirname "$0")/.."

REPO="${1:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
DEF=".github/rulesets/main-release-protection.json"
NAME="$(jq -r .name "$DEF")"

echo "→ Target repo: $REPO"
echo "→ Ruleset:     $NAME"

EXISTING_ID="$(gh api "repos/$REPO/rulesets" --jq \
  ".[] | select(.name == \"$NAME\") | .id" 2>/dev/null || true)"

if [[ -n "$EXISTING_ID" ]]; then
  echo "→ Updating existing ruleset #$EXISTING_ID…"
  gh api -X PUT "repos/$REPO/rulesets/$EXISTING_ID" --input "$DEF" >/dev/null
  echo "✓ Updated ruleset #$EXISTING_ID"
else
  echo "→ Creating ruleset…"
  NEW_ID="$(gh api -X POST "repos/$REPO/rulesets" --input "$DEF" --jq .id)"
  echo "✓ Created ruleset #$NEW_ID"
fi
