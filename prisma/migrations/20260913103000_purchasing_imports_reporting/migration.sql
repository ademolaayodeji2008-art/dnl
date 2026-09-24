ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'PURCHASE';
ALTER TYPE "BankTransactionType" ADD VALUE IF NOT EXISTS 'TRANSFER_IN';
ALTER TYPE "BankTransactionType" ADD VALUE IF NOT EXISTS 'TRANSFER_OUT';

DO $$ BEGIN
  CREATE TYPE "PurchaseBillStatus" AS ENUM ('POSTED','PARTIALLY_PAID','PAID','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Supplier" (
  "id" TEXT NOT NULL,
  "supplierCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "openingBalanceDate" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_supplierCode_key" ON "Supplier"("supplierCode");
CREATE INDEX IF NOT EXISTS "Supplier_name_idx" ON "Supplier"("name");
CREATE INDEX IF NOT EXISTS "Supplier_active_name_idx" ON "Supplier"("active","name");

CREATE TABLE IF NOT EXISTS "PurchaseBill" (
  "id" TEXT NOT NULL,
  "billNo" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "supplierInvoiceNo" TEXT,
  "billDate" TIMESTAMP(3) NOT NULL,
  "dueDate" TIMESTAMP(3),
  "status" "PurchaseBillStatus" NOT NULL DEFAULT 'POSTED',
  "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(18,2) NOT NULL,
  "amountPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "outstanding" DECIMAL(18,2) NOT NULL,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "cancelledById" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseBill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseBill_billNo_key" ON "PurchaseBill"("billNo");
CREATE INDEX IF NOT EXISTS "PurchaseBill_supplierId_billDate_idx" ON "PurchaseBill"("supplierId","billDate");
CREATE INDEX IF NOT EXISTS "PurchaseBill_status_dueDate_idx" ON "PurchaseBill"("status","dueDate");

CREATE TABLE IF NOT EXISTS "PurchaseBillLine" (
  "id" TEXT NOT NULL,
  "billId" TEXT NOT NULL,
  "lineNo" INTEGER NOT NULL,
  "itemId" TEXT NOT NULL,
  "purchaseUnit" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "converter" DECIMAL(18,4) NOT NULL DEFAULT 1,
  "stockQuantity" DECIMAL(18,4) NOT NULL,
  "unitCost" DECIMAL(18,4) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "grossAmount" DECIMAL(18,2) NOT NULL,
  CONSTRAINT "PurchaseBillLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseBillLine_billId_lineNo_key" ON "PurchaseBillLine"("billId","lineNo");
CREATE INDEX IF NOT EXISTS "PurchaseBillLine_itemId_idx" ON "PurchaseBillLine"("itemId");

CREATE TABLE IF NOT EXISTS "PurchasePayment" (
  "id" TEXT NOT NULL,
  "paymentNo" TEXT NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "supplierId" TEXT NOT NULL,
  "billId" TEXT,
  "bankId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "reference" TEXT,
  "remarks" TEXT,
  "paidById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchasePayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PurchasePayment_paymentNo_key" ON "PurchasePayment"("paymentNo");
CREATE INDEX IF NOT EXISTS "PurchasePayment_supplierId_paymentDate_idx" ON "PurchasePayment"("supplierId","paymentDate");
CREATE INDEX IF NOT EXISTS "PurchasePayment_billId_paymentDate_idx" ON "PurchasePayment"("billId","paymentDate");
CREATE INDEX IF NOT EXISTS "PurchasePayment_bankId_paymentDate_idx" ON "PurchasePayment"("bankId","paymentDate");

DO $$ BEGIN
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
ALTER TABLE "PurchaseBillLine" ADD CONSTRAINT "PurchaseBillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "PurchaseBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
ALTER TABLE "PurchaseBillLine" ADD CONSTRAINT "PurchaseBillLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "PurchaseBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "CompanyBank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
