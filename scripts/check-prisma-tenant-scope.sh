#!/usr/bin/env bash
# Detect Prisma mutation calls (update/delete/upsert) whose `where` clause
# uses only a primary-key lookup (`id:`) without a `businessId:` guard.
# This is the classic IDOR pattern — a missing tenant scope on a mutation.
#
# Functions that legitimately query by primary key alone must be added to the
# ALLOWLIST with a comment explaining why they are safe.
#
# Usage:
#   bash scripts/check-prisma-tenant-scope.sh [services-dir]
#
# Exit 0 when clean; exit 1 when violations found.
set -euo pipefail

SERVICES_DIR="${1:-src/server/services}"

# ---------------------------------------------------------------------------
# Allowlist: function names whose ID-only mutations have been reviewed and
# confirmed safe. Each entry MUST explain WHY it is safe.
# ---------------------------------------------------------------------------
ALLOWLIST=(
  # Staff invites: tokenHash is globally unique; businessId is embedded in the record
  "getInviteByToken"
  "acceptStaffInvite"
  "revokeStaffInvite"
  "expireStaffInviteIfOverdue"
  # OCR receipts: tenant check (`receipt.businessId === businessId`) done before update
  "rejectOcrReceipt"
  "approveOcrReceipt"
  # Loyalty tier recalc: memberships fetched with businessId filter first; PK update safe
  "recalculateMembershipTiers"
  "recalculateTier"
  # AI workspace: document fetched with businessId first; PK updates are safe post-validation
  "ingestDocumentForAi"
  "retryDocumentIngestion"
  "processDocumentIngestion"
  "requestDocumentIngestion"
  # AI token usage: usageId is an internal system record tied to businessId session
  "reserveAiTokenUsage"
  "releaseAiTokenUsage"
  "finalizeAiTokenUsage"
  "reserveAiMessageQuota"
  # Session/account: User model is global (not tenant-scoped)
  "revokeAllSessions"
  "confirmEmailChange"
  "initiateEmailChange"
  "updateAccountProfile"
  "softDeleteAccount"
  # Promotion broadcast: `where: {id, broadcastAt:null}` is an atomic idempotency claim
  "broadcastPromotion"
  # WhatsApp routing: aiChatSession ID is derived from membership (businessId on create)
  "routeInboundToBusiness"
  "createOrUpdateWhatsAppSession"
  # Event reminders: events fetched with businessId filter; PK update marks reminder sent
  "sendEventReminders"
  "sendDueEventReminders"
  "handleExpirePointsCron"
  # Sales follow-up drafting: internal worker keyed by a taskId we enqueued ourselves;
  # plan/thread validated via task.businessId before any PK status update
  "draftFollowUp"
  # Sales follow-up snooze/skip: task fetched with {id, businessId} (findFirstOrThrow)
  # before the PK update, so the tenant scope is enforced upstream
  "snoozeFollowUp"
  "skipFollowUp"
  # Sales thread reply detection: thread fetched with businessId filter first;
  # PK update records the customer reply / stage auto-advance
  "markCustomerResponded"
)

build_allowlist_pattern() {
  local IFS='|'
  echo "${ALLOWLIST[*]}"
}

ALLOWLIST_RE=$(build_allowlist_pattern)

found_violations=0

check_file() {
  local file="$1"
  local in_mutation=0
  local mutation_start=0
  local brace_depth=0
  local where_block=""
  local capturing_where=0
  local line_num=0

  while IFS= read -r line; do
    line_num=$((line_num + 1))

    # Detect start of a Prisma mutation call
    if echo "$line" | grep -qE 'prisma\.[a-zA-Z]+\.(update|delete|upsert|updateMany|deleteMany)\('; then
      in_mutation=1
      mutation_start=$line_num
      brace_depth=0
      where_block=""
      capturing_where=0
    fi

    if [[ $in_mutation -eq 1 ]]; then
      if echo "$line" | grep -q 'where:'; then
        capturing_where=1
        where_block="$line"
        opens=$(echo "$line" | tr -cd '{' | wc -c)
        closes=$(echo "$line" | tr -cd '}' | wc -c)
        brace_depth=$((opens - closes))
      elif [[ $capturing_where -eq 1 ]]; then
        where_block="${where_block}
${line}"
        opens=$(echo "$line" | tr -cd '{' | wc -c)
        closes=$(echo "$line" | tr -cd '}' | wc -c)
        brace_depth=$((brace_depth + opens - closes))
      fi

      # End of where block
      if [[ $capturing_where -eq 1 && $brace_depth -le 0 ]]; then
        has_id=$(echo "$where_block" | grep -cE '\bid\s*:' || true)
        has_business_id=$(echo "$where_block" | grep -c 'businessId' || true)

        if [[ $has_id -gt 0 && $has_business_id -eq 0 ]]; then
          # Look back up to 200 lines for an enclosing function declaration
          fn_context=$(head -n "$mutation_start" "$file" | tail -n 200)
          if ! echo "$fn_context" | grep -qE "(${ALLOWLIST_RE})"; then
            echo "FAIL: ID-only mutation without businessId at ${file}:${mutation_start}"
            echo "  where block:"
            echo "$where_block" | sed 's/^/    /'
            found_violations=$((found_violations + 1))
          fi
        fi

        in_mutation=0
        capturing_where=0
        where_block=""
      fi
    fi
  done < "$file"
}

while IFS= read -r -d '' file; do
  check_file "$file"
done < <(find "$SERVICES_DIR" -name "*.ts" -not -path "*/node_modules/*" -print0)

if [[ $found_violations -gt 0 ]]; then
  echo ""
  echo "ERROR: ${found_violations} ID-only Prisma mutation(s) found without businessId scope."
  echo "Add businessId to the where clause, or add the function to the ALLOWLIST in"
  echo "scripts/check-prisma-tenant-scope.sh after confirming upstream tenant checks."
  exit 1
fi

echo "OK: no unscoped ID-only mutations found in ${SERVICES_DIR}."
