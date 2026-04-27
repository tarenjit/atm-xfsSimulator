-- CreateTable
CREATE TABLE "HostTransportConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "bindAddress" TEXT NOT NULL DEFAULT '127.0.0.1',
    "port" INTEGER NOT NULL,
    "switchProfile" TEXT NOT NULL DEFAULT 'JALIN',
    "tlsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostTransportConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HostTransportConfig_name_key" ON "HostTransportConfig"("name");

-- CreateIndex
CREATE INDEX "HostTransportConfig_kind_idx" ON "HostTransportConfig"("kind");

-- CreateIndex
CREATE INDEX "HostTransportConfig_enabled_idx" ON "HostTransportConfig"("enabled");
