# Data Inventory — POPIA Compliance

Last reviewed: 2026-05-27

## PII by Table

| Table | PII Fields | Purpose | Retention | Legal Basis |
|-------|-----------|---------|-----------|-------------|
| `User` | `name`, `email`, `phone`, `image` | Identity, authentication | Until account deleted + 30 days | Consent / Legitimate interest |
| `Account` | `refresh_token`, `access_token` | OAuth linkage | Session lifetime | Legitimate interest |
| `Session` | `sessionToken` | Auth session | Expires per Auth.js config | Legitimate interest |
| `OtpCode` | `phone`, `codeHash` | Phone verification | Consumed / expired (10 min TTL) | Consent |
| `Membership` | `userId`, `referralCode` | Loyalty programme | Lifetime of membership | Contract |
| `Message` | `contactPhone`, `body` | WhatsApp / SMS conversation | 2 years | Legitimate interest |
| `Notification` | `userId`, `title`, `body` | In-app alerts | 90 days, then auto-purge (cron) | Consent |
| `PushSubscription` | `userId`, `endpoint`, `keys` | Push delivery | Until user revokes | Consent |
| `StaffAuditLog` | `actorUserId` | Compliance trail | 7 years (POPIA record keeping) | Legal obligation |
| `OcrReceipt` | `userId`, `imageUrl`, `rawOcrText` | Automated receipt processing | 2 years | Consent |
| `CustomerImportRun` | linked via `userId` | Bulk customer upload | 1 year | Legitimate interest |
| `AiChatSession` / `AiChatMessage` | `userId`, free-text messages | AI co-worker conversations | 1 year | Consent |
| `UserConsent` | `userId`, `type`, `grantedAt` | Consent records | Lifetime of consent + 5 years | Legal obligation |

## Retention Schedule (automated via cron)

| Data Type | Retention Period | Cron Job |
|-----------|-----------------|----------|
| Expired OTP codes | 1 day after expiry | `/api/cron/cleanup-expired-otps` |
| Read notifications | 90 days | `/api/cron/cleanup-notifications` |
| Orphaned AI chat sessions | 1 year | `/api/cron/cleanup-ai-sessions` |
| Database backups | 30 days | `backup.yml` (GitHub Actions) |

## Third-Party Data Processors

| Processor | Data Shared | Purpose | DPA Reference |
|-----------|------------|---------|---------------|
| Africa's Talking | Phone number, OTP | SMS / OTP delivery | AT DPA |
| Meta (WhatsApp Cloud API) | Phone, message body | WhatsApp messaging | Meta DPA |
| Anthropic (Claude API) | AI conversation turns | AI fallback | Anthropic DPA |
| DeepSeek | Receipt image URL | Receipt OCR — cloud vision fallback only (primary OCR is on-device, in-browser via Tesseract.js) | DeepSeek DPA |
| AWS (S3/R2) | Receipt images, document uploads | File storage | AWS DPA |
| Cloudflare R2 | User uploads, business documents | Object storage | Cloudflare DPA |
| Yoco | Business ID, plan ID, payment data | Billing / subscriptions | Yoco DPA |
| Sentry | Error traces (PII redacted by pino) | Error monitoring | Sentry DPA |

## Data Subject Rights

Requests handled via `src/app/(app)/profile/consents/` and the account deletion flow (`/api/account/delete`).

- **Access**: User can download their data from Profile → Data & Privacy
- **Rectification**: Profile settings page
- **Erasure**: Account deletion (soft-delete + 30-day purge window)
- **Portability**: CSV export of loyalty history

## Breach Response

See `INCIDENT_RESPONSE.md` for the breach notification SOP (72-hour POPIA notifier deadline).
