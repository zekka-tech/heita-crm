# CLAUDE.md

This repository is the **Heita CRM** — a mobile-first PWA loyalty + messaging + AI co-worker platform built for South African retailers and small businesses.

## Stack

- **Framework**: Next.js 15 (App Router, Turbopack) with TypeScript
- **Styling**: Tailwind CSS v4 + Stitch-inspired design tokens (Electric Blue / Eco Green / Deep Navy, Poppins + Inter)
- **Database**: PostgreSQL 16 + Prisma 7 + pgvector
- **Auth**: Auth.js v5 (next-auth@beta) — phone OTP (Africa's Talking), Google, Apple
- **AI**: Ollama (local) with Anthropic Claude fallback, streamed over SSE
- **Receipt OCR**: client-side Tesseract.js (primary, runs in-browser via self-hosted WASM) with server-side DeepSeek vision API fallback
- **WhatsApp**: Meta Cloud API (HMAC-verified webhook)
- **SMS**: Africa's Talking
- **Queue / cache**: BullMQ + Redis (ioredis), with in-memory fallback for OTP/rate-limit
- **Storage**: Cloudflare R2 (prod) / MinIO (local) — S3-compatible
- **Logging**: pino with sensitive-field redaction

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Next dev server (port 3000, Turbopack) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint with `next/core-web-vitals` |
| `npm test` | Vitest unit suite |
| `npm run test:coverage` | Vitest with v8 coverage on security-critical files |
| `npm run test:e2e` | Playwright e2e (boots `next start` automatically) |
| `npm run build` | Next production build |
| `npm run ci` | Full pipeline: typecheck → lint → test → build |
| `npm run db:migrate` | Prisma migrations |
| `npm run db:seed` | Seed dev data |
| `npm run worker:dev` | BullMQ workers (tsx watch) |
| `npm run docker:up` | Local stack (postgres + redis + minio + ollama) |
| `npm run docker:setup` | Pull Ollama models + create MinIO bucket |

## Architecture map

- `src/app` — App Router pages, API routes, server actions
  - `(auth)` — split-pane auth flow (sign-in, sign-up, verify, forgot-password)
  - `(app)` — bottom-nav customer shell (home, wallet, notifications, profile)
  - `b/[slug]` — public business surfaces (profile, join, rewards, events, chat)
  - `dashboard/[businessId]` — staff dashboard (loyalty, AI workspace, messaging)
  - `api/webhooks/whatsapp` — HMAC-verified Meta webhook
  - `api/webhooks/africas-talking` — IP-allowlist + shared-secret protected
  - `api/auth/request-otp` — rate-limited (per phone burst, per phone hour, per IP hour)
  - `api/ai/chat` — SSE streaming, RAG pipeline (Ollama → Anthropic fallback)
  - `api/receipts/submit` — accepts client-side Tesseract.js OCR text (`rawText`); server parses it heuristically and falls back to the DeepSeek vision API when on-device text is missing/insufficient
  - `api/ai/web-sources` — add/list/delete/refresh website knowledge sources; SSRF-guarded same-origin crawl (`lib/ai/web-crawler`) → text/plain documents → same RAG pipeline
  - `api/cron/refresh-web-sources` — re-crawls due web sources (constant-time `CRON_SECRET`); unchanged pages skipped via `contentHash`
  - `api/health` — DB + Redis liveness for orchestrators
- `src/lib` — infrastructure
  - `auth`, `prisma`, `redis` — singletons
  - `phone` — E.164 normalisation
  - `security` — HMAC, constant-time compare, Meta signature verification
  - `rate-limit` — Redis-backed sliding window with in-memory fallback
  - `otp` — HMAC-SHA256 codes, single-use, 10-min TTL
  - `logger` — pino with sensitive-field redaction
  - `ai/{ollama,anthropic,rag}` — streamed RAG with graceful fallback
  - `ai/{web-crawler,web-source-crawl,html-extract}` — SSRF-guarded site crawl → text → existing document ingestion pipeline (BullMQ `web-crawl` queue)
- `src/server/services` — domain services (loyalty, membership, business, whatsapp, notification)
- `src/components/{ui,layout,business,loyalty,ai,auth,shared}` — shared Stitch component library
- `src/workers` — BullMQ workers (document ingestion, WhatsApp AI replies)
- `prisma/schema.prisma` — shared multi-tenant data model with `businessId` on tenant-scoped tables; pgvector(1024) for AI embeddings

## Security posture

- WhatsApp webhook verifies `x-hub-signature-256` HMAC against `WHATSAPP_APP_SECRET`
- Africa's Talking webhook accepts only documented IP ranges or shared-secret callers
- OTP request hits three rate-limiters (burst, per-phone hour, per-IP hour) and HMAC-signs codes with `AUTH_SECRET`
- Cron endpoints use constant-time secret comparison
- Web-source crawler is SSRF-guarded (`assertPublicHttpUrl`): http(s) only, DNS-resolved, rejects loopback/private/link-local/metadata IPs on every fetch and redirect hop; same-origin, robots.txt-respecting, with hard depth/page/size/time caps
- Strict CSP, HSTS (prod), X-Frame-Options DENY, Permissions-Policy enforced via `next.config.ts`
- `pino` logger redacts auth headers, OTP codes, tokens

## Deployment

- `Dockerfile` — multi-stage, non-root, dumb-init, health-checked
- `docker-compose.prod.yml` — app + postgres (pgvector) + redis with healthchecks
- `.github/workflows/ci.yml` — typecheck, lint, test, build, npm audit, gitleaks
- `.github/workflows/docker.yml` — GHCR publish on tags + main

## Conventions

- Server-only data access lives in `src/server/services`; UI never touches Prisma directly outside of read-only Server Components
- All Prisma writes are wrapped in `prisma.$transaction` with explicit `maxWait`/`timeout` when they span more than two operations
- Phone numbers stored in E.164; UI accepts loose input and normalises on the server
- AI conversations stream SSE `data:` frames so the UI can render token-by-token without polyfills
