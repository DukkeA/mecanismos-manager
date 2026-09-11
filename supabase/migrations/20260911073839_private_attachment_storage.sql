ALTER TABLE workshop."TaskPhoto" ADD COLUMN "storagePath" text;
ALTER TABLE workshop."TaskPhoto" ALTER COLUMN content DROP NOT NULL;
CREATE UNIQUE INDEX "TaskPhoto_storagePath_key" ON workshop."TaskPhoto"("storagePath");
ALTER TABLE workshop."TaskPhoto" ADD CONSTRAINT photo_has_content CHECK (content IS NOT NULL OR "storagePath" IS NOT NULL);
