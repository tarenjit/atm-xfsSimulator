-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "balance" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "dailyLimit" BIGINT NOT NULL DEFAULT 10000000,
    "dailyWithdrawn" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirtualCard" (
    "pan" TEXT NOT NULL,
    "cardholderName" TEXT NOT NULL,
    "expiryDate" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "track1" TEXT NOT NULL,
    "track2" TEXT NOT NULL,
    "issuer" TEXT NOT NULL DEFAULT 'ZEGEN',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "failedPinCount" INTEGER NOT NULL DEFAULT 0,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VirtualCard_pkey" PRIMARY KEY ("pan")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "pan" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "txnType" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "status" TEXT NOT NULL,
    "stanNo" TEXT,
    "authCode" TEXT,
    "responseCode" TEXT,
    "errorReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XfsCommandLog" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "hService" TEXT NOT NULL,
    "serviceClass" TEXT NOT NULL,
    "commandCode" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "response" JSONB,
    "result" INTEGER,
    "errorDetail" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XfsCommandLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XfsEventLog" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "hService" TEXT NOT NULL,
    "serviceClass" TEXT NOT NULL,
    "eventCode" TEXT NOT NULL,
    "eventClass" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XfsEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashUnit" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "denomination" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "status" TEXT NOT NULL DEFAULT 'OK',
    "count" INTEGER NOT NULL,
    "initialCount" INTEGER NOT NULL,
    "maximum" INTEGER NOT NULL,
    "minimum" INTEGER NOT NULL,
    "rejectCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtmSession" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pan" TEXT,
    "accountId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,

    CONSTRAINT "AtmSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_accountNumber_key" ON "Account"("accountNumber");

-- CreateIndex
CREATE INDEX "Account_accountNumber_idx" ON "Account"("accountNumber");

-- CreateIndex
CREATE INDEX "Account_status_idx" ON "Account"("status");

-- CreateIndex
CREATE INDEX "VirtualCard_status_idx" ON "VirtualCard"("status");

-- CreateIndex
CREATE INDEX "VirtualCard_accountId_idx" ON "VirtualCard"("accountId");

-- CreateIndex
CREATE INDEX "Transaction_pan_idx" ON "Transaction"("pan");

-- CreateIndex
CREATE INDEX "Transaction_sessionId_idx" ON "Transaction"("sessionId");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_accountId_status_createdAt_idx" ON "Transaction"("accountId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "XfsCommandLog_sessionId_idx" ON "XfsCommandLog"("sessionId");

-- CreateIndex
CREATE INDEX "XfsCommandLog_commandCode_idx" ON "XfsCommandLog"("commandCode");

-- CreateIndex
CREATE INDEX "XfsCommandLog_createdAt_idx" ON "XfsCommandLog"("createdAt");

-- CreateIndex
CREATE INDEX "XfsEventLog_sessionId_idx" ON "XfsEventLog"("sessionId");

-- CreateIndex
CREATE INDEX "XfsEventLog_eventCode_idx" ON "XfsEventLog"("eventCode");

-- CreateIndex
CREATE INDEX "XfsEventLog_createdAt_idx" ON "XfsEventLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashUnit_unitId_key" ON "CashUnit"("unitId");

-- CreateIndex
CREATE INDEX "AtmSession_pan_idx" ON "AtmSession"("pan");

-- CreateIndex
CREATE INDEX "AtmSession_startedAt_idx" ON "AtmSession"("startedAt");

-- AddForeignKey
ALTER TABLE "VirtualCard" ADD CONSTRAINT "VirtualCard_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
