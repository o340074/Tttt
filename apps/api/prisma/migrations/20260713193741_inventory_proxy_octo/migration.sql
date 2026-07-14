-- CreateEnum
CREATE TYPE "ProxyType" AS ENUM ('residential', 'mobile', 'isp', 'datacenter');

-- CreateEnum
CREATE TYPE "ProxyStatus" AS ENUM ('available', 'assigned', 'expired', 'disabled');

-- CreateEnum
CREATE TYPE "OctoProfileStatus" AS ENUM ('draft', 'ready', 'delivered');

-- CreateTable
CREATE TABLE "proxy_items" (
    "id" UUID NOT NULL,
    "type" "ProxyType" NOT NULL,
    "geo" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "credentials" TEXT NOT NULL,
    "credentialsHash" TEXT NOT NULL,
    "status" "ProxyStatus" NOT NULL DEFAULT 'available',
    "expiresAt" TIMESTAMP(3),
    "assignedJobId" UUID,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proxy_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "octo_profiles" (
    "id" UUID NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "proxyItemId" UUID,
    "jobId" UUID,
    "status" "OctoProfileStatus" NOT NULL DEFAULT 'draft',
    "exportRef" TEXT,
    "fingerprintRef" JSONB,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "octo_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proxy_items_credentialsHash_key" ON "proxy_items"("credentialsHash");

-- CreateIndex
CREATE UNIQUE INDEX "proxy_items_assignedJobId_key" ON "proxy_items"("assignedJobId");

-- CreateIndex
CREATE INDEX "proxy_items_status_idx" ON "proxy_items"("status");

-- CreateIndex
CREATE INDEX "proxy_items_type_geo_idx" ON "proxy_items"("type", "geo");

-- CreateIndex
CREATE UNIQUE INDEX "octo_profiles_jobId_key" ON "octo_profiles"("jobId");

-- CreateIndex
CREATE INDEX "octo_profiles_status_idx" ON "octo_profiles"("status");

-- AddForeignKey
ALTER TABLE "proxy_items" ADD CONSTRAINT "proxy_items_assignedJobId_fkey" FOREIGN KEY ("assignedJobId") REFERENCES "warming_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "octo_profiles" ADD CONSTRAINT "octo_profiles_proxyItemId_fkey" FOREIGN KEY ("proxyItemId") REFERENCES "proxy_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "octo_profiles" ADD CONSTRAINT "octo_profiles_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "warming_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
