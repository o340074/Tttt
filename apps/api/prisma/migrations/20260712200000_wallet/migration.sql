-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('credit', 'debit');

-- CreateEnum
CREATE TYPE "LedgerRefType" AS ENUM ('topup', 'order', 'refund', 'adjustment', 'replacement');

-- CreateEnum
CREATE TYPE "TopUpStatus" AS ENUM ('pending', 'paid', 'expired', 'failed');

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balanceAfter" DECIMAL(18,2) NOT NULL,
    "refType" "LedgerRefType" NOT NULL,
    "refId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topups" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "asset" TEXT NOT NULL,
    "fee" DECIMAL(18,2),
    "status" "TopUpStatus" NOT NULL DEFAULT 'pending',
    "paymentUrl" TEXT,
    "address" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "topups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "userId" UUID,
    "endpoint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseCode" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_entries_userId_createdAt_idx" ON "ledger_entries"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_refType_refId_direction_key" ON "ledger_entries"("refType", "refId", "direction");

-- CreateIndex
CREATE UNIQUE INDEX "topups_externalId_key" ON "topups"("externalId");

-- CreateIndex
CREATE INDEX "topups_userId_createdAt_idx" ON "topups"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "topups_status_expiresAt_idx" ON "topups"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "idempotency_keys_createdAt_idx" ON "idempotency_keys"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_key_endpoint_key" ON "idempotency_keys"("key", "endpoint");

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topups" ADD CONSTRAINT "topups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
