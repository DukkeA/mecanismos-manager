-- CreateTable
CREATE TABLE "workshop"."Quote" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "groupId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "customerId" UUID NOT NULL,
    "orderId" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(250) NOT NULL,
    "terms" TEXT NOT NULL,
    "validUntil" DATE NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "approvedBy" VARCHAR(180),
    "approvalNote" TEXT,
    "approvedAt" TIMESTAMPTZ(3),
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."QuoteLine" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "description" VARCHAR(250) NOT NULL,
    "reference" VARCHAR(200) NOT NULL,
    "kind" "workshop"."ItemKind" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estimatedUnitCost" DECIMAL(18,2),
    "condition" "workshop"."PartCondition" NOT NULL DEFAULT 'NEW',
    "total" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."Sale" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "customerId" UUID NOT NULL,
    "orderId" UUID,
    "quoteId" UUID,
    "locationId" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ISSUED',
    "title" VARCHAR(250) NOT NULL,
    "terms" TEXT NOT NULL,
    "invoiceReference" VARCHAR(200) NOT NULL DEFAULT '',
    "issuedOn" DATE NOT NULL,
    "dueOn" DATE NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "actorId" UUID NOT NULL,
    "voidReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."SaleLine" (
    "id" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "movementId" UUID,
    "description" VARCHAR(250) NOT NULL,
    "reference" VARCHAR(200) NOT NULL,
    "kind" "workshop"."ItemKind" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "condition" "workshop"."PartCondition" NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "materialCost" DECIMAL(18,2),

    CONSTRAINT "SaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."CustomerPayment" (
    "refundOfId" UUID,
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."PaymentAllocation" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "actorId" UUID NOT NULL,
    "reversalOfId" UUID,
    "note" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."SaleReturn" (
    "id" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "occurredOn" DATE NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."SaleReturnLine" (
    "id" UUID NOT NULL,
    "returnId" UUID NOT NULL,
    "saleLineId" UUID NOT NULL,
    "movementId" UUID,
    "quantity" DECIMAL(14,3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "SaleReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quote_number_key" ON "workshop"."Quote"("number");

-- CreateIndex
CREATE INDEX "Quote_customerId_createdAt_idx" ON "workshop"."Quote"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Quote_orderId_idx" ON "workshop"."Quote"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_groupId_revision_key" ON "workshop"."Quote"("groupId", "revision");

-- CreateIndex
CREATE INDEX "QuoteLine_quoteId_idx" ON "workshop"."QuoteLine"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteLine_itemId_idx" ON "workshop"."QuoteLine"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_number_key" ON "workshop"."Sale"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_quoteId_key" ON "workshop"."Sale"("quoteId");

-- CreateIndex
CREATE INDEX "Sale_customerId_issuedOn_idx" ON "workshop"."Sale"("customerId", "issuedOn");

-- CreateIndex
CREATE INDEX "Sale_orderId_idx" ON "workshop"."Sale"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleLine_movementId_key" ON "workshop"."SaleLine"("movementId");

-- CreateIndex
CREATE INDEX "SaleLine_saleId_idx" ON "workshop"."SaleLine"("saleId");

-- CreateIndex
CREATE INDEX "SaleLine_itemId_idx" ON "workshop"."SaleLine"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPayment_entryId_key" ON "workshop"."CustomerPayment"("entryId");

-- CreateIndex
CREATE INDEX "CustomerPayment_refundOfId_idx" ON "workshop"."CustomerPayment"("refundOfId");

-- CreateIndex
CREATE INDEX "CustomerPayment_customerId_idx" ON "workshop"."CustomerPayment"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_reversalOfId_key" ON "workshop"."PaymentAllocation"("reversalOfId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_paymentId_idx" ON "workshop"."PaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_saleId_idx" ON "workshop"."PaymentAllocation"("saleId");

-- CreateIndex
CREATE INDEX "SaleReturn_saleId_idx" ON "workshop"."SaleReturn"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleReturnLine_movementId_key" ON "workshop"."SaleReturnLine"("movementId");

-- CreateIndex
CREATE INDEX "SaleReturnLine_returnId_idx" ON "workshop"."SaleReturnLine"("returnId");

-- CreateIndex
CREATE INDEX "SaleReturnLine_saleLineId_idx" ON "workshop"."SaleReturnLine"("saleLineId");

-- AddForeignKey
ALTER TABLE "workshop"."Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "workshop"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."Quote" ADD CONSTRAINT "Quote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "workshop"."WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "workshop"."Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."QuoteLine" ADD CONSTRAINT "QuoteLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "workshop"."CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "workshop"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."Sale" ADD CONSTRAINT "Sale_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "workshop"."WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."Sale" ADD CONSTRAINT "Sale_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "workshop"."Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."Sale" ADD CONSTRAINT "Sale_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "workshop"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."SaleLine" ADD CONSTRAINT "SaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "workshop"."Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."SaleLine" ADD CONSTRAINT "SaleLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "workshop"."CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."SaleLine" ADD CONSTRAINT "SaleLine_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "workshop"."StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."CustomerPayment" ADD CONSTRAINT "CustomerPayment_refundOfId_fkey" FOREIGN KEY ("refundOfId") REFERENCES "workshop"."CustomerPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."CustomerPayment" ADD CONSTRAINT "CustomerPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "workshop"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."CustomerPayment" ADD CONSTRAINT "CustomerPayment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "workshop"."CashEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "workshop"."CustomerPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "workshop"."Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "workshop"."PaymentAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."SaleReturn" ADD CONSTRAINT "SaleReturn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "workshop"."Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."SaleReturnLine" ADD CONSTRAINT "SaleReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "workshop"."SaleReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."SaleReturnLine" ADD CONSTRAINT "SaleReturnLine_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "workshop"."SaleLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."SaleReturnLine" ADD CONSTRAINT "SaleReturnLine_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "workshop"."StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

REVOKE ALL ON workshop."Quote",workshop."QuoteLine",workshop."Sale",workshop."SaleLine",workshop."CustomerPayment",workshop."PaymentAllocation",workshop."SaleReturn",workshop."SaleReturnLine" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON workshop."Quote",workshop."Sale" TO workshop_runtime;
GRANT SELECT,INSERT ON workshop."QuoteLine",workshop."SaleLine",workshop."CustomerPayment",workshop."PaymentAllocation",workshop."SaleReturn",workshop."SaleReturnLine" TO workshop_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA workshop TO workshop_runtime;
ALTER TABLE workshop."Quote" ADD CONSTRAINT quote_valid CHECK(total>0 AND revision>0 AND status IN ('DRAFT','APPROVED','REJECTED'));
ALTER TABLE workshop."QuoteLine" ADD CONSTRAINT quote_line_valid CHECK(quantity>0 AND "unitPrice">=0 AND discount>=0 AND total>=0);
ALTER TABLE workshop."Sale" ADD CONSTRAINT sale_valid CHECK(total>0 AND "dueOn">="issuedOn" AND status IN ('ISSUED','VOID'));
ALTER TABLE workshop."SaleLine" ADD CONSTRAINT sale_line_valid CHECK(quantity>0 AND "unitPrice">=0 AND discount>=0 AND total>=0);
ALTER TABLE workshop."PaymentAllocation" ADD CONSTRAINT allocation_valid CHECK((amount>0 AND "reversalOfId" IS NULL) OR (amount<0 AND "reversalOfId" IS NOT NULL));
ALTER TABLE workshop."SaleReturn" ADD CONSTRAINT return_nonnegative CHECK(amount>=0);
ALTER TABLE workshop."SaleReturnLine" ADD CONSTRAINT return_line_valid CHECK(quantity>0 AND amount>=0);
