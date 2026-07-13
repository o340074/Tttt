-- CreateEnum
CREATE TYPE "DeliveryKind" AS ENUM ('auto', 'manual', 'replacement');

-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('available', 'reserved', 'sold');

-- CreateTable
CREATE TABLE "stock_items" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "payload" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "StockStatus" NOT NULL DEFAULT 'available',
    "reservedUntil" TIMESTAMP(3),
    "orderItemId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "stockItemId" UUID,
    "payload" TEXT NOT NULL,
    "deliveredBy" UUID,
    "deliveredAt" TIMESTAMP(3),
    "type" "DeliveryKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" UUID,
    "diff" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_items_variantId_status_idx" ON "stock_items"("variantId", "status");

-- CreateIndex
CREATE INDEX "stock_items_status_reservedUntil_idx" ON "stock_items"("status", "reservedUntil");

-- CreateIndex
CREATE INDEX "stock_items_orderItemId_idx" ON "stock_items"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_items_variantId_payloadHash_key" ON "stock_items"("variantId", "payloadHash");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_stockItemId_key" ON "deliveries"("stockItemId");

-- CreateIndex
CREATE INDEX "deliveries_orderItemId_idx" ON "deliveries"("orderItemId");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_deliveredBy_fkey" FOREIGN KEY ("deliveredBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
