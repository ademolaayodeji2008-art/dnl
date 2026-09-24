-- Dariltweens v6.0 Accounting, Controls and Management Expansion
DO $$ BEGIN CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AccountType" AS ENUM ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "JournalStatus" AS ENUM ('DRAFT','POSTED','REVERSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BankReconciliationStatus" AS ENUM ('DRAFT','COMPLETED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "MatchStatus" AS ENUM ('UNMATCHED','MATCHED','EXCLUDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT','ACTIVE','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ChecklistStatus" AS ENUM ('PENDING','COMPLETE','NOT_APPLICABLE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AuditExceptionStatus" AS ENUM ('OPEN','ACKNOWLEDGED','RESOLVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BatchStatus" AS ENUM ('ACTIVE','QUARANTINED','EXPIRED','DEPLETED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditHold" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "creditDays" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "AccountingPeriod" (
  "id" TEXT NOT NULL,"name" TEXT NOT NULL,"startDate" TIMESTAMP(3) NOT NULL,"endDate" TIMESTAMP(3) NOT NULL,
  "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',"closedById" TEXT,"closedAt" TIMESTAMP(3),"reopenedById" TEXT,"reopenedAt" TIMESTAMP(3),"closeNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccountingPeriod_name_key" ON "AccountingPeriod"("name");
CREATE INDEX IF NOT EXISTS "AccountingPeriod_startDate_endDate_idx" ON "AccountingPeriod"("startDate","endDate");
CREATE INDEX IF NOT EXISTS "AccountingPeriod_status_endDate_idx" ON "AccountingPeriod"("status","endDate");

CREATE TABLE IF NOT EXISTS "ChartAccount" (
  "id" TEXT NOT NULL,"accountCode" TEXT NOT NULL,"name" TEXT NOT NULL,"type" "AccountType" NOT NULL,"systemCode" TEXT,"parentId" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,
  "allowPosting" BOOLEAN NOT NULL DEFAULT true,"cashFlowGroup" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChartAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChartAccount_accountCode_key" ON "ChartAccount"("accountCode");
CREATE UNIQUE INDEX IF NOT EXISTS "ChartAccount_systemCode_key" ON "ChartAccount"("systemCode");
CREATE INDEX IF NOT EXISTS "ChartAccount_type_active_idx" ON "ChartAccount"("type","active");
DO $$ BEGIN ALTER TABLE "ChartAccount" ADD CONSTRAINT "ChartAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChartAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "JournalEntry" (
  "id" TEXT NOT NULL,"journalNo" TEXT NOT NULL,"journalDate" TIMESTAMP(3) NOT NULL,"description" TEXT NOT NULL,"referenceType" TEXT,"referenceId" TEXT,"referenceNo" TEXT,
  "status" "JournalStatus" NOT NULL DEFAULT 'POSTED',"createdById" TEXT NOT NULL,"postedById" TEXT,"postedAt" TIMESTAMP(3),"reversalOfId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_journalNo_key" ON "JournalEntry"("journalNo");
CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_reversalOfId_key" ON "JournalEntry"("reversalOfId");
CREATE INDEX IF NOT EXISTS "JournalEntry_journalDate_status_idx" ON "JournalEntry"("journalDate","status");
CREATE INDEX IF NOT EXISTS "JournalEntry_referenceType_referenceId_idx" ON "JournalEntry"("referenceType","referenceId");
DO $$ BEGIN ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "JournalLine" (
  "id" TEXT NOT NULL,"journalEntryId" TEXT NOT NULL,"lineNo" INTEGER NOT NULL,"accountId" TEXT NOT NULL,"debit" DECIMAL(18,2) NOT NULL DEFAULT 0,"credit" DECIMAL(18,2) NOT NULL DEFAULT 0,"narration" TEXT,
  CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "JournalLine_journalEntryId_lineNo_key" ON "JournalLine"("journalEntryId","lineNo");
CREATE INDEX IF NOT EXISTS "JournalLine_accountId_idx" ON "JournalLine"("accountId");
DO $$ BEGIN ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "BankReconciliation" (
  "id" TEXT NOT NULL,"reconciliationNo" TEXT NOT NULL,"bankId" TEXT NOT NULL,"statementStartDate" TIMESTAMP(3) NOT NULL,"statementEndDate" TIMESTAMP(3) NOT NULL,
  "statementOpeningBalance" DECIMAL(18,2) NOT NULL,"statementClosingBalance" DECIMAL(18,2) NOT NULL,"status" "BankReconciliationStatus" NOT NULL DEFAULT 'DRAFT',"notes" TEXT,
  "preparedById" TEXT NOT NULL,"completedById" TEXT,"completedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BankReconciliation_reconciliationNo_key" ON "BankReconciliation"("reconciliationNo");
CREATE INDEX IF NOT EXISTS "BankReconciliation_bankId_statementEndDate_idx" ON "BankReconciliation"("bankId","statementEndDate");
DO $$ BEGIN ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "CompanyBank"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "BankStatementEntry" (
  "id" TEXT NOT NULL,"reconciliationId" TEXT NOT NULL,"lineNo" INTEGER NOT NULL,"transactionDate" TIMESTAMP(3) NOT NULL,"description" TEXT NOT NULL,"reference" TEXT,
  "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,"credit" DECIMAL(18,2) NOT NULL DEFAULT 0,"balance" DECIMAL(18,2),"status" "MatchStatus" NOT NULL DEFAULT 'UNMATCHED',
  "matchedBankTransactionId" TEXT,"matchNote" TEXT,CONSTRAINT "BankStatementEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BankStatementEntry_reconciliationId_lineNo_key" ON "BankStatementEntry"("reconciliationId","lineNo");
CREATE INDEX IF NOT EXISTS "BankStatementEntry_status_transactionDate_idx" ON "BankStatementEntry"("status","transactionDate");
CREATE INDEX IF NOT EXISTS "BankStatementEntry_matchedBankTransactionId_idx" ON "BankStatementEntry"("matchedBankTransactionId");
DO $$ BEGIN ALTER TABLE "BankStatementEntry" ADD CONSTRAINT "BankStatementEntry_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "BankReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "BankStatementEntry" ADD CONSTRAINT "BankStatementEntry_matchedBankTransactionId_fkey" FOREIGN KEY ("matchedBankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "MonthEndChecklist" (
  "id" TEXT NOT NULL,"periodId" TEXT NOT NULL,"itemCode" TEXT NOT NULL,"title" TEXT NOT NULL,"status" "ChecklistStatus" NOT NULL DEFAULT 'PENDING',"notes" TEXT,
  "completedById" TEXT,"completedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MonthEndChecklist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MonthEndChecklist_periodId_itemCode_key" ON "MonthEndChecklist"("periodId","itemCode");
DO $$ BEGIN ALTER TABLE "MonthEndChecklist" ADD CONSTRAINT "MonthEndChecklist_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Budget" (
  "id" TEXT NOT NULL,"budgetNo" TEXT NOT NULL,"name" TEXT NOT NULL,"startDate" TIMESTAMP(3) NOT NULL,"endDate" TIMESTAMP(3) NOT NULL,"status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',"notes" TEXT,"createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Budget_budgetNo_key" ON "Budget"("budgetNo");
CREATE INDEX IF NOT EXISTS "Budget_status_startDate_endDate_idx" ON "Budget"("status","startDate","endDate");

CREATE TABLE IF NOT EXISTS "BudgetLine" (
  "id" TEXT NOT NULL,"budgetId" TEXT NOT NULL,"lineNo" INTEGER NOT NULL,"accountId" TEXT NOT NULL,"amount" DECIMAL(18,2) NOT NULL,"notes" TEXT,CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BudgetLine_budgetId_lineNo_key" ON "BudgetLine"("budgetId","lineNo");
CREATE INDEX IF NOT EXISTS "BudgetLine_accountId_idx" ON "BudgetLine"("accountId");
DO $$ BEGIN ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AuditException" (
  "id" TEXT NOT NULL,"exceptionNo" TEXT NOT NULL,"exceptionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"category" TEXT NOT NULL,"severity" "AuditSeverity" NOT NULL DEFAULT 'MEDIUM',
  "title" TEXT NOT NULL,"description" TEXT NOT NULL,"entity" TEXT,"entityId" TEXT,"auditLogId" TEXT,"status" "AuditExceptionStatus" NOT NULL DEFAULT 'OPEN',
  "acknowledgedById" TEXT,"acknowledgedAt" TIMESTAMP(3),"resolvedById" TEXT,"resolvedAt" TIMESTAMP(3),"resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "AuditException_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuditException_exceptionNo_key" ON "AuditException"("exceptionNo");
CREATE INDEX IF NOT EXISTS "AuditException_status_severity_exceptionDate_idx" ON "AuditException"("status","severity","exceptionDate");
CREATE INDEX IF NOT EXISTS "AuditException_entity_entityId_idx" ON "AuditException"("entity","entityId");

CREATE TABLE IF NOT EXISTS "InventoryBatch" (
  "id" TEXT NOT NULL,"batchCode" TEXT NOT NULL,"itemId" TEXT NOT NULL,"locationId" TEXT NOT NULL,"batchNo" TEXT NOT NULL,"manufactureDate" TIMESTAMP(3),"expiryDate" TIMESTAMP(3),
  "quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,"unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,"status" "BatchStatus" NOT NULL DEFAULT 'ACTIVE',"notes" TEXT,"createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryBatch_batchCode_key" ON "InventoryBatch"("batchCode");
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryBatch_itemId_locationId_batchNo_key" ON "InventoryBatch"("itemId","locationId","batchNo");
CREATE INDEX IF NOT EXISTS "InventoryBatch_expiryDate_status_idx" ON "InventoryBatch"("expiryDate","status");
CREATE INDEX IF NOT EXISTS "InventoryBatch_itemId_locationId_idx" ON "InventoryBatch"("itemId","locationId");
DO $$ BEGIN ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "UserSession" (
  "id" TEXT NOT NULL,"sessionKey" TEXT NOT NULL,"userId" TEXT NOT NULL,"userAgent" TEXT,"ipHint" TEXT,"lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,"revokedAt" TIMESTAMP(3),"revokeReason" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserSession_sessionKey_key" ON "UserSession"("sessionKey");
CREATE INDEX IF NOT EXISTS "UserSession_userId_revokedAt_idx" ON "UserSession"("userId","revokedAt");
CREATE INDEX IF NOT EXISTS "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");
DO $$ BEGIN ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ControlApproval" (
  "id" TEXT NOT NULL,"entityType" TEXT NOT NULL,"entityId" TEXT NOT NULL,"entityNo" TEXT,"amount" DECIMAL(18,2) NOT NULL,"threshold" DECIMAL(18,2) NOT NULL,"status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT NOT NULL,"approvedById" TEXT,"approvedAt" TIMESTAMP(3),"rejectedById" TEXT,"rejectedAt" TIMESTAMP(3),"comments" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "ControlApproval_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ControlApproval_status_entityType_createdAt_idx" ON "ControlApproval"("status","entityType","createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ControlApproval_entityType_entityId_key" ON "ControlApproval"("entityType","entityId");
