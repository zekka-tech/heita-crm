# Heita CRM

Mobile-first PWA loyalty + messaging + AI co-worker platform for South African
retailers and small businesses. Next.js 15 (App Router) · PostgreSQL + Prisma ·
Auth.js v5 · BullMQ/Redis · Meta WhatsApp Cloud API · Africa's Talking.

- **Architecture & conventions:** [`CLAUDE.md`](./CLAUDE.md)
- **Deployment & scheduled jobs:** [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)
- **SLOs / data inventory:** [`docs/SLO.md`](./docs/SLO.md), [`docs/DATA_INVENTORY.md`](./docs/DATA_INVENTORY.md)
- **Environment variables:** copy [`.env.example`](./.env.example) → `.env`

## Quick start

```bash
npm install
npm run docker:up      # postgres + redis + minio + ollama
npm run docker:setup   # pull Ollama models + create MinIO bucket
npm run db:migrate
npm run db:seed
npm run dev            # http://localhost:3000
```

## WhatsApp message templates

Heita sends two kinds of **proactive, business-initiated** WhatsApp messages.
Because these go out outside the 24-hour customer-service window, the Meta Cloud
API requires a **pre-approved message template** — free-form text is rejected.
You must create and get each template approved in **Meta Business Manager**, then
point the matching env var at its name (the defaults below assume you used the
suggested names).

| Purpose | Default template name | Env vars | Body params | Sent from | Trigger |
|---|---|---|---|---|---|
| **Event reminder** | `heita_event_reminder` | `WHATSAPP_EVENT_REMINDER_TEMPLATE`, `WHATSAPP_EVENT_REMINDER_TEMPLATE_LANG` (default `en_ZA`) | `{{1}}` business name · `{{2}}` event title · `{{3}}` when label (e.g. `Fri 6 Jun, 19:00` SAST) | `sendDueEventReminders` (`events.service.ts`) | POST `/api/cron/send-reminders` |
| **Promotion broadcast** | `heita_promotion` | `WHATSAPP_PROMOTION_TEMPLATE`, `WHATSAPP_PROMOTION_TEMPLATE_LANG` (default `en_ZA`) | `{{1}}` business name · `{{2}}` promotion title · `{{3}}` details (falls back to title when the promo has no description) | `broadcastPromotion` (`promotions.service.ts`) | POST `/api/cron/broadcast-promotions` |

### Suggested template bodies

Register the body with positional parameters in this order (category in Meta:
**Utility** for the reminder, **Marketing** for the promotion):

```
heita_event_reminder   Hi! Reminder from {{1}}: {{2}} starts {{3}}.
heita_promotion        {{1}}: {{2}} — {{3}}
```

Every parameter must be non-empty (Meta rejects blank params); the services
already guarantee this (e.g. promotion `{{3}}` falls back to the title).

### When a customer actually receives a WhatsApp

Both paths also deliver in-app / web-push / email via `sendNotification`. A
WhatsApp template is sent **in addition**, and only when **all** of the following
hold for that recipient:

1. **Channel opt-in** — the customer enabled the **WhatsApp** notification
   channel for that business (Profile → Notification preferences). This channel
   defaults to **off**, and like push/email it is suppressed during the
   customer's quiet hours.
2. **Marketing consent** — an active `WHATSAPP_MARKETING` `UserConsent` for that
   business (not revoked).
3. **Reachable** — the customer has a **verified** E.164 phone number.
4. **Business is configured** — the business has a `wabaPhoneId` (its WhatsApp
   Business phone-number ID). Businesses without one are silently skipped.

Outbound sends are recorded as `Message` rows (`channel = WHATSAPP`,
`direction = OUTBOUND`) for audit and the retention purge.

### Required platform env

These power the sends above; see [`.env.example`](./.env.example) for the full
list.

```bash
WHATSAPP_ACCESS_TOKEN=""              # Meta Cloud API token
WHATSAPP_EVENT_REMINDER_TEMPLATE="heita_event_reminder"
WHATSAPP_EVENT_REMINDER_TEMPLATE_LANG="en_ZA"
WHATSAPP_PROMOTION_TEMPLATE="heita_promotion"
WHATSAPP_PROMOTION_TEMPLATE_LANG="en_ZA"
```

Each business additionally needs its `wabaPhoneId` populated on the `Business`
record.
