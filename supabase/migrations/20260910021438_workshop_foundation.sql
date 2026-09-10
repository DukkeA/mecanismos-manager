-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "workshop";

-- CreateEnum
CREATE TYPE "workshop"."Role" AS ENUM ('ADMIN', 'OFFICE', 'MECHANIC');

-- CreateEnum
CREATE TYPE "workshop"."OrderPurpose" AS ENUM ('CUSTOMER_REPAIR', 'OWN_REBUILD', 'WARRANTY');

-- CreateEnum
CREATE TYPE "workshop"."OrderStatus" AS ENUM ('RECEIVED', 'DIAGNOSING', 'IN_PROGRESS', 'ON_HOLD', 'QUALITY_REVIEW', 'READY', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "workshop"."TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE');

-- CreateEnum
CREATE TYPE "workshop"."AssetKind" AS ENUM ('VEHICLE', 'COMPONENT');

-- CreateEnum
CREATE TYPE "workshop"."ItemKind" AS ENUM ('PART', 'SERVICE');

-- CreateEnum
CREATE TYPE "workshop"."PartCondition" AS ENUM ('NEW', 'USED', 'REBUILT');

-- CreateTable
CREATE TABLE "workshop"."Member" (
    "id" UUID NOT NULL,
    "authSubject" UUID,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "role" "workshop"."Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."Location" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."Customer" (
    "id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "document" VARCHAR(40),
    "phone" VARCHAR(40),
    "email" VARCHAR(254),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."Asset" (
    "id" UUID NOT NULL,
    "kind" "workshop"."AssetKind" NOT NULL,
    "description" VARCHAR(250) NOT NULL,
    "plate" VARCHAR(20),
    "serial" VARCHAR(120),
    "customerId" UUID,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."WorkOrder" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "purpose" "workshop"."OrderPurpose" NOT NULL,
    "status" "workshop"."OrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "title" VARCHAR(250) NOT NULL,
    "reportedProblem" TEXT NOT NULL,
    "authorization" TEXT,
    "customerId" UUID,
    "locationId" UUID NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."OrderAsset" (
    "orderId" UUID NOT NULL,
    "assetId" UUID NOT NULL,

    CONSTRAINT "OrderAsset_pkey" PRIMARY KEY ("orderId","assetId")
);

-- CreateTable
CREATE TABLE "workshop"."Task" (
    "id" UUID NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "status" "workshop"."TaskStatus" NOT NULL DEFAULT 'TODO',
    "orderId" UUID,
    "dueAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."TaskAssignment" (
    "taskId" UUID NOT NULL,
    "memberId" UUID NOT NULL,

    CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("taskId","memberId")
);

-- CreateTable
CREATE TABLE "workshop"."TimeEntry" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "minutes" INTEGER NOT NULL,
    "workedOn" DATE NOT NULL,
    "note" VARCHAR(1000) NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."Observation" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."CatalogItem" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "brand" VARCHAR(100),
    "kind" "workshop"."ItemKind" NOT NULL,
    "unit" VARCHAR(30) NOT NULL DEFAULT 'unidad',
    "serialized" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."Supplier" (
    "id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "phone" VARCHAR(40),

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."SupplierOffer" (
    "id" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "condition" "workshop"."PartCondition" NOT NULL,
    "unitCost" DECIMAL(18,2) NOT NULL,
    "reportedStock" VARCHAR(120),
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "evidence" VARCHAR(1000) NOT NULL,

    CONSTRAINT "SupplierOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."StockBalance" (
    "itemId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "condition" "workshop"."PartCondition" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "materialCost" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("itemId","locationId","condition")
);

-- CreateTable
CREATE TABLE "workshop"."AuditEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "entityId" UUID NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_authSubject_key" ON "workshop"."Member"("authSubject");

-- CreateIndex
CREATE UNIQUE INDEX "Member_email_key" ON "workshop"."Member"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Location_code_key" ON "workshop"."Location"("code");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "workshop"."Customer"("name");

-- CreateIndex
CREATE INDEX "Asset_plate_idx" ON "workshop"."Asset"("plate");

-- CreateIndex
CREATE INDEX "Asset_serial_idx" ON "workshop"."Asset"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_number_key" ON "workshop"."WorkOrder"("number");

-- CreateIndex
CREATE INDEX "WorkOrder_locationId_status_receivedAt_idx" ON "workshop"."WorkOrder"("locationId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "WorkOrder_customerId_receivedAt_idx" ON "workshop"."WorkOrder"("customerId", "receivedAt");

-- CreateIndex
CREATE INDEX "OrderAsset_assetId_idx" ON "workshop"."OrderAsset"("assetId");

-- CreateIndex
CREATE INDEX "Task_orderId_status_idx" ON "workshop"."Task"("orderId", "status");

-- CreateIndex
CREATE INDEX "TaskAssignment_memberId_idx" ON "workshop"."TaskAssignment"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "TimeEntry_idempotencyKey_key" ON "workshop"."TimeEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TimeEntry_memberId_workedOn_idx" ON "workshop"."TimeEntry"("memberId", "workedOn");

-- CreateIndex
CREATE INDEX "TimeEntry_taskId_idx" ON "workshop"."TimeEntry"("taskId");

-- CreateIndex
CREATE INDEX "Observation_orderId_createdAt_idx" ON "workshop"."Observation"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Observation_memberId_idx" ON "workshop"."Observation"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_code_key" ON "workshop"."CatalogItem"("code");

-- CreateIndex
CREATE INDEX "CatalogItem_name_idx" ON "workshop"."CatalogItem"("name");

-- CreateIndex
CREATE INDEX "SupplierOffer_itemId_supplierId_observedAt_idx" ON "workshop"."SupplierOffer"("itemId", "supplierId", "observedAt");

-- CreateIndex
CREATE INDEX "SupplierOffer_supplierId_idx" ON "workshop"."SupplierOffer"("supplierId");

-- CreateIndex
CREATE INDEX "StockBalance_locationId_idx" ON "workshop"."StockBalance"("locationId");

-- CreateIndex
CREATE INDEX "AuditEvent_entityId_createdAt_idx" ON "workshop"."AuditEvent"("entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "workshop"."AuditEvent"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "workshop"."Asset" ADD CONSTRAINT "Asset_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "workshop"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."WorkOrder" ADD CONSTRAINT "WorkOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "workshop"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."WorkOrder" ADD CONSTRAINT "WorkOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "workshop"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."OrderAsset" ADD CONSTRAINT "OrderAsset_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "workshop"."WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."OrderAsset" ADD CONSTRAINT "OrderAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "workshop"."Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."Task" ADD CONSTRAINT "Task_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "workshop"."WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."TaskAssignment" ADD CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "workshop"."Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."TaskAssignment" ADD CONSTRAINT "TaskAssignment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "workshop"."Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."TimeEntry" ADD CONSTRAINT "TimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "workshop"."Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."TimeEntry" ADD CONSTRAINT "TimeEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "workshop"."Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."Observation" ADD CONSTRAINT "Observation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "workshop"."WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."Observation" ADD CONSTRAINT "Observation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "workshop"."Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."SupplierOffer" ADD CONSTRAINT "SupplierOffer_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "workshop"."Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."SupplierOffer" ADD CONSTRAINT "SupplierOffer_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "workshop"."CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."StockBalance" ADD CONSTRAINT "StockBalance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "workshop"."CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."StockBalance" ADD CONSTRAINT "StockBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "workshop"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- All application access goes through authenticated server services.
REVOKE ALL ON SCHEMA workshop FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA workshop FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA workshop FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA workshop REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER TABLE workshop."Member" ADD CONSTRAINT member_email_normalized CHECK (email = lower(email));
ALTER TABLE workshop."TimeEntry" ADD CONSTRAINT time_minutes_valid CHECK (minutes BETWEEN 1 AND 1440);
ALTER TABLE workshop."StockBalance" ADD CONSTRAINT stock_nonnegative CHECK (quantity >= 0 AND reserved >= 0 AND reserved <= quantity AND "materialCost" >= 0);
ALTER TABLE workshop."SupplierOffer" ADD CONSTRAINT offer_cost_nonnegative CHECK ("unitCost" >= 0);
ALTER TABLE workshop."WorkOrder" ADD CONSTRAINT order_customer_required CHECK (purpose = 'OWN_REBUILD' OR "customerId" IS NOT NULL);
