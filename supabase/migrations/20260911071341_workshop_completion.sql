-- AlterTable
ALTER TABLE "workshop"."Obligation" ADD COLUMN     "estimated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurringId" UUID;

-- CreateTable
CREATE TABLE "workshop"."Purchase" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "supplierId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "reference" VARCHAR(200) NOT NULL DEFAULT '',
    "orderedOn" DATE NOT NULL,
    "dueOn" DATE NOT NULL,
    "note" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."PurchaseLine" (
    "id" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "description" VARCHAR(250) NOT NULL,
    "condition" "workshop"."PartCondition" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "PurchaseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."PurchaseReceipt" (
    "id" UUID NOT NULL,
    "lineId" UUID NOT NULL,
    "movementId" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "occurredOn" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "originalId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."SupplierPayment" (
    "id" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."StockReservation" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "condition" "workshop"."PartCondition" NOT NULL,
    "orderId" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "actorId" UUID NOT NULL,
    "movementId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."StockTransfer" (
    "id" UUID NOT NULL,
    "outboundId" UUID NOT NULL,
    "inboundId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."LaborRate" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "effectiveOn" DATE NOT NULL,
    "hourlyCost" DECIMAL(18,2) NOT NULL,
    "note" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaborRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."WarrantyCase" (
    "id" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "originalOrderId" UUID,
    "assetId" UUID,
    "repairOrderId" UUID NOT NULL,
    "symptom" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL DEFAULT '',
    "decision" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "cause" VARCHAR(30) NOT NULL DEFAULT 'UNDETERMINED',
    "reviewerId" UUID,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."OrderCheck" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "result" VARCHAR(20) NOT NULL,
    "readings" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."OrderHandover" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "condition" TEXT NOT NULL,
    "inventory" TEXT NOT NULL,
    "acceptedBy" VARCHAR(180) NOT NULL,
    "note" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."AssetOwnership" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "previousCustomerId" UUID,
    "customerId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetOwnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."CashClosure" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "throughOn" DATE NOT NULL,
    "expected" DECIMAL(18,2) NOT NULL,
    "counted" DECIMAL(18,2) NOT NULL,
    "difference" DECIMAL(18,2) NOT NULL,
    "note" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "reopenedAt" TIMESTAMPTZ(3),
    "reopenReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashClosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."RecurringExpense" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."MonthCoverage" (
    "period" VARCHAR(7) NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthCoverage_pkey" PRIMARY KEY ("period")
);

-- CreateTable
CREATE TABLE "workshop"."InventoryCount" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "cutoffAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "rows" JSONB NOT NULL,
    "note" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "appliedAt" TIMESTAMPTZ(3),

    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."SerializedUnit" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "code" VARCHAR(120) NOT NULL,
    "serial" VARCHAR(120) NOT NULL DEFAULT '',
    "orderId" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'REBUILDING',
    "coreCost" DECIMAL(18,2) NOT NULL,
    "rebuildCost" DECIMAL(18,2),
    "saleId" UUID,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SerializedUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."Attachment" (
    "id" UUID NOT NULL,
    "entityType" VARCHAR(30) NOT NULL,
    "entityId" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "name" VARCHAR(250) NOT NULL,
    "mime" VARCHAR(100) NOT NULL,
    "bytes" INTEGER NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_number_key" ON "workshop"."Purchase"("number");

-- CreateIndex
CREATE INDEX "Purchase_supplierId_orderedOn_idx" ON "workshop"."Purchase"("supplierId", "orderedOn");

-- CreateIndex
CREATE INDEX "PurchaseLine_purchaseId_idx" ON "workshop"."PurchaseLine"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_movementId_key" ON "workshop"."PurchaseReceipt"("movementId");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_lineId_idx" ON "workshop"."PurchaseReceipt"("lineId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayment_entryId_key" ON "workshop"."SupplierPayment"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "StockReservation_movementId_key" ON "workshop"."StockReservation"("movementId");

-- CreateIndex
CREATE INDEX "StockReservation_orderId_status_idx" ON "workshop"."StockReservation"("orderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_outboundId_key" ON "workshop"."StockTransfer"("outboundId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_inboundId_key" ON "workshop"."StockTransfer"("inboundId");

-- CreateIndex
CREATE UNIQUE INDEX "LaborRate_memberId_effectiveOn_key" ON "workshop"."LaborRate"("memberId", "effectiveOn");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyCase_repairOrderId_key" ON "workshop"."WarrantyCase"("repairOrderId");

-- CreateIndex
CREATE INDEX "WarrantyCase_saleId_idx" ON "workshop"."WarrantyCase"("saleId");

-- CreateIndex
CREATE INDEX "OrderCheck_orderId_createdAt_idx" ON "workshop"."OrderCheck"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderHandover_orderId_kind_createdAt_idx" ON "workshop"."OrderHandover"("orderId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AssetOwnership_assetId_createdAt_idx" ON "workshop"."AssetOwnership"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX "CashClosure_accountId_throughOn_idx" ON "workshop"."CashClosure"("accountId", "throughOn");

-- CreateIndex
CREATE INDEX "InventoryCount_locationId_cutoffAt_idx" ON "workshop"."InventoryCount"("locationId", "cutoffAt");

-- CreateIndex
CREATE UNIQUE INDEX "SerializedUnit_code_key" ON "workshop"."SerializedUnit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SerializedUnit_orderId_key" ON "workshop"."SerializedUnit"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "SerializedUnit_saleId_key" ON "workshop"."SerializedUnit"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_path_key" ON "workshop"."Attachment"("path");

-- CreateIndex
CREATE INDEX "Attachment_entityType_entityId_createdAt_idx" ON "workshop"."Attachment"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Obligation_recurringId_period_key" ON "workshop"."Obligation"("recurringId", "period");

-- AddForeignKey
ALTER TABLE "workshop"."PurchaseLine" ADD CONSTRAINT "PurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "workshop"."Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "workshop"."PurchaseLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."SupplierPayment" ADD CONSTRAINT "SupplierPayment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "workshop"."Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Private operational tables.
REVOKE ALL ON workshop."Purchase" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON workshop."Purchase" TO workshop_runtime;
REVOKE ALL ON workshop."PurchaseLine" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON workshop."PurchaseLine" TO workshop_runtime;
REVOKE ALL ON workshop."PurchaseReceipt" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON workshop."PurchaseReceipt" TO workshop_runtime;
REVOKE ALL ON workshop."SupplierPayment" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON workshop."SupplierPayment" TO workshop_runtime;
REVOKE ALL ON workshop."StockReservation" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON workshop."StockReservation" TO workshop_runtime;
REVOKE ALL ON workshop."StockTransfer" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON workshop."StockTransfer" TO workshop_runtime;
REVOKE ALL ON workshop."LaborRate" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON workshop."LaborRate" TO workshop_runtime;
REVOKE ALL ON workshop."WarrantyCase" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON workshop."WarrantyCase" TO workshop_runtime;
REVOKE ALL ON workshop."OrderCheck" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON workshop."OrderCheck" TO workshop_runtime;
REVOKE ALL ON workshop."OrderHandover" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON workshop."OrderHandover" TO workshop_runtime;
REVOKE ALL ON workshop."AssetOwnership" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON workshop."AssetOwnership" TO workshop_runtime;
REVOKE ALL ON workshop."CashClosure" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON workshop."CashClosure" TO workshop_runtime;
REVOKE ALL ON workshop."RecurringExpense" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON workshop."RecurringExpense" TO workshop_runtime;
REVOKE ALL ON workshop."MonthCoverage" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON workshop."MonthCoverage" TO workshop_runtime;
REVOKE ALL ON workshop."InventoryCount" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON workshop."InventoryCount" TO workshop_runtime;
REVOKE ALL ON workshop."SerializedUnit" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON workshop."SerializedUnit" TO workshop_runtime;
REVOKE ALL ON workshop."Attachment" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON workshop."Attachment" TO workshop_runtime;
GRANT UPDATE ON workshop."Purchase" TO workshop_runtime;
GRANT UPDATE ON workshop."StockReservation" TO workshop_runtime;
GRANT UPDATE ON workshop."WarrantyCase" TO workshop_runtime;
GRANT UPDATE ON workshop."CashClosure" TO workshop_runtime;
GRANT UPDATE ON workshop."RecurringExpense" TO workshop_runtime;
GRANT UPDATE ON workshop."MonthCoverage" TO workshop_runtime;
GRANT UPDATE ON workshop."InventoryCount" TO workshop_runtime;
GRANT UPDATE ON workshop."SerializedUnit" TO workshop_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA workshop TO workshop_runtime;
ALTER TABLE workshop."Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES workshop."Supplier"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."Purchase" ADD CONSTRAINT "Purchase_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES workshop."Location"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."Purchase" ADD CONSTRAINT "Purchase_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES workshop."Member"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."PurchaseLine" ADD CONSTRAINT "PurchaseLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES workshop."CatalogItem"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES workshop."StockMovement"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_originalId_fkey" FOREIGN KEY ("originalId") REFERENCES workshop."PurchaseReceipt"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES workshop."Member"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."SupplierPayment" ADD CONSTRAINT "SupplierPayment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES workshop."CashEntry"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."StockReservation" ADD CONSTRAINT "StockReservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES workshop."CatalogItem"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."StockReservation" ADD CONSTRAINT "StockReservation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES workshop."Location"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."StockReservation" ADD CONSTRAINT "StockReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES workshop."WorkOrder"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."StockReservation" ADD CONSTRAINT "StockReservation_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES workshop."StockMovement"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."StockReservation" ADD CONSTRAINT "StockReservation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES workshop."Member"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."StockTransfer" ADD CONSTRAINT "StockTransfer_outboundId_fkey" FOREIGN KEY ("outboundId") REFERENCES workshop."StockMovement"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."StockTransfer" ADD CONSTRAINT "StockTransfer_inboundId_fkey" FOREIGN KEY ("inboundId") REFERENCES workshop."StockMovement"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."StockTransfer" ADD CONSTRAINT "StockTransfer_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES workshop."Member"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."LaborRate" ADD CONSTRAINT "LaborRate_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES workshop."Member"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."LaborRate" ADD CONSTRAINT "LaborRate_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES workshop."Member"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."WarrantyCase" ADD CONSTRAINT "WarrantyCase_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES workshop."Sale"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."WarrantyCase" ADD CONSTRAINT "WarrantyCase_originalOrderId_fkey" FOREIGN KEY ("originalOrderId") REFERENCES workshop."WorkOrder"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."WarrantyCase" ADD CONSTRAINT "WarrantyCase_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES workshop."Asset"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."WarrantyCase" ADD CONSTRAINT "WarrantyCase_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES workshop."WorkOrder"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."WarrantyCase" ADD CONSTRAINT "WarrantyCase_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES workshop."Member"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."WarrantyCase" ADD CONSTRAINT "WarrantyCase_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES workshop."Member"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."OrderCheck" ADD CONSTRAINT "OrderCheck_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES workshop."WorkOrder"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."OrderCheck" ADD CONSTRAINT "OrderCheck_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES workshop."Member"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."OrderHandover" ADD CONSTRAINT "OrderHandover_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES workshop."WorkOrder"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."OrderHandover" ADD CONSTRAINT "OrderHandover_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES workshop."Member"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."AssetOwnership" ADD CONSTRAINT "AssetOwnership_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES workshop."Asset"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."AssetOwnership" ADD CONSTRAINT "AssetOwnership_previousCustomerId_fkey" FOREIGN KEY ("previousCustomerId") REFERENCES workshop."Customer"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."AssetOwnership" ADD CONSTRAINT "AssetOwnership_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES workshop."Customer"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."AssetOwnership" ADD CONSTRAINT "AssetOwnership_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES workshop."Member"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."CashClosure" ADD CONSTRAINT "CashClosure_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES workshop."MoneyAccount"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."CashClosure" ADD CONSTRAINT "CashClosure_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES workshop."Member"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."InventoryCount" ADD CONSTRAINT "InventoryCount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES workshop."Location"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."InventoryCount" ADD CONSTRAINT "InventoryCount_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES workshop."Member"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."SerializedUnit" ADD CONSTRAINT "SerializedUnit_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES workshop."CatalogItem"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."SerializedUnit" ADD CONSTRAINT "SerializedUnit_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES workshop."Location"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."SerializedUnit" ADD CONSTRAINT "SerializedUnit_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES workshop."WorkOrder"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."SerializedUnit" ADD CONSTRAINT "SerializedUnit_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES workshop."Sale"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."SerializedUnit" ADD CONSTRAINT "SerializedUnit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES workshop."Member"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."Obligation" ADD CONSTRAINT "Obligation_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES workshop."RecurringExpense"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."RecurringExpense" ADD CONSTRAINT "RecurringExpense_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES workshop."Member"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."MonthCoverage" ADD CONSTRAINT "MonthCoverage_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES workshop."Member"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."Attachment" ADD CONSTRAINT "Attachment_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES workshop."Member"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."Purchase" ADD CONSTRAINT "Purchase_values" CHECK ("dueOn" >= "orderedOn" AND status IN ('OPEN','CLOSED','CANCELLED'));
ALTER TABLE workshop."PurchaseLine" ADD CONSTRAINT "PurchaseLine_values" CHECK (quantity > 0 AND "unitCost" >= 0);
ALTER TABLE workshop."PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_values" CHECK (quantity <> 0 AND (quantity > 0) = (amount >= 0));
ALTER TABLE workshop."StockReservation" ADD CONSTRAINT "StockReservation_values" CHECK (quantity > 0 AND status IN ('ACTIVE','RELEASED','CONSUMED'));
ALTER TABLE workshop."LaborRate" ADD CONSTRAINT "LaborRate_values" CHECK ("hourlyCost" >= 0);
ALTER TABLE workshop."RecurringExpense" ADD CONSTRAINT "RecurringExpense_values" CHECK (amount > 0 AND "dueDay" BETWEEN 1 AND 31);
ALTER TABLE workshop."OrderCheck" ADD CONSTRAINT "OrderCheck_values" CHECK (result IN ('PASS','FAIL'));
ALTER TABLE workshop."OrderHandover" ADD CONSTRAINT "OrderHandover_values" CHECK (kind IN ('RECEPTION','DELIVERY'));

CREATE FUNCTION workshop.protect_closed_cash() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM workshop."CashClosure" WHERE "accountId"=NEW."accountId" AND "reopenedAt" IS NULL AND "throughOn">=NEW."occurredOn") THEN
  RAISE EXCEPTION 'La fecha pertenece a un cierre de caja. Reabre el cierre antes de registrar cambios.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cash_closed_period BEFORE INSERT ON workshop."CashEntry" FOR EACH ROW EXECUTE FUNCTION workshop.protect_closed_cash();
