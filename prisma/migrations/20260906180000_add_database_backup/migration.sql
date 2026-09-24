CREATE TABLE "DatabaseBackup" (
    "id" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL DEFAULT 'raw',
    "deliveryType" TEXT NOT NULL DEFAULT 'authenticated',
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatabaseBackup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DatabaseBackup_file_key"
ON "DatabaseBackup"("file");

CREATE INDEX "DatabaseBackup_createdAt_idx"
ON "DatabaseBackup"("createdAt");
