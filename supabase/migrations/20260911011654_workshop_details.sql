ALTER TABLE workshop."Task" ADD COLUMN "description" text NOT NULL DEFAULT '', ADD COLUMN "deletedAt" timestamptz(3), ADD COLUMN "version" integer NOT NULL DEFAULT 0;
ALTER TABLE workshop."CatalogItem" ADD COLUMN "reference" varchar(200) NOT NULL DEFAULT '', ADD COLUMN "notes" text NOT NULL DEFAULT '';
CREATE TABLE workshop."TaskNote" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "taskId" uuid NOT NULL REFERENCES workshop."Task"("id") ON DELETE RESTRICT,
 "actorId" uuid NOT NULL REFERENCES workshop."Member"("id") ON DELETE RESTRICT, "body" text NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX "TaskNote_taskId_createdAt_idx" ON workshop."TaskNote"("taskId","createdAt");
ALTER TABLE workshop."TaskNote" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workshop."TaskNote" FROM anon, authenticated;
