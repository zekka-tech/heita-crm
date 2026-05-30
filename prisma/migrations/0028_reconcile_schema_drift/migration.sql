-- Reconcile accumulated schema drift between applied migrations and schema.prisma.
-- Note: CONCURRENTLY is omitted — Prisma 7 wraps every migration in a transaction.
-- Business_name_trgm_idx (GIN) and DocumentChunk_embedding_hnsw_idx (HNSW) are
-- Prisma-unmanaged and intentionally left in place; the CI drift check filters them.

-- 1. Fix StaffInvite foreign keys: change ON DELETE from RESTRICT to CASCADE
--    so that deleting a Business or User cascades to pending invites.
ALTER TABLE "StaffInvite" DROP CONSTRAINT "StaffInvite_businessId_fkey";
ALTER TABLE "StaffInvite" DROP CONSTRAINT "StaffInvite_invitedById_fkey";

ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Add missing OcrReceipt.reviewedBy foreign key (schema defines the relation
--    but the FK constraint was never emitted in any prior migration).
ALTER TABLE "OcrReceipt" ADD CONSTRAINT "OcrReceipt_reviewedBy_fkey"
  FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Drop superseded single-column / two-column B-tree indexes from migration 0015.
--    Each is subsumed by the composite indexes added in 0027 and schema.prisma.
DROP INDEX IF EXISTS "Membership_businessId_isActive_idx";
DROP INDEX IF EXISTS "LoyaltyTransaction_businessId_membershipId_idx";
DROP INDEX IF EXISTS "StaffMember_businessId_idx";
