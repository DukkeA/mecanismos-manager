ALTER TABLE workshop."StockBalance" ADD COLUMN "costKnown" boolean NOT NULL DEFAULT true;
ALTER TABLE workshop."StockMovement" ADD COLUMN "costKnown" boolean NOT NULL DEFAULT true;
UPDATE workshop."StockBalance" SET "costKnown"=false WHERE quantity>0 AND "materialCost"=0;
UPDATE workshop."StockMovement" SET "costKnown"=false WHERE quantity<>0 AND "materialAmount"=0;
