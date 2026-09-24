ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'PENDING_VERIFICATION';

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "AccountToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccountToken_tokenHash_key" ON "AccountToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "AccountToken_userId_type_idx" ON "AccountToken"("userId","type");
CREATE INDEX IF NOT EXISTS "AccountToken_expiresAt_idx" ON "AccountToken"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
