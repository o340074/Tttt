-- CreateEnum
CREATE TYPE "WarrantyClaimType" AS ENUM ('replace', 'refund');

-- CreateEnum
CREATE TYPE "WarrantyClaimStatus" AS ENUM ('requested', 'approved', 'rejected', 'replaced', 'refunded');

-- CreateTable
CREATE TABLE "warranty_claims" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "orderItemId" UUID NOT NULL,
    "deliveryId" UUID,
    "requesterId" UUID NOT NULL,
    "type" "WarrantyClaimType" NOT NULL,
    "status" "WarrantyClaimStatus" NOT NULL DEFAULT 'requested',
    "reason" TEXT NOT NULL,
    "resolutionNote" TEXT,
    "resolvedById" UUID,
    "replacementDeliveryId" UUID,
    "warrantyExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "warranty_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warranty_claims_number_key" ON "warranty_claims"("number");

-- CreateIndex
CREATE INDEX "warranty_claims_requesterId_createdAt_idx" ON "warranty_claims"("requesterId", "createdAt");

-- CreateIndex
CREATE INDEX "warranty_claims_status_createdAt_idx" ON "warranty_claims"("status", "createdAt");

-- CreateIndex
CREATE INDEX "warranty_claims_orderItemId_idx" ON "warranty_claims"("orderItemId");

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum: warranty resolution notification kinds (E10)
ALTER TYPE "NotificationType" ADD VALUE 'warranty_replaced';
ALTER TYPE "NotificationType" ADD VALUE 'warranty_refunded';
ALTER TYPE "NotificationType" ADD VALUE 'warranty_rejected';
