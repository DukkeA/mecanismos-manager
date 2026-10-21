-- Quick purchases reuse the expense ledger, so costs and payments are counted once.
ALTER TABLE workshop."Obligation" ADD COLUMN "purchaseDetails" jsonb;
ALTER TABLE workshop."Obligation" ADD CONSTRAINT quick_purchase_is_general_expense
  CHECK ("purchaseDetails" IS NULL OR (category = 'OTHER' AND "orderId" IS NULL));
