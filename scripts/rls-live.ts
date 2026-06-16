/* eslint-disable no-console -- CLI tool: console is the interface */
/**
 * rls-live.ts — provision the unprivileged app role and run the live RLS test.
 *
 * Proves tenant isolation is enforced by Postgres FORCE ROW LEVEL SECURITY
 * against a real, non-BYPASSRLS role — not by application code or mocks.
 *
 *   npm run test:rls
 *
 * Requires DATABASE_URL to point at a MIGRATED database as the owner/migrator
 * role (the role that can CREATE ROLE / GRANT). This script then:
 *   1. Idempotently creates/repairs the `heita_app` role (NOSUPERUSER,
 *      NOBYPASSRLS) and grants it DML on the current database — database-name
 *      agnostic, unlike the prod docker/postgres/init.sql.
 *   2. Asserts the role genuinely cannot bypass RLS and that RLS is enabled.
 *   3. Derives APP_DATABASE_URL and runs tests/unit/rls-live.test.ts as that
 *      role, where it would otherwise self-skip.
 *
 * Local quickstart:
 *   npm run docker:up && npm run db:migrate && npm run test:rls
 */

import { spawnSync } from "node:child_process";

import { Client } from "pg";

const APP_ROLE = "heita_app";
const ownerUrl = process.env.DATABASE_URL;
// Local/CI test password only; never the production secret. Charset-restricted
// because it is interpolated into ALTER ROLE (which cannot be parameterised).
const appPassword = process.env.RLS_APP_PASSWORD ?? "heita_app_test";

function fail(message: string, code = 1): never {
  console.error(`✗ ${message}`);
  process.exit(code);
}

function deriveAppUrl(base: string): string {
  const url = new URL(base);
  url.username = APP_ROLE;
  url.password = appPassword;
  return url.toString();
}

async function ensureAppRole(): Promise<void> {
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const dbRes = await client.query<{ db: string }>("SELECT current_database() AS db");
    const db = dbRes.rows[0]?.db;
    if (!db) fail("could not determine current database");

    await client.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
           CREATE ROLE ${APP_ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
         END IF;
       END $$;`
    );
    await client.query(`ALTER ROLE ${APP_ROLE} WITH LOGIN NOBYPASSRLS PASSWORD '${appPassword}'`);

    const attrs = await client.query<{ rolbypassrls: boolean; rolsuper: boolean }>(
      `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = '${APP_ROLE}'`
    );
    if (attrs.rows[0]?.rolbypassrls || attrs.rows[0]?.rolsuper) {
      fail(`${APP_ROLE} must not have BYPASSRLS or SUPERUSER — RLS cannot be proven against it`);
    }

    await client.query(`GRANT CONNECT ON DATABASE "${db}" TO ${APP_ROLE}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`);

    const rls = await client.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'Membership'`
    );
    if (rls.rows.length === 0) {
      fail('table "Membership" not found — run `npm run db:migrate` first', 2);
    }
    if (!rls.rows[0]?.relrowsecurity) {
      fail("RLS is not enabled on Membership — apply migration 0040_enable_business_rls", 2);
    }

    console.log(`✓ ${APP_ROLE} provisioned on "${db}" (NOBYPASSRLS, RLS enabled on Membership)`);
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  if (!ownerUrl) fail("DATABASE_URL (owner/migrator role) is required", 2);
  if (!/^[A-Za-z0-9_]+$/.test(appPassword)) {
    fail("RLS_APP_PASSWORD must be alphanumeric/underscore only", 2);
  }

  await ensureAppRole();

  const appUrl = deriveAppUrl(ownerUrl);
  console.log("▶ running live RLS enforcement test as the app role…");
  const result = spawnSync("npx", ["vitest", "run", "tests/unit/rls-live.test.ts"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: ownerUrl, APP_DATABASE_URL: appUrl }
  });
  process.exit(result.status ?? 1);
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
