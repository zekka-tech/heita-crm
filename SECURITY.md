# Security posture — Heita CRM

This document records the security controls implemented in the Heita CRM codebase. It is meant to be reviewed alongside the code in `src/lib/security.ts`, `src/middleware.ts`, `next.config.ts`, and the API route files.

## Reporting

Send vulnerability reports to **security@heita.co.za**. Please do not file public issues. We aim to acknowledge within 1 business day and ship a patch within 7 days for high-severity reports.

## Authentication

- **Phone OTP** is the default sign-in path. Codes are 6 digits, HMAC-SHA256 signed with `AUTH_SECRET`, persisted hashed in Postgres (single-use, 10-minute expiry), and shadow-cached in Redis for fast verification.
- **Constant-time comparison** is used for OTP codes, cron secrets, and webhook tokens (`src/lib/security.ts:constantTimeEqual`).
- **Rate limiting** on `/api/auth/request-otp`: max 1/minute per phone, 5/hour per phone, 20/hour per IP. Limits use Redis when available and an in-memory sliding window as fallback.
- **Google/Apple OAuth** providers are only mounted when their environment variables are configured.

## Webhooks

- **WhatsApp Meta Cloud API** webhook (`/api/webhooks/whatsapp`) verifies `x-hub-signature-256` against `WHATSAPP_APP_SECRET` using HMAC-SHA256 on the raw request body. Mismatched or missing signatures return 401.
- **Africa's Talking** webhook (`/api/webhooks/africas-talking`) accepts only AT documented egress ranges (`196.201.213.*`, `196.201.214.*`) in production, or shared-secret callers via the `x-at-shared-secret` header.

## Transport & headers

`next.config.ts` emits the following on every route:

- `Content-Security-Policy` — locks scripts to `self` (`unsafe-inline` only; no remote scripts), denies `frame-ancestors`, restricts `form-action` to `self`, forces `upgrade-insecure-requests`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (production only)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — `camera=(self), microphone=(), geolocation=(self), payment=()`

`X-Powered-By` is disabled.

## Data isolation

- Multi-tenant data is row-level scoped by `businessId` on every business-owned table.
- The `DocumentChunk` table (which holds AI embeddings) is designed for `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` with a tenant policy — recommended for any production rollout.
- Phone numbers are stored in E.164; the UI normalises loose input via `normalizeZaPhone` before any DB write.

## Secrets

- `.env.production` is never committed.
- `.dockerignore` excludes all `.env*` files from the build context.
- The pino logger (`src/lib/logger.ts`) redacts `authorization`, `cookie`, `password`, `passwordHash`, `code`, `codeHash`, `token`, `access_token`, and `refresh_token` paths.
- `AUTH_SECRET` is required in production. The OTP signer throws at startup if it is missing.

## Dependencies

- Next.js is pinned to `^15.5.18` to clear the historical 15.3.x advisories.
- CI runs `npm audit --omit=dev --audit-level=high` and Gitleaks on every push and PR.

## Background jobs

- Cron endpoints (`/api/cron/*`) require a `CRON_SECRET` constant-time match.
- WhatsApp inbound handling is fire-and-forget within the webhook handler so we respond within Meta's 20s SLA; the heavy work is logged and intended to run on BullMQ workers.

## Threat model — open items

- **CSRF on server actions**: relies on Next.js App Router's same-origin enforcement. A future revision should layer a double-submit cookie for any cross-origin embed scenarios.
- **WhatsApp media handling**: not yet implemented; when added, files must be virus-scanned before being made available to staff.
- **Document upload**: presigned URL flow is intentionally deferred until storage credentials are configured. The route currently returns a clear 501/503 rather than silently accepting uploads.
