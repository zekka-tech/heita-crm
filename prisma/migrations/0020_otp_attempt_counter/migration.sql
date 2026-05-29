-- Wave 16.5: OTP attempt counter + expiresAt index
-- Adds attemptCount to OtpCode so we can lock out a code after N failed
-- verify attempts (defence-in-depth on top of the per-phone rate limits).
-- Adds an index on expiresAt so the cleanup cron doesn't full-scan.

ALTER TABLE "OtpCode" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "OtpCode_expiresAt_idx" ON "OtpCode"("expiresAt");
