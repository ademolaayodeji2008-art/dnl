ALTER TABLE "VoucherAttachment"
ADD COLUMN "attachmentType" TEXT NOT NULL DEFAULT 'SUPPORTING';

CREATE INDEX "VoucherAttachment_voucherId_attachmentType_idx"
ON "VoucherAttachment"("voucherId", "attachmentType");
