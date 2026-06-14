# Runbook: Postgres Row-Level Security (RLS) Enforcement

## Overview

Heita uses Postgres FORCE ROW LEVEL SECURITY (RLS) to enforce tenant isolation at the database
layer. Every query on a business-owned table must run inside a `withBusinessScope(businessId, ...)`
transaction that sets the `app.current_business_id` session-local GUC before any data access.

This runbook covers:
1. The two-role model (app role vs migration owner role)
2. How shadow mode works and transitions to enforcement
3. How to investigate and recover from an RLS policy error
4. How to temporarily disable enforcement per-table via feature flag

---

## 1. Two-role model

| Role | Description | Can bypass RLS? |
|---|---|---|
| `heita_app` | Runtime application role used by the Prisma connection pool | No — bound by RLS policies |
| `heita_migrator` | Migration/admin role (used by `prisma migrate deploy`) | Yes — has `BYPASSRLS` |

The Prisma `DATABASE_URL` connects as `heita_app`. The `prisma migrate` URL
(`DATABASE_MIGRATION_URL`) connects as `heita_migrator`.

**Important:** Never connect to production with `heita_migrator` for routine queries.
Even SELECT queries must go through `heita_app` to benefit from RLS enforcement.

---

## 2. How the scope is set

`withBusinessScope` (in `src/lib/prisma.ts`) wraps a Prisma transaction and executes:

```sql
SELECT set_config('app.current_business_id', '<businessId>', true);
```

The `true` flag makes the setting transaction-local (`SET LOCAL`). It is automatically cleared
when the transaction commits or rolls back. This means there is no risk of a stale scope
leaking across connections in the pool.

---

## 3. Shadow mode vs FORCE RLS

Migration `0040_enable_business_rls` uses `FORCE ROW LEVEL SECURITY` which applies to
table owners as well. The policies use `current_setting('app.current_business_id', true)` with
the `true` flag meaning the setting is optional (returns `''` instead of erroring when unset).

**Permissive (shadow) mode** — when the policy's USING clause evaluates to FALSE (businessId
doesn't match), Postgres silently returns 0 rows instead of raising an error. This is the
current "enforcement" behaviour: a misconfigured query returns nothing rather than leaking data.

**To escalate to strict mode** — change the policy to return an error instead of empty results:
this requires modifying the policy USING clause to throw when the setting is empty.

---

## 4. Investigating an RLS policy error

### Symptom: query returns 0 rows unexpectedly

1. Check application logs for `[RLS-WARN]` entries — these fire in `NODE_ENV !== 'production'`
   when a business-scoped model is queried outside `withBusinessScope`.
2. Identify the call site from the stack trace in the warning.
3. Confirm `app.current_business_id` is set in the session by running in psql:
   ```sql
   SELECT current_setting('app.current_business_id', true);
   ```
4. Wrap the offending service call with `withBusinessScope(businessId, ...)`.

### Symptom: `P2025` (record not found) on a write

This happens when the RLS policy filters the row being updated/deleted out of scope.
Steps:
1. Confirm the `businessId` passed to `withBusinessScope` matches the row's `businessId`.
2. Check that the row was not soft-deleted or deactivated.
3. Run the equivalent SELECT under the correct scope in psql to confirm visibility:
   ```sql
   BEGIN;
   SELECT set_config('app.current_business_id', '<businessId>', true);
   SELECT * FROM "Membership" WHERE id = '<rowId>';
   COMMIT;
   ```

### Symptom: RLS policy violation log in Postgres (`pg_audit`)

Look for `ERROR: new row violates row-level security policy` in the Postgres logs.
This means a write attempted to set `businessId` to a value that doesn't match the current
scope. This is always a bug — the application must pass the correct `businessId`.

---

## 5. Recovery: temporarily disabling enforcement per-table via feature flag

If a critical path is broken by RLS enforcement, you can temporarily bypass it using the
`rls_bypass_<ModelName>` feature flag:

### Emergency bypass procedure

1. Set the feature flag in the database (as `heita_migrator`):
   ```sql
   INSERT INTO "FeatureFlagOverride" ("id", "businessId", "flag", "enabled", "createdAt", "updatedAt")
   VALUES (gen_random_uuid(), '<businessId>', 'rls_bypass_Membership', true, now(), now())
   ON CONFLICT ("businessId", "flag") DO UPDATE SET "enabled" = true, "updatedAt" = now();
   ```
   Or use the feature flag admin UI at `/dashboard/<businessId>/settings/feature-flags`.

2. **This is a short-term mitigation only.** Open a P1 incident immediately to fix the
   underlying missing `withBusinessScope` wrap.

3. To disable bypass after fix is deployed:
   ```sql
   UPDATE "FeatureFlagOverride"
   SET "enabled" = false, "updatedAt" = now()
   WHERE "flag" = 'rls_bypass_Membership' AND "businessId" = '<businessId>';
   ```

### Global bypass (NEVER in production without senior approval)

As `heita_migrator`:
```sql
ALTER TABLE "Membership" DISABLE ROW LEVEL SECURITY;
-- Fix the application code --
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
```

---

## 6. Adding a new business-scoped table

When adding a new table with a `businessId` column:

1. Add the table to migration `0040_enable_business_rls` pattern (or create a new migration):
   ```sql
   ALTER TABLE "NewModel" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "NewModel" FORCE ROW LEVEL SECURITY;
   DROP POLICY IF EXISTS "NewModel_business_scope" ON "NewModel";
   CREATE POLICY "NewModel_business_scope" ON "NewModel"
     FOR ALL
     USING ("businessId" = current_setting('app.current_business_id', true)::text)
     WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);
   ```

2. Add the model name (camelCase) to `BUSINESS_SCOPED_MODELS` in `src/lib/prisma.ts`.

3. Ensure all service methods that touch the table use `withBusinessScope`.

---

## 7. Key files

| File | Purpose |
|---|---|
| `src/lib/prisma.ts` | `withBusinessScope` implementation + dev RLS guard |
| `prisma/migrations/0040_enable_business_rls/migration.sql` | RLS policies for all business-scoped tables |
| `src/__tests__/rls-isolation.test.ts` | Property-based isolation tests |
| `src/__tests__/rls-migration.test.ts` | Schema coverage assertions |
