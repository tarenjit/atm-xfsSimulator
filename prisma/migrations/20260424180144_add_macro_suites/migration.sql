-- AlterTable
ALTER TABLE "MacroRun" ADD COLUMN     "suiteRunId" TEXT;

-- CreateTable
CREATE TABLE "MacroSuite" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "macroIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cron" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MacroSuite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MacroSuiteRun" (
    "id" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "MacroSuiteRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MacroSuite_name_key" ON "MacroSuite"("name");

-- CreateIndex
CREATE INDEX "MacroSuite_enabled_idx" ON "MacroSuite"("enabled");

-- CreateIndex
CREATE INDEX "MacroSuiteRun_suiteId_idx" ON "MacroSuiteRun"("suiteId");

-- CreateIndex
CREATE INDEX "MacroSuiteRun_status_idx" ON "MacroSuiteRun"("status");

-- CreateIndex
CREATE INDEX "MacroSuiteRun_startedAt_idx" ON "MacroSuiteRun"("startedAt");

-- CreateIndex
CREATE INDEX "MacroRun_suiteRunId_idx" ON "MacroRun"("suiteRunId");

-- AddForeignKey
ALTER TABLE "MacroRun" ADD CONSTRAINT "MacroRun_suiteRunId_fkey" FOREIGN KEY ("suiteRunId") REFERENCES "MacroSuiteRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MacroSuiteRun" ADD CONSTRAINT "MacroSuiteRun_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "MacroSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
