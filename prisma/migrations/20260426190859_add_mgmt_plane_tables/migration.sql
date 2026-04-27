-- AlterTable
ALTER TABLE "MacroRun" ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "vmId" TEXT;

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "tier" TEXT NOT NULL DEFAULT 'TIER_1',
    "contactInfo" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GhostVm" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostnameOrIp" TEXT,
    "spVersion" TEXT,
    "profileId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "lastSeenAt" TIMESTAMP(3),
    "middleware" TEXT,
    "middlewareVer" TEXT,
    "bankAppName" TEXT,
    "bankAppVersion" TEXT,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GhostVm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "vmId" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "spVersion" TEXT NOT NULL,
    "totalCommands" INTEGER NOT NULL DEFAULT 0,
    "totalEvents" INTEGER NOT NULL DEFAULT 0,
    "remoteAddress" TEXT,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VmCommandLog" (
    "id" TEXT NOT NULL,
    "vmId" TEXT NOT NULL,
    "sessionId" TEXT,
    "hService" TEXT NOT NULL,
    "serviceClass" TEXT NOT NULL,
    "commandCode" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "response" JSONB,
    "result" INTEGER,
    "durationMs" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VmCommandLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VmHealthMetric" (
    "id" TEXT NOT NULL,
    "vmId" TEXT NOT NULL,
    "cpuPercent" DOUBLE PRECISION NOT NULL,
    "memoryMb" INTEGER NOT NULL,
    "diskMb" INTEGER NOT NULL,
    "spUptimeSec" INTEGER NOT NULL,
    "lastXfsCmd" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VmHealthMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MacroRunGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "macroId" TEXT NOT NULL,
    "vmIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MacroRunGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_name_key" ON "Tenant"("name");

-- CreateIndex
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GhostVm_vmId_key" ON "GhostVm"("vmId");

-- CreateIndex
CREATE INDEX "GhostVm_tenantId_idx" ON "GhostVm"("tenantId");

-- CreateIndex
CREATE INDEX "GhostVm_status_idx" ON "GhostVm"("status");

-- CreateIndex
CREATE INDEX "GhostVm_lastSeenAt_idx" ON "GhostVm"("lastSeenAt");

-- CreateIndex
CREATE INDEX "AgentSession_vmId_idx" ON "AgentSession"("vmId");

-- CreateIndex
CREATE INDEX "AgentSession_connectedAt_idx" ON "AgentSession"("connectedAt");

-- CreateIndex
CREATE INDEX "VmCommandLog_vmId_occurredAt_idx" ON "VmCommandLog"("vmId", "occurredAt");

-- CreateIndex
CREATE INDEX "VmCommandLog_commandCode_idx" ON "VmCommandLog"("commandCode");

-- CreateIndex
CREATE INDEX "VmHealthMetric_vmId_reportedAt_idx" ON "VmHealthMetric"("vmId", "reportedAt");

-- CreateIndex
CREATE INDEX "MacroRunGroup_macroId_idx" ON "MacroRunGroup"("macroId");

-- CreateIndex
CREATE INDEX "MacroRunGroup_status_idx" ON "MacroRunGroup"("status");

-- CreateIndex
CREATE INDEX "MacroRunGroup_startedAt_idx" ON "MacroRunGroup"("startedAt");

-- CreateIndex
CREATE INDEX "MacroRun_vmId_idx" ON "MacroRun"("vmId");

-- CreateIndex
CREATE INDEX "MacroRun_groupId_idx" ON "MacroRun"("groupId");

-- AddForeignKey
ALTER TABLE "MacroRun" ADD CONSTRAINT "MacroRun_vmId_fkey" FOREIGN KEY ("vmId") REFERENCES "GhostVm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MacroRun" ADD CONSTRAINT "MacroRun_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MacroRunGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GhostVm" ADD CONSTRAINT "GhostVm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_vmId_fkey" FOREIGN KEY ("vmId") REFERENCES "GhostVm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
