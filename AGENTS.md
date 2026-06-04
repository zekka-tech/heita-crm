# Repository Guidelines

## Project Structure & Module Organization
`src/app` contains the Next.js App Router UI, route handlers, and server actions. Shared UI lives in `src/components`, reusable logic in `src/lib`, backend services and HTTP/TRPC adapters in `src/server`, and background jobs in `src/workers`. Database schema, migrations, and seed data live in `prisma/`. Tests are split between `tests/unit` and `tests/e2e`. Static assets belong in `public/`, localized message catalogs in `messages/`, operational runbooks in `docs/`, and helper scripts in `scripts/`.

## Build, Test, and Development Commands
Use Node `>=22` and npm `>=10`.

- `npm run dev` starts the local Next.js app with Turbopack.
- `npm run build` creates the production build; `npm run start` serves it.
- `npm run lint` runs ESLint across the repo.
- `npm run typecheck` runs Next type generation and TypeScript without emitting files.
- `npm run test` runs the Vitest unit suite.
- `npm run test:coverage` checks coverage thresholds.
- `npm run test:e2e` runs Playwright against the built standalone server.
- `npm run db:setup` applies Prisma migrations and seeds local data.
- `npm run worker:dev` starts the background worker watcher.

## Coding Style & Naming Conventions
This repository uses TypeScript, ESM imports, 2-space indentation, semicolons, and double quotes. Follow the existing alias style (`@/server/services/...`) instead of deep relative imports. Use `PascalCase` for React components, `camelCase` for functions/variables, and kebab-case for route folders. Keep business logic in `src/server/services` or `src/lib`, not inside page components. ESLint (`eslint.config.mjs`) is the formatter of record; there is no Prettier config.

## Testing Guidelines
Write unit tests as `*.test.ts` or `*.test.tsx` under `tests/unit`; keep Playwright specs in `tests/e2e/*.spec.ts`. Vitest uses a Node environment by default with `tests/setup.ts`; add `// @vitest-environment jsdom` only when DOM APIs are required. Coverage thresholds currently enforce 55% lines/statements, 48% branches, and 60% functions on tracked files. Add or update tests with every behavior change.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commits, for example `fix(ci): ...` and `debug(ci): ...`. Keep commits scoped and imperative. PRs should include a short problem/solution summary, linked issue or ticket, test evidence (`npm run test`, `npm run test:e2e`, etc.), and screenshots for visible UI changes. Call out schema, env, security, or operations-impacting changes explicitly.
