ALTER TABLE workshop."Customer" ADD COLUMN "deletedAt" timestamptz(3);
ALTER TABLE workshop."Supplier" ADD COLUMN email varchar(254), ADD COLUMN address varchar(300), ADD COLUMN "deletedAt" timestamptz(3);
CREATE INDEX "Customer_active_name_idx" ON workshop."Customer" (name) WHERE "deletedAt" IS NULL;
CREATE INDEX "Supplier_active_name_idx" ON workshop."Supplier" (name) WHERE "deletedAt" IS NULL;
-- Existing RLS and grants remain in force; no records or financial movements are removed.
