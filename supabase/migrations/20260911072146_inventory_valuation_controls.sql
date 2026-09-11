-- Counts can adjust valuation independently from counted quantity.
ALTER TABLE workshop."StockMovement" DROP CONSTRAINT movement_nonzero;
ALTER TABLE workshop."StockMovement" DROP CONSTRAINT movement_value_sign;
ALTER TABLE workshop."StockMovement" ADD CONSTRAINT movement_nonzero CHECK (quantity <> 0 OR (kind='COUNT' AND "materialAmount"<>0));
ALTER TABLE workshop."StockMovement" ADD CONSTRAINT movement_value_sign CHECK (kind='COUNT' OR (quantity>0 AND "materialAmount">=0) OR (quantity<0 AND "materialAmount"<=0));
ALTER TABLE workshop."PurchaseReceipt" DROP CONSTRAINT "PurchaseReceipt_values";
ALTER TABLE workshop."PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_values" CHECK ((quantity>0 AND amount>=0 AND "originalId" IS NULL) OR (quantity<0 AND amount<=0 AND "originalId" IS NOT NULL));
