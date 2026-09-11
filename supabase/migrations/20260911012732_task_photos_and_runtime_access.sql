GRANT SELECT, INSERT ON workshop."TaskNote" TO workshop_runtime;
CREATE POLICY task_notes_server ON workshop."TaskNote" TO workshop_runtime USING (true) WITH CHECK (true);
GRANT DELETE ON workshop."TaskAssignment" TO workshop_runtime;
CREATE TABLE workshop."TaskPhoto" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "taskId" uuid NOT NULL REFERENCES workshop."Task"("id") ON DELETE RESTRICT,
 "actorId" uuid NOT NULL REFERENCES workshop."Member"("id") ON DELETE RESTRICT,
 "caption" varchar(250) NOT NULL, "content" bytea NOT NULL CHECK(octet_length(content)<=1048576),
 "createdAt" timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX "TaskPhoto_taskId_createdAt_idx" ON workshop."TaskPhoto"("taskId","createdAt");
ALTER TABLE workshop."TaskPhoto" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workshop."TaskPhoto" FROM anon, authenticated;
GRANT SELECT, INSERT ON workshop."TaskPhoto" TO workshop_runtime;
CREATE POLICY task_photos_server ON workshop."TaskPhoto" TO workshop_runtime USING (true) WITH CHECK (true);
