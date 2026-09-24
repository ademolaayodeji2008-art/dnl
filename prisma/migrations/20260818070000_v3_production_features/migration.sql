
CREATE TABLE "CompanySetting" (
  "key" TEXT NOT NULL,
  "value" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanySetting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "VoucherAttachment" (
  "id" TEXT NOT NULL,
  "voucherId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "mimeType" TEXT,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoucherAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoucherAttachment_voucherId_idx" ON "VoucherAttachment"("voucherId");
ALTER TABLE "VoucherAttachment" ADD CONSTRAINT "VoucherAttachment_voucherId_fkey"
FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoucherAttachment" ADD CONSTRAINT "VoucherAttachment_uploadedById_fkey"
FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
