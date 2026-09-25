-- Financial date for consumption confirmed by a dated sale. Older manual
-- movements keep their original creation date; no history is inferred.
ALTER TABLE workshop."StockMovement" ADD COLUMN "occurredOn" date;
