# Load / Stress Tests

Concurrency and throughput tests for the Heita CRM's highest-risk public
surfaces, built on [autocannon](https://github.com/mcollina/autocannon). They
prove the system **degrades gracefully under load** — serving reads, rejecting
unauthenticated floods, and keeping signature verification fast — rather than
falling over.

> ⚠️ **Run against a deployed/staging instance, never the dev server.** Turbopack
> dev is not representative and will report misleadingly bad numbers. This
> harness is intentionally **not** part of `npm run ci`.

## Scenarios

| Scenario         | Path                              | What it proves                                                            |
| ---------------- | --------------------------------- | ------------------------------------------------------------------------ |
| `health-ready`   | `GET /api/health/ready`           | Readiness probe (DB+Redis+storage) holds up under sustained polling.     |
| `discover`       | `GET /api/discover/businesses`    | Public, DB-backed discovery read path stays fast under concurrency.      |
| `otp-burst`      | `POST /api/auth/request-staff-otp`| CSRF/auth gate + rate limiter reject an OTP burst without collapsing.     |
| `webhook-flood`  | `POST /api/webhooks/stripe`       | Signature verification rejects a bad-signature flood quickly (anti-DoS). |
| `ai-chat`        | `POST /api/ai/chat`               | AI chat auth gate holds *before* any model/token spend under load.       |

Several scenarios target **rejection paths on purpose** — an unauthenticated
attacker can only reach the 401/403/400 branch, so its resilience under flood is
the realistic question. Each scenario declares which status codes count as
"handled correctly" (`acceptableStatuses` in `scenarios.ts`).

## Usage

```bash
# Single scenario against staging
npm run test:load -- health-ready --url https://staging.heita.example

# All scenarios
npm run test:load -- all --url https://staging.heita.example

# Or via env var
LOAD_TARGET_URL=https://staging.heita.example npm run test:load -- all

# Crank up the stress
npm run test:load -- discover --url https://staging.heita.example \
  --connections 400 --duration 60 --pipelining 4

# Load-test an AUTHENTICATED path by supplying a session cookie
npm run test:load -- ai-chat --url https://staging.heita.example \
  --cookie "authjs.session-token=<token>"
```

Flags: `--url`, `--connections`, `--duration`, `--pipelining`, `--cookie`,
`--header "K: V"` (repeatable).

## Pass/fail gates

Each scenario has thresholds in `scenarios.ts`:

- **`maxLatencyP99Ms`** — p99 latency ceiling.
- **`minThroughputRps`** — minimum sustained requests/sec.
- **`maxErrorRate`** — max share of responses outside `acceptableStatuses`
  (plus socket errors and timeouts).

The runner exits **non-zero** if any selected scenario breaches a gate, so it can
gate a deploy in a pipeline step that targets staging. With no `--url`/
`LOAD_TARGET_URL` it prints usage and exits 0 (safe no-op).

> The default knobs are conservative so the harness is safe to point at staging.
> Tune thresholds to your infrastructure once you have a baseline — the shipped
> numbers are starting points, not SLOs.
