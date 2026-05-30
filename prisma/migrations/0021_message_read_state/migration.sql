-- AddColumn: Message.readByStaffAt
-- Tracks when a staff member last read an inbound message in a conversation
-- thread, enabling accurate unread-count computation without full-table scans.
ALTER TABLE "Message" ADD COLUMN "readByStaffAt" TIMESTAMP(3);

CREATE INDEX "Message_businessId_readByStaffAt_idx" ON "Message"("businessId", "readByStaffAt");
