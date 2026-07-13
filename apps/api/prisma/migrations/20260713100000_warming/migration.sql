-- CreateEnum
CREATE TYPE "WarmingJobStatus" AS ENUM ('queued', 'assigned', 'in_progress', 'qc', 'ready', 'delivered', 'on_hold', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "WarmingTaskStatus" AS ENUM ('pending', 'in_progress', 'done', 'skipped', 'blocked');

-- CreateEnum
CREATE TYPE "BundleStatus" AS ENUM ('assembling', 'qc', 'ready', 'delivered');

-- CreateEnum
CREATE TYPE "BundleComponentType" AS ENUM ('ACCOUNT', 'PROXY', 'OCTO_PROFILE', 'RECOVERY', 'SECRETS', 'GUIDE', 'WARRANTY');

-- AlterEnum
ALTER TYPE "DeliveryKind" ADD VALUE 'warm';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderItemDeliveryStatus" ADD VALUE 'queued';
ALTER TYPE "OrderItemDeliveryStatus" ADD VALUE 'assigned';
ALTER TYPE "OrderItemDeliveryStatus" ADD VALUE 'in_progress';
ALTER TYPE "OrderItemDeliveryStatus" ADD VALUE 'qc';
ALTER TYPE "OrderItemDeliveryStatus" ADD VALUE 'ready';
ALTER TYPE "OrderItemDeliveryStatus" ADD VALUE 'on_hold';
ALTER TYPE "OrderItemDeliveryStatus" ADD VALUE 'failed';
ALTER TYPE "OrderItemDeliveryStatus" ADD VALUE 'refunded';

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "bundleId" UUID;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "warmingPlanId" UUID;

-- CreateTable
CREATE TABLE "warming_plans" (
    "id" UUID NOT NULL,
    "goal" TEXT NOT NULL,
    "tier" TEXT,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "qcRules" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warming_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warming_stage_templates" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "expectedMinutes" INTEGER NOT NULL,
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "requiredComponents" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "warming_stage_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warming_jobs" (
    "id" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "planId" UUID,
    "planVersion" INTEGER NOT NULL,
    "goal" TEXT,
    "status" "WarmingJobStatus" NOT NULL DEFAULT 'queued',
    "assignedTo" UUID,
    "etaAt" TIMESTAMP(3),
    "slaDueAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "currentStage" INTEGER NOT NULL DEFAULT 0,
    "stageCount" INTEGER NOT NULL DEFAULT 0,
    "stagesSnapshot" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warming_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warming_tasks" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "stageTemplateId" UUID,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "expectedMinutes" INTEGER NOT NULL,
    "status" "WarmingTaskStatus" NOT NULL DEFAULT 'pending',
    "checklistState" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "operatorId" UUID,
    "attachments" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "warming_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_assets" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "payload" TEXT NOT NULL,
    "recovery" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundles" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "status" "BundleStatus" NOT NULL DEFAULT 'assembling',
    "assembledBy" UUID,
    "qcBy" UUID,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundle_components" (
    "id" UUID NOT NULL,
    "bundleId" UUID NOT NULL,
    "type" "BundleComponentType" NOT NULL,
    "refId" UUID,
    "payload" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bundle_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warming_plans_goal_isActive_idx" ON "warming_plans"("goal", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "warming_plans_goal_tier_version_key" ON "warming_plans"("goal", "tier", "version");

-- CreateIndex
CREATE INDEX "warming_stage_templates_planId_idx" ON "warming_stage_templates"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "warming_stage_templates_planId_order_key" ON "warming_stage_templates"("planId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "warming_jobs_orderItemId_key" ON "warming_jobs"("orderItemId");

-- CreateIndex
CREATE INDEX "warming_jobs_status_idx" ON "warming_jobs"("status");

-- CreateIndex
CREATE INDEX "warming_jobs_goal_status_idx" ON "warming_jobs"("goal", "status");

-- CreateIndex
CREATE INDEX "warming_jobs_assignedTo_idx" ON "warming_jobs"("assignedTo");

-- CreateIndex
CREATE INDEX "warming_tasks_jobId_idx" ON "warming_tasks"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "warming_tasks_jobId_order_key" ON "warming_tasks"("jobId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "account_assets_jobId_key" ON "account_assets"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "bundles_jobId_key" ON "bundles"("jobId");

-- CreateIndex
CREATE INDEX "bundle_components_bundleId_idx" ON "bundle_components"("bundleId");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_bundleId_key" ON "deliveries"("bundleId");

-- CreateIndex
CREATE INDEX "product_variants_warmingPlanId_idx" ON "product_variants"("warmingPlanId");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_warmingPlanId_fkey" FOREIGN KEY ("warmingPlanId") REFERENCES "warming_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "bundles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warming_stage_templates" ADD CONSTRAINT "warming_stage_templates_planId_fkey" FOREIGN KEY ("planId") REFERENCES "warming_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warming_jobs" ADD CONSTRAINT "warming_jobs_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warming_jobs" ADD CONSTRAINT "warming_jobs_planId_fkey" FOREIGN KEY ("planId") REFERENCES "warming_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warming_jobs" ADD CONSTRAINT "warming_jobs_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warming_tasks" ADD CONSTRAINT "warming_tasks_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "warming_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_assets" ADD CONSTRAINT "account_assets_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "warming_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundles" ADD CONSTRAINT "bundles_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "warming_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_components" ADD CONSTRAINT "bundle_components_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

