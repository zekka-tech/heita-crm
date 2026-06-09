# Repository Guidelines

Heita CRM — mobile-first PWA (loyalty + messaging + AI) for South African retailers.

## Stack

Next.js 15 App Router (standalone output, Turbopack), TypeScript, Tailwind CSS v4, shadcn/ui (New York style). Database is PostgreSQL 16 + Prisma 7 + pgvector. Auth is Auth.js v5 (phone OTP via Africa's Talking, Google, Apple). Queue/cache is BullMQ + Redis (ioredis) with in-memory fallback for OTP/rate-limit. AI uses Ollama (local) with Anthropic fallback, streamed over SSE. Receipt OCR uses client-side Tesseract.js with server-side DeepSeek vision API fallback. Storage is S3-compatible (Cloudflare R2 / MinIO). Logging via pino with sensitive-field redaction.

## Project Structure

- `src/app` — App Router pages, API routes, server actions, middleware
  - `(auth)` — split-pane auth flow
  - `(app)` — bottom-nav customer shell (home, wallet, notifications, profile)
  - `b/[slug]` — public business surfaces
  - `dashboard/[businessId]` — staff dashboard
  - `api/webhooks/whatsapp` — HMAC-verified Meta webhook
  - `api/webhooks/africas-talking` — IP-allowlist + shared-secret protected
  - `api/auth/request-otp` — three-tier rate-limited (burst, per-phone hour, per-IP hour)
  - `api/ai/chat` — SSE streaming RAG (Ollama -> Anthropic fallback)
  - `api/health` — DB + Redis liveness for orchestrators
- `src/components` — shared UI (shadcn/ui base at `@/components/ui`)
- `src/lib` — infrastructure singletons (auth, prisma, redis, logger, security, rate-limit, OTP, AI)
- `src/server` — tRPC routers, domain services (loyalty, membership, business, whatsapp), HTTP handlers
- `src/workers` — BullMQ workers (document ingestion, WhatsApp AI replies)
- `prisma/` — schema, migrations, seed data
- `tests/unit` — Vitest unit specs; `tests/e2e` — Playwright specs
- `messages/` — next-intl translation catalogs

## Commands

Requires Node `>=22` (pin: `22.12.0` in CI) and npm `>=10`. Use `nvm use` or `source scripts/use-local-node.sh` to switch.

| Command | What it does |
|---|---|
| `npm run dev` | Next dev server (port 3000, Turbopack) |
| `npm run typecheck` | `next typegen && tsc -p tsconfig.typecheck.json` — no emit |
| `npm run lint` | ESLint (`eslint.config.mjs`) — no Prettier |
| `npm run test` | Vitest unit suite (node env, fails fast) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Vitest with v8 coverage on security-critical files ONLY (see vitest.config.ts) |
| `npm run test:a11y` | Accessibility smoke tests (axe-core, WCAG AA) |
| `npm run test:e2e` | Playwright (boots standalone server automatically, needs build first) |
| `npm run test:eval` | RAG eval harness (informational, non-blocking in CI) |
| `npm run build` | Next production build (standalone output). Set `HEITA_BUILD_PHASE=1` for build-phase guards. |
| `npm run start` | Serve the built standalone app |
| `npm run ci` | Full pipeline: `typecheck && lint && test && build` |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:setup` | Preflight + `prisma migrate deploy` + `prisma db seed` |
| `npm run db:seed` | Seed dev data |
| `npm run worker:dev` | BullMQ workers (`tsx watch`) |
| `npm run docker:up` | Local stack (postgres + redis + minio + ollama) |
| `npm run docker:setup` | Pull Ollama models + create MinIO bucket |
| `npm run vapid:generate` | Generate VAPID key pair for web push |

**Order matters:** `typecheck` before `lint` before `test` before `build`. CI enforces this.

**Post-install:** `npm install` runs `prisma generate` + `scripts/copy-tesseract-assets.mjs` (copies Tesseract.js WASM/worker from node_modules to `public/tesseract/`).

## Environment Variables

Copy `.env.example` to `.env`. Minimum for local dev: `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`. Redis port in docker-compose is mapped to `6380` locally; set `REDIS_URL=redis://localhost:6380` when using the Docker stack.

Key variables for tests/e2e: `E2E_EXPOSE_DEV_OTP=1` exposes OTP codes in API responses (dev only). The standalone server sets `NODE_ENV=production` at startup, so e2e CI must provide all production-required secrets even in test runs.

## Coding Conventions

- TypeScript, ESM, 2-space indent, semicolons, double quotes
- Import alias `@/` maps to `./src/` (e.g. `@/server/services/...`)
- `PascalCase` for React components, `camelCase` for functions/variables, kebab-case for route folders
- Business logic in `src/server/services` or `src/lib`, not in page components
- Server-only data access lives in `src/server/services`; UI never touches Prisma directly outside read-only Server Components
- All Prisma writes spanning >2 operations must be in `prisma.$transaction` with explicit `maxWait`/`timeout`
- Phone numbers stored in E.164; UI accepts loose input, normalises on the server
- ESLint is the formatter; `no-console` warns except `console.warn`/`console.error`; `@typescript-eslint/no-explicit-any` is an error
- Route types are typed (`typedRoutes: true` in next.config.ts)

## Testing Guidelines

- Unit tests: `*.test.ts` or `*.test.tsx` under `tests/unit/` or `src/__tests__/`. Both are included by vitest.
- E2E tests: `tests/e2e/*.spec.ts`. Playwright webServer boots the standalone server; `next start` does NOT work with `output: standalone` — the server is `node .next/standalone/server.js`.
- Coverage thresholds (55% lines/statements, 48% branches, 60% functions) apply ONLY to the security-critical files listed in `vitest.config.ts` coverage.include. Files not in that list are excluded from aggregate reporting.
- Default vitest environment is Node; add `// @vitest-environment jsdom` only when DOM APIs are required.
- `tests/setup.ts` loads `vitest-axe/extend-expect`.
- RAG eval (`npm run test:eval`) uses a separate config (`vitest.eval.config.ts`) and is non-blocking in CI.
- E2E tests dismiss the cookie consent banner by default via localStorage seed in `playwright.config.ts`.

## Architecture Notes

- **CSP:** Set per-request in `src/middleware.ts` using a unique nonce, NOT in `next.config.ts`. The config only sets non-CSP security headers.
- **Standalone output:** `next.config.ts` uses `output: "standalone"`. `next-auth` and `@auth/core` must be in `transpilePackages` (otherwise every auth callback 500s). Heavy server packages (ioredis, bullmq, pg, prisma, etc.) are in `serverExternalPackages`.
- **Playwright webServer:** CI copies `.next/static` and `public/` into `.next/standalone/` before starting the server — this mirrors Dockerfile COPY steps. Assets missing there means every JS chunk 404s.
- **Tesseract.js WASM/worker:** Copied from `node_modules` to `public/tesseract/` at postinstall and prebuild. The CSP in middleware allows `self` + unsafe-eval for these WASM workers.

## Security

- WhatsApp webhook verifies `x-hub-signature-256` HMAC against `WHATSAPP_APP_SECRET`
- Africa's Talking webhook accepts only documented IP ranges or shared-secret callers
- OTP request hits three rate-limiters and HMAC-signs codes with `AUTH_SECRET`
- Cron endpoints use constant-time secret comparison via `CRON_SECRET`
- Web-source crawler is SSRF-guarded (`assertPublicHttpUrl`): http(s) only, DNS-resolved, rejects loopback/private/link-local/metadata IPs on every fetch and redirect hop
- Destructive Prisma migrations (DROP TABLE/COLUMN, ALTER COLUMN TYPE) require a `migration-approved` PR label in CI
- `npm audit --omit=dev --audit-level=moderate` runs in CI and blocks on moderate+ vulns
- Trivy filesystem scan runs on critical severity only

## Commit & PR Guidelines

Conventional Commits (e.g. `fix(ci): ...`, `feat(loyalty): ...`). Keep commits scoped and imperative. PRs need a problem/solution summary, test evidence, and screenshots for UI changes. Flag schema, env, security, or ops-impacting changes explicitly.
