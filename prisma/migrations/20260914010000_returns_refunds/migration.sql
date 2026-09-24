-- Dariltweens v5.7: customer/supplier returns, credit/debit notes and refunds
CREATE TYPE "ReturnCondition" AS ENUM ('RESALABLE','DAMAGED','EXPIRED','OTHER');

CREATE TABLE "SalesReturn" (
  "id" TEXT NOT NULL,
  "returnNo" TEXT NOT NULL,
  "returnDate" TIMESTAMP(3) NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "creditAmount" DECIMAL(18,2) NOT NULL,
  "appliedToReceivable" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "refundDue" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "refundedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesReturn_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesReturn_returnNo_key" ON "SalesReturn"("returnNo");
CREATE INDEX "SalesReturn_invoiceId_returnDate_idx" ON "SalesReturn"("invoiceId","returnDate");
CREATE INDEX "SalesReturn_customerId_returnDate_idx" ON "SalesReturn"("customerId","returnDate");

CREATE TABLE "SalesReturnLine" (
  "id" TEXT NOT NULL,
  "salesReturnId" TEXT NOT NULL,
  "invoiceLineId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "unit" TEXT NOT NULL,
  "converter" DECIMAL(18,4) NOT NULL,
  "baseQuantity" DECIMAL(18,4) NOT NULL,
  "condition" "ReturnCondition" NOT NULL,
  "creditAmount" DECIMAL(18,2) NOT NULL,
  CONSTRAINT "SalesReturnLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SalesReturnLine_invoiceLineId_idx" ON "SalesReturnLine"("invoiceLineId");
CREATE INDEX "SalesReturnLine_itemId_idx" ON "SalesReturnLine"("itemId");

CREATE TABLE "CustomerRefund" (
  "id" TEXT NOT NULL,
  "refundNo" TEXT NOT NULL,
  "refundDate" TIMESTAMP(3) NOT NULL,
  "salesReturnId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "bankId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "reference" TEXT,
  "remarks" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerRefund_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerRefund_refundNo_key" ON "CustomerRefund"("refundNo");
CREATE INDEX "CustomerRefund_customerId_refundDate_idx" ON "CustomerRefund"("customerId","refundDate");
CREATE INDEX "CustomerRefund_bankId_refundDate_idx" ON "CustomerRefund"("bankId","refundDate");

CREATE TABLE "PurchaseReturn" (
  "id" TEXT NOT NULL,
  "returnNo" TEXT NOT NULL,
  "returnDate" TIMESTAMP(3) NOT NULL,
  "billId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "debitAmount" DECIMAL(18,2) NOT NULL,
  "appliedToPayable" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "refundDue" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "refundedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseReturn_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PurchaseReturn_returnNo_key" ON "PurchaseReturn"("returnNo");
CREATE INDEX "PurchaseReturn_billId_returnDate_idx" ON "PurchaseReturn"("billId","returnDate");
CREATE INDEX "PurchaseReturn_supplierId_returnDate_idx" ON "PurchaseReturn"("supplierId","returnDate");

CREATE TABLE "PurchaseReturnLine" (
  "id" TEXT NOT NULL,
  "purchaseReturnId" TEXT NOT NULL,
  "billLineId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "unit" TEXT NOT NULL,
  "converter" DECIMAL(18,4) NOT NULL,
  "baseQuantity" DECIMAL(18,4) NOT NULL,
  "debitAmount" DECIMAL(18,2) NOT NULL,
  CONSTRAINT "PurchaseReturnLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PurchaseReturnLine_billLineId_idx" ON "PurchaseReturnLine"("billLineId");
CREATE INDEX "PurchaseReturnLine_itemId_idx" ON "PurchaseReturnLine"("itemId");

CREATE TABLE "SupplierRefund" (
  "id" TEXT NOT NULL,
  "refundNo" TEXT NOT NULL,
  "refundDate" TIMESTAMP(3) NOT NULL,
  "purchaseReturnId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "bankId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "reference" TEXT,
  "remarks" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierRefund_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupplierRefund_refundNo_key" ON "SupplierRefund"("refundNo");
CREATE INDEX "SupplierRefund_supplierId_refundDate_idx" ON "SupplierRefund"("supplierId","refundDate");
CREATE INDEX "SupplierRefund_bankId_refundDate_idx" ON "SupplierRefund"("bankId","refundDate");

ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesReturnLine" ADD CONSTRAINT "SalesReturnLine_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "SalesReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesReturnLine" ADD CONSTRAINT "SalesReturnLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerRefund" ADD CONSTRAINT "CustomerRefund_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "SalesReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerRefund" ADD CONSTRAINT "CustomerRefund_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerRefund" ADD CONSTRAINT "CustomerRefund_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "CompanyBank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_billId_fkey" FOREIGN KEY ("billId") REFERENCES "PurchaseBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReturnLine" ADD CONSTRAINT "PurchaseReturnLine_purchaseReturnId_fkey" FOREIGN KEY ("purchaseReturnId") REFERENCES "PurchaseReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseReturnLine" ADD CONSTRAINT "PurchaseReturnLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierRefund" ADD CONSTRAINT "SupplierRefund_purchaseReturnId_fkey" FOREIGN KEY ("purchaseReturnId") REFERENCES "PurchaseReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierRefund" ADD CONSTRAINT "SupplierRefund_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierRefund" ADD CONSTRAINT "SupplierRefund_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "CompanyBank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
