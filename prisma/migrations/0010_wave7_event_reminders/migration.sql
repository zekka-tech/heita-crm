-- Wave 7: events gain a reminderSentAt stamp so the send-reminders cron
-- can fan out push/email notifications without duplicating itself.

ALTER TABLE "Event"
ADD COLUMN "reminderSentAt" TIMESTAMP(3);

CREATE INDEX "Event_startsAt_isReminderOn_reminderSentAt_idx"
  ON "Event" ("startsAt", "isReminderOn", "reminderSentAt");
