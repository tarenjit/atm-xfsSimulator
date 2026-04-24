-- CreateTable
CREATE TABLE "Macro" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "folder" TEXT,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "steps" JSONB NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Macro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MacroRun" (
    "id" TEXT NOT NULL,
    "macroId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentStep" INTEGER,
    "stepResults" JSONB NOT NULL DEFAULT '[]',
    "evidence" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "MacroRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Macro_folder_idx" ON "Macro"("folder");

-- CreateIndex
CREATE INDEX "Macro_name_idx" ON "Macro"("name");

-- CreateIndex
CREATE INDEX "MacroRun_macroId_idx" ON "MacroRun"("macroId");

-- CreateIndex
CREATE INDEX "MacroRun_status_idx" ON "MacroRun"("status");

-- CreateIndex
CREATE INDEX "MacroRun_startedAt_idx" ON "MacroRun"("startedAt");

-- AddForeignKey
ALTER TABLE "MacroRun" ADD CONSTRAINT "MacroRun_macroId_fkey" FOREIGN KEY ("macroId") REFERENCES "Macro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
