-- Dariltweens Nigeria Limited business extension
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED');
CREATE TYPE "SalesPaymentMethod" AS ENUM ('CASH','TRANSFER','POS','CHEQUE','OTHER');
CREATE TYPE "ChequeStatus" AS ENUM ('HELD','PRESENTED','CLEARED','BOUNCED','CANCELLED','REPLACED');
CREATE TYPE "StockMovementType" AS ENUM ('OPENING','SALE','ADJUSTMENT_IN','ADJUSTMENT_OUT','RETURN_IN','RETURN_OUT');

CREATE TABLE "Customer" (
  "id" TEXT NOT NULL,"customerCode" TEXT NOT NULL,"name" TEXT NOT NULL,"phone" TEXT,"email" TEXT,"address" TEXT,
  "creditLimit" DECIMAL(18,2) NOT NULL DEFAULT 0,"openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,"openingBalanceDate" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,"createdById" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Customer_customerCode_key" ON "Customer"("customerCode");
CREATE INDEX "Customer_name_idx" ON "Customer"("name");
CREATE INDEX "Customer_active_name_idx" ON "Customer"("active","name");

CREATE TABLE "InventoryItem" (
  "id" TEXT NOT NULL,"itemCode" TEXT NOT NULL,"name" TEXT NOT NULL,"category" TEXT,"baseUnit" TEXT NOT NULL DEFAULT 'KG',
  "costPrice" DECIMAL(18,4) NOT NULL DEFAULT 0,"sellingPrice" DECIMAL(18,4) NOT NULL DEFAULT 0,"reorderLevel" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "openingStock" DECIMAL(18,4) NOT NULL DEFAULT 0,"currentStock" DECIMAL(18,4) NOT NULL DEFAULT 0,"active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryItem_itemCode_key" ON "InventoryItem"("itemCode");
CREATE INDEX "InventoryItem_name_idx" ON "InventoryItem"("name");
CREATE INDEX "InventoryItem_active_name_idx" ON "InventoryItem"("active","name");

CREATE TABLE "ItemConversion" (
  "id" TEXT NOT NULL,"conversionCode" TEXT NOT NULL,"itemId" TEXT NOT NULL,"baseUnit" TEXT NOT NULL,"transactionUnit" TEXT NOT NULL,
  "converter" DECIMAL(18,4) NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"createdById" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ItemConversion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ItemConversion_conversionCode_key" ON "ItemConversion"("conversionCode");
CREATE UNIQUE INDEX "ItemConversion_itemId_transactionUnit_key" ON "ItemConversion"("itemId","transactionUnit");
CREATE INDEX "ItemConversion_itemId_active_idx" ON "ItemConversion"("itemId","active");

CREATE TABLE "SalesInvoice" (
  "id" TEXT NOT NULL,"invoiceNo" TEXT NOT NULL,"customerId" TEXT NOT NULL,"invoiceDate" TIMESTAMP(3) NOT NULL,"dueDate" TIMESTAMP(3),"termsDays" INTEGER NOT NULL DEFAULT 0,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',"subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,"discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,"totalAmount" DECIMAL(18,2) NOT NULL,"amountPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,"outstanding" DECIMAL(18,2) NOT NULL,
  "notes" TEXT,"salespersonId" TEXT,"createdById" TEXT NOT NULL,"cancelledById" TEXT,"cancelledAt" TIMESTAMP(3),"cancellationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesInvoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesInvoice_invoiceNo_key" ON "SalesInvoice"("invoiceNo");
CREATE INDEX "SalesInvoice_customerId_invoiceDate_idx" ON "SalesInvoice"("customerId","invoiceDate");
CREATE INDEX "SalesInvoice_status_dueDate_idx" ON "SalesInvoice"("status","dueDate");
CREATE INDEX "SalesInvoice_salespersonId_invoiceDate_idx" ON "SalesInvoice"("salespersonId","invoiceDate");

CREATE TABLE "SalesInvoiceLine" (
  "id" TEXT NOT NULL,"invoiceId" TEXT NOT NULL,"lineNo" INTEGER NOT NULL,"itemId" TEXT NOT NULL,"saleUnit" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,"converter" DECIMAL(18,4) NOT NULL,"stockQuantity" DECIMAL(18,4) NOT NULL,"unitPrice" DECIMAL(18,4) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,"vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,"grossAmount" DECIMAL(18,2) NOT NULL,
  CONSTRAINT "SalesInvoiceLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesInvoiceLine_invoiceId_lineNo_key" ON "SalesInvoiceLine"("invoiceId","lineNo");
CREATE INDEX "SalesInvoiceLine_itemId_idx" ON "SalesInvoiceLine"("itemId");

CREATE TABLE "CustomerCheque" (
  "id" TEXT NOT NULL,"chequeCode" TEXT NOT NULL,"invoiceId" TEXT NOT NULL,"customerId" TEXT NOT NULL,"chequeNo" TEXT NOT NULL,"drawerBank" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,"dateReceived" TIMESTAMP(3) NOT NULL,"chequeDate" TIMESTAMP(3) NOT NULL,"expectedPresentationDate" TIMESTAMP(3) NOT NULL,
  "datePresented" TIMESTAMP(3),"status" "ChequeStatus" NOT NULL DEFAULT 'HELD',"companyBank" TEXT,"dateCleared" TIMESTAMP(3),"dateBounced" TIMESTAMP(3),
  "bounceReason" TEXT,"dateCancelled" TIMESTAMP(3),"cancellationReason" TEXT,"replacementChequeId" TEXT,"remarks" TEXT,"createdById" TEXT NOT NULL,"updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerCheque_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerCheque_chequeCode_key" ON "CustomerCheque"("chequeCode");
CREATE UNIQUE INDEX "CustomerCheque_replacementChequeId_key" ON "CustomerCheque"("replacementChequeId");
CREATE UNIQUE INDEX "CustomerCheque_chequeNo_drawerBank_key" ON "CustomerCheque"("chequeNo","drawerBank");
CREATE INDEX "CustomerCheque_status_expectedPresentationDate_idx" ON "CustomerCheque"("status","expectedPresentationDate");
CREATE INDEX "CustomerCheque_customerId_dateReceived_idx" ON "CustomerCheque"("customerId","dateReceived");
CREATE INDEX "CustomerCheque_invoiceId_idx" ON "CustomerCheque"("invoiceId");

CREATE TABLE "SalesPayment" (
  "id" TEXT NOT NULL,"paymentNo" TEXT NOT NULL,"paymentDate" TIMESTAMP(3) NOT NULL,"customerId" TEXT NOT NULL,"invoiceId" TEXT,
  "amount" DECIMAL(18,2) NOT NULL,"method" "SalesPaymentMethod" NOT NULL,"bankAccount" TEXT,"reference" TEXT,"remarks" TEXT,"chequeId" TEXT,"receivedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "SalesPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesPayment_paymentNo_key" ON "SalesPayment"("paymentNo");
CREATE UNIQUE INDEX "SalesPayment_chequeId_key" ON "SalesPayment"("chequeId");
CREATE INDEX "SalesPayment_customerId_paymentDate_idx" ON "SalesPayment"("customerId","paymentDate");
CREATE INDEX "SalesPayment_invoiceId_paymentDate_idx" ON "SalesPayment"("invoiceId","paymentDate");

CREATE TABLE "SalesReceipt" (
  "id" TEXT NOT NULL,"receiptNo" TEXT NOT NULL,"receiptDate" TIMESTAMP(3) NOT NULL,"customerId" TEXT NOT NULL,"invoiceId" TEXT,"paymentId" TEXT,
  "amount" DECIMAL(18,2) NOT NULL,"paymentMethod" TEXT NOT NULL,"reference" TEXT,"remarks" TEXT,"issuedById" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesReceipt_receiptNo_key" ON "SalesReceipt"("receiptNo");
CREATE UNIQUE INDEX "SalesReceipt_paymentId_key" ON "SalesReceipt"("paymentId");
CREATE INDEX "SalesReceipt_customerId_receiptDate_idx" ON "SalesReceipt"("customerId","receiptDate");
CREATE INDEX "SalesReceipt_invoiceId_idx" ON "SalesReceipt"("invoiceId");

CREATE TABLE "StockMovement" (
  "id" TEXT NOT NULL,"movementNo" TEXT NOT NULL,"movementDate" TIMESTAMP(3) NOT NULL,"itemId" TEXT NOT NULL,"type" "StockMovementType" NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,"unit" TEXT NOT NULL,"converter" DECIMAL(18,4) NOT NULL DEFAULT 1,"baseQuantity" DECIMAL(18,4) NOT NULL,
  "referenceType" TEXT,"referenceId" TEXT,"referenceNo" TEXT,"remarks" TEXT,"createdById" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StockMovement_movementNo_key" ON "StockMovement"("movementNo");
CREATE INDEX "StockMovement_itemId_movementDate_idx" ON "StockMovement"("itemId","movementDate");
CREATE INDEX "StockMovement_referenceType_referenceId_idx" ON "StockMovement"("referenceType","referenceId");

CREATE TABLE "StockAdjustment" (
  "id" TEXT NOT NULL,"adjustmentNo" TEXT NOT NULL,"adjustmentDate" TIMESTAMP(3) NOT NULL,"reason" TEXT NOT NULL,"remarks" TEXT,"createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StockAdjustment_adjustmentNo_key" ON "StockAdjustment"("adjustmentNo");

CREATE TABLE "StockAdjustmentLine" (
  "id" TEXT NOT NULL,"adjustmentId" TEXT NOT NULL,"lineNo" INTEGER NOT NULL,"itemId" TEXT NOT NULL,"direction" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,"unit" TEXT NOT NULL,"converter" DECIMAL(18,4) NOT NULL DEFAULT 1,"baseQuantity" DECIMAL(18,4) NOT NULL,
  CONSTRAINT "StockAdjustmentLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StockAdjustmentLine_adjustmentId_lineNo_key" ON "StockAdjustmentLine"("adjustmentId","lineNo");
CREATE INDEX "StockAdjustmentLine_itemId_idx" ON "StockAdjustmentLine"("itemId");

ALTER TABLE "ItemConversion" ADD CONSTRAINT "ItemConversion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerCheque" ADD CONSTRAINT "CustomerCheque_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerCheque" ADD CONSTRAINT "CustomerCheque_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerCheque" ADD CONSTRAINT "CustomerCheque_replacementChequeId_fkey" FOREIGN KEY ("replacementChequeId") REFERENCES "CustomerCheque"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesPayment" ADD CONSTRAINT "SalesPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesPayment" ADD CONSTRAINT "SalesPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesPayment" ADD CONSTRAINT "SalesPayment_chequeId_fkey" FOREIGN KEY ("chequeId") REFERENCES "CustomerCheque"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesReceipt" ADD CONSTRAINT "SalesReceipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesReceipt" ADD CONSTRAINT "SalesReceipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesReceipt" ADD CONSTRAINT "SalesReceipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "SalesPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockAdjustmentLine" ADD CONSTRAINT "StockAdjustmentLine_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "StockAdjustment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockAdjustmentLine" ADD CONSTRAINT "StockAdjustmentLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
