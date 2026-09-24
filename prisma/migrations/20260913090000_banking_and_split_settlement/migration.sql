CREATE TYPE "BankTransactionType" AS ENUM ('OPENING', 'DEPOSIT', 'WITHDRAWAL');

CREATE TABLE "CompanyBank" (
  "id" TEXT NOT NULL,
  "bankCode" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "currentBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyBank_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankTransaction" (
  "id" TEXT NOT NULL,
  "transactionNo" TEXT NOT NULL,
  "transactionDate" TIMESTAMP(3) NOT NULL,
  "bankId" TEXT NOT NULL,
  "type" "BankTransactionType" NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "referenceNo" TEXT,
  "narration" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SalesPayment" ADD COLUMN "bankId" TEXT;
ALTER TABLE "CustomerCheque" ADD COLUMN "companyBankId" TEXT;

CREATE UNIQUE INDEX "CompanyBank_bankCode_key" ON "CompanyBank"("bankCode");
CREATE UNIQUE INDEX "CompanyBank_accountNumber_key" ON "CompanyBank"("accountNumber");
CREATE INDEX "CompanyBank_active_bankName_idx" ON "CompanyBank"("active", "bankName");
CREATE UNIQUE INDEX "BankTransaction_transactionNo_key" ON "BankTransaction"("transactionNo");
CREATE INDEX "BankTransaction_bankId_transactionDate_idx" ON "BankTransaction"("bankId", "transactionDate");
CREATE INDEX "BankTransaction_referenceType_referenceId_idx" ON "BankTransaction"("referenceType", "referenceId");
CREATE INDEX "SalesPayment_bankId_paymentDate_idx" ON "SalesPayment"("bankId", "paymentDate");
CREATE INDEX "CustomerCheque_companyBankId_idx" ON "CustomerCheque"("companyBankId");

ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "CompanyBank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesPayment" ADD CONSTRAINT "SalesPayment_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "CompanyBank"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerCheque" ADD CONSTRAINT "CustomerCheque_companyBankId_fkey" FOREIGN KEY ("companyBankId") REFERENCES "CompanyBank"("id") ON DELETE SET NULL ON UPDATE CASCADE;
