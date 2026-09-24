ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_OUT';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_IN';

CREATE TABLE "InventoryLocation" (
 "id" TEXT NOT NULL, "locationCode" TEXT NOT NULL, "name" TEXT NOT NULL, "address" TEXT, "contactPerson" TEXT, "phone" TEXT, "active" BOOLEAN NOT NULL DEFAULT true, "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "InventoryLocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryLocation_locationCode_key" ON "InventoryLocation"("locationCode");
CREATE INDEX "InventoryLocation_active_name_idx" ON "InventoryLocation"("active","name");

CREATE TABLE "InventoryLocationBalance" (
 "id" TEXT NOT NULL, "locationId" TEXT NOT NULL, "itemId" TEXT NOT NULL, "quantity" DECIMAL(18,4) NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "InventoryLocationBalance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryLocationBalance_locationId_itemId_key" ON "InventoryLocationBalance"("locationId","itemId");
CREATE INDEX "InventoryLocationBalance_itemId_quantity_idx" ON "InventoryLocationBalance"("itemId","quantity");
ALTER TABLE "InventoryLocationBalance" ADD CONSTRAINT "InventoryLocationBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryLocationBalance" ADD CONSTRAINT "InventoryLocationBalance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StockTransfer" (
 "id" TEXT NOT NULL, "transferNo" TEXT NOT NULL, "transferDate" TIMESTAMP(3) NOT NULL, "fromLocationId" TEXT NOT NULL, "toLocationId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'RECEIVED', "remarks" TEXT, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StockTransfer_transferNo_key" ON "StockTransfer"("transferNo");
CREATE INDEX "StockTransfer_transferDate_idx" ON "StockTransfer"("transferDate");
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "StockTransferLine" (
 "id" TEXT NOT NULL, "transferId" TEXT NOT NULL, "lineNo" INTEGER NOT NULL, "itemId" TEXT NOT NULL, "quantity" DECIMAL(18,4) NOT NULL, "unit" TEXT NOT NULL, "converter" DECIMAL(18,4) NOT NULL DEFAULT 1, "baseQuantity" DECIMAL(18,4) NOT NULL,
 CONSTRAINT "StockTransferLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StockTransferLine_transferId_lineNo_key" ON "StockTransferLine"("transferId","lineNo");
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesInvoiceLine" ADD COLUMN "locationId" TEXT;
ALTER TABLE "PurchaseBillLine" ADD COLUMN "locationId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN "locationId" TEXT;
ALTER TABLE "StockAdjustmentLine" ADD COLUMN "locationId" TEXT;
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseBillLine" ADD CONSTRAINT "PurchaseBillLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockAdjustmentLine" ADD CONSTRAINT "StockAdjustmentLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve all pre-v5.8 stock by placing it in a default location.
INSERT INTO "InventoryLocation" ("id","locationCode","name","active","createdAt","updatedAt") VALUES ('00000000-0000-0000-0000-000000000058','MAIN','Main / Unallocated Cold Room',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "InventoryLocationBalance" ("id","locationId","itemId","quantity","updatedAt")
SELECT md5(random()::text || "id"), '00000000-0000-0000-0000-000000000058', "id", "currentStock", CURRENT_TIMESTAMP FROM "InventoryItem" WHERE "currentStock" <> 0;
UPDATE "StockMovement" SET "locationId"='00000000-0000-0000-0000-000000000058' WHERE "locationId" IS NULL;
