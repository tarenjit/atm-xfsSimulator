-- CreateTable
CREATE TABLE "AtmProfile" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtmProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AtmProfile_code_key" ON "AtmProfile"("code");

-- CreateIndex
CREATE INDEX "AtmProfile_vendor_idx" ON "AtmProfile"("vendor");

-- CreateIndex
CREATE INDEX "AtmProfile_isDefault_idx" ON "AtmProfile"("isDefault");
