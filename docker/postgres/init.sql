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

