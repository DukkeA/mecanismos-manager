-- CreateTable
CREATE TABLE "workshop"."CommandReceipt" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "kind" VARCHAR(80) NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommandReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."StockMovement" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "condition" "workshop"."PartCondition" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "materialAmount" DECIMAL(18,2) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "actorId" UUID NOT NULL,
    "orderId" UUID,
    "reversalOfId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommandReceipt_actorId_createdAt_idx" ON "workshop"."CommandReceipt"("actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_reversalOfId_key" ON "workshop"."StockMovement"("reversalOfId");

-- CreateIndex
CREATE INDEX "StockMovement_itemId_locationId_createdAt_idx" ON "workshop"."StockMovement"("itemId", "locationId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_orderId_idx" ON "workshop"."StockMovement"("orderId");

-- CreateIndex
CREATE INDEX "StockMovement_actorId_createdAt_idx" ON "workshop"."StockMovement"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "workshop"."CommandReceipt" ADD CONSTRAINT "CommandReceipt_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "workshop"."Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "workshop"."CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."StockMovement" ADD CONSTRAINT "StockMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "workshop"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."StockMovement" ADD CONSTRAINT "StockMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "workshop"."Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."StockMovement" ADD CONSTRAINT "StockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "workshop"."WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."StockMovement" ADD CONSTRAINT "StockMovement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "workshop"."StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

REVOKE ALL ON ALL TABLES IN SCHEMA workshop FROM PUBLIC, anon, authenticated;
ALTER TABLE workshop."StockMovement" ADD CONSTRAINT movement_nonzero CHECK (quantity <> 0);
ALTER TABLE workshop."StockMovement" ADD CONSTRAINT movement_value_sign CHECK ((quantity > 0 AND "materialAmount" >= 0) OR (quantity < 0 AND "materialAmount" <= 0));
ALTER TABLE workshop."StockBalance" ADD CONSTRAINT empty_stock_zero_value CHECK (quantity <> 0 OR "materialCost" = 0);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='workshop_runtime') THEN CREATE ROLE workshop_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT; END IF;
END $$;
GRANT USAGE ON SCHEMA workshop TO workshop_runtime;
GRANT SELECT, INSERT, UPDATE ON workshop."Member", workshop."Location", workshop."Customer", workshop."Asset", workshop."WorkOrder", workshop."OrderAsset", workshop."Task", workshop."TaskAssignment", workshop."CatalogItem", workshop."Supplier", workshop."StockBalance" TO workshop_runtime;
GRANT SELECT, INSERT ON workshop."AuditEvent", workshop."StockMovement", workshop."CommandReceipt", workshop."Observation", workshop."TimeEntry", workshop."SupplierOffer" TO workshop_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA workshop TO workshop_runtime;
