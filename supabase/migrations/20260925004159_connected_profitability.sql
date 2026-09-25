-- Additive: existing financial history remains intact. Existing table RLS applies.
ALTER TABLE workshop."Obligation" ADD COLUMN "orderId" uuid REFERENCES workshop."WorkOrder"(id) ON DELETE RESTRICT;
ALTER TABLE workshop."CashEntry" ADD COLUMN "orderId" uuid REFERENCES workshop."WorkOrder"(id) ON DELETE RESTRICT;
CREATE INDEX "Obligation_orderId_idx" ON workshop."Obligation"("orderId");
CREATE INDEX "CashEntry_orderId_idx" ON workshop."CashEntry"("orderId");
ALTER TABLE workshop."SaleLine" ADD COLUMN "laborCost" numeric(18,2), ADD COLUMN "expenseCost" numeric(18,2);
ALTER TABLE workshop."SerializedUnit" ADD COLUMN "rebuildLaborCost" numeric(18,2), ADD COLUMN "rebuildExpenseCost" numeric(18,2);
-- A legacy unit has a known total but an unknown split. Do not fabricate historical labor.
ALTER TABLE workshop."SaleLine" ADD CONSTRAINT "SaleLine_cost_split_check" CHECK (
  ("laborCost" IS NULL OR "laborCost" >= 0) AND ("expenseCost" IS NULL OR "expenseCost" >= 0)
);
