CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- WAL retention: keep at least 2 GB of WAL segments so a short network
-- outage does not invalidate a streaming replica's replication slot.
-- These settings are hot-reloadable (no restart required).
ALTER SYSTEM SET wal_level = 'replica';
ALTER SYSTEM SET wal_keep_size = '2048';      -- MiB; keep ~2 GB of WAL
ALTER SYSTEM SET max_wal_size = '4096';       -- MiB; checkpoint target upper bound
ALTER SYSTEM SET min_wal_size = '512';        -- MiB; checkpoint lower bound
ALTER SYSTEM SET checkpoint_completion_target = '0.9';
ALTER SYSTEM SET archive_mode = 'on';
-- archive_command must be supplied via the runtime environment:
--   archive_command = 'aws s3 cp %p s3://<bucket>/wal/%f'
-- Set it in postgresql.conf or via POSTGRES_ARCHIVE_COMMAND env var.
SELECT pg_reload_conf();

-- ─── Two-role DB model (RLS enforcement) ──────────────────────────────────────
-- The database owner (POSTGRES_USER = "heita") is a superuser and therefore
-- exempt from RLS even with FORCE ROW LEVEL SECURITY. We create a second,
-- unprivileged role "heita_app" for the application's DATABASE_URL. This role
-- has no SUPERUSER / BYPASSRLS attributes, so Postgres enforces all RLS
-- policies against it — including the FORCE ROW LEVEL SECURITY policies in
-- migration 0040_enable_business_rls.
--
-- The owner role ("heita") is ONLY used by the migrate service that runs
-- `prisma migrate deploy`. The application runtime MUST connect as heita_app.
--
-- IMPORTANT: Change the placeholder password below (or run
--   ALTER ROLE heita_app PASSWORD '...' after first boot) and set the same
--   value in POSTGRES_APP_PASSWORD / DATABASE_URL in .env.production.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'heita_app') THEN
    CREATE ROLE heita_app WITH
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      -- NOBYPASSRLS is the default — stated explicitly for auditing clarity.
      NOBYPASSRLS
      PASSWORD 'HEITA_APP_CHANGE_ME_NOW';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE heita TO heita_app;
GRANT USAGE ON SCHEMA public TO heita_app;

-- Grant DML on tables that exist now (extensions create no app tables, but
-- Prisma migrations run after this script and grant nothing, so we use
-- ALTER DEFAULT PRIVILEGES to cover future tables too).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO heita_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO heita_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO heita_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO heita_app;

