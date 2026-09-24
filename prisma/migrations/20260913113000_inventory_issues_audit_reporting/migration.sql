-- Dariltweens v5.3: auditable non-sales inventory issues / write-offs
CREATE TYPE "InventoryIssueType" AS ENUM ('PR_SAMPLE','REGULATORY_CUSTOMS','EXPIRED_WRITE_OFF','DAMAGED_WRITE_OFF','OTHER_AUTHORIZED');

CREATE TABLE "InventoryIssue" (
  "id" TEXT NOT NULL,
  "issueNo" TEXT NOT NULL,
  "issueDate" TIMESTAMP(3) NOT NULL,
  "issueType" "InventoryIssueType" NOT NULL,
  "recipientAgency" TEXT,
  "authorizationRef" TEXT,
  "reason" TEXT NOT NULL,
  "remarks" TEXT,
  "totalCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryIssue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryIssue_issueNo_key" ON "InventoryIssue"("issueNo");
CREATE INDEX "InventoryIssue_issueDate_issueType_idx" ON "InventoryIssue"("issueDate", "issueType");

CREATE TABLE "InventoryIssueLine" (
  "id" TEXT NOT NULL,
  "issueId" TEXT NOT NULL,
  "lineNo" INTEGER NOT NULL,
  "itemId" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "unit" TEXT NOT NULL,
  "converter" DECIMAL(18,4) NOT NULL DEFAULT 1,
  "baseQuantity" DECIMAL(18,4) NOT NULL,
  "unitCost" DECIMAL(18,4) NOT NULL,
  "lineCost" DECIMAL(18,2) NOT NULL,
  CONSTRAINT "InventoryIssueLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryIssueLine_issueId_lineNo_key" ON "InventoryIssueLine"("issueId", "lineNo");
CREATE INDEX "InventoryIssueLine_itemId_idx" ON "InventoryIssueLine"("itemId");
ALTER TABLE "InventoryIssueLine" ADD CONSTRAINT "InventoryIssueLine_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "InventoryIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryIssueLine" ADD CONSTRAINT "InventoryIssueLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
