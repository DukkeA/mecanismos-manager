-- CreateTable
CREATE TABLE "workshop"."MoneyAccount" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "openingBalance" DECIMAL(18,2) NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."Obligation" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "dueOn" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop"."CashEntry" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "obligationId" UUID,
    "amount" DECIMAL(18,2) NOT NULL,
    "direction" VARCHAR(3) NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "counterparty" VARCHAR(200) NOT NULL,
    "reference" VARCHAR(200) NOT NULL,
    "note" VARCHAR(1000) NOT NULL,
    "occurredOn" DATE NOT NULL,
    "actorId" UUID NOT NULL,
    "reversalOfId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MoneyAccount_name_key" ON "workshop"."MoneyAccount"("name");

-- CreateIndex
CREATE INDEX "Obligation_period_category_idx" ON "workshop"."Obligation"("period", "category");

-- CreateIndex
CREATE UNIQUE INDEX "CashEntry_reversalOfId_key" ON "workshop"."CashEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "CashEntry_accountId_occurredOn_idx" ON "workshop"."CashEntry"("accountId", "occurredOn");

-- CreateIndex
CREATE INDEX "CashEntry_obligationId_idx" ON "workshop"."CashEntry"("obligationId");

-- CreateIndex
CREATE INDEX "CashEntry_actorId_idx" ON "workshop"."CashEntry"("actorId");

-- AddForeignKey
ALTER TABLE "workshop"."CashEntry" ADD CONSTRAINT "CashEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "workshop"."MoneyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."CashEntry" ADD CONSTRAINT "CashEntry_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "workshop"."Obligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."CashEntry" ADD CONSTRAINT "CashEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "workshop"."Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."CashEntry" ADD CONSTRAINT "CashEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "workshop"."CashEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

REVOKE ALL ON ALL TABLES IN SCHEMA workshop FROM PUBLIC, anon, authenticated;
ALTER TABLE workshop."MoneyAccount" ADD CONSTRAINT nonnegative_account CHECK (balance >= 0 AND "openingBalance" >= 0);
ALTER TABLE workshop."Obligation" ADD CONSTRAINT positive_obligation CHECK (amount > 0);
ALTER TABLE workshop."Obligation" ADD CONSTRAINT obligation_category CHECK (category IN ('RENT','UTILITIES','PAYROLL','OTHER'));
ALTER TABLE workshop."CashEntry" ADD CONSTRAINT valid_cash_entry CHECK (amount > 0 AND direction IN ('IN','OUT'));
GRANT SELECT, INSERT, UPDATE ON workshop."MoneyAccount" TO workshop_runtime;
GRANT SELECT, INSERT ON workshop."Obligation",workshop."CashEntry" TO workshop_runtime;
