-- AddColumn: User.pendingEmail
-- Stores an unverified email address while the user has a pending verification
-- link in their inbox. The live email field is only updated after click-through.
ALTER TABLE "User" ADD COLUMN "pendingEmail" TEXT;
