-- Dariltweens v5.9 Internal Audit Centre
DO $$ BEGIN
  CREATE TYPE "AuditQueryStatus" AS ENUM ('OPEN','RESPONDED','RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "AuditSeverity" AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "AuditQuery" (
  "id" TEXT NOT NULL,
  "queryNo" TEXT NOT NULL,
  "auditLogId" TEXT,
  "entity" TEXT,
  "entityId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "severity" "AuditSeverity" NOT NULL DEFAULT 'MEDIUM',
  "status" "AuditQueryStatus" NOT NULL DEFAULT 'OPEN',
  "raisedById" TEXT NOT NULL,
  "response" TEXT,
  "respondedById" TEXT,
  "respondedAt" TIMESTAMP(3),
  "resolution" TEXT,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditQuery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuditQuery_queryNo_key" ON "AuditQuery"("queryNo");
CREATE INDEX IF NOT EXISTS "AuditQuery_status_createdAt_idx" ON "AuditQuery"("status","createdAt");
CREATE INDEX IF NOT EXISTS "AuditQuery_entity_entityId_idx" ON "AuditQuery"("entity","entityId");
CREATE INDEX IF NOT EXISTS "AuditQuery_auditLogId_idx" ON "AuditQuery"("auditLogId");
