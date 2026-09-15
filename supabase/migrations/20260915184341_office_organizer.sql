CREATE TABLE workshop."OrganizerEntry" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind varchar(10) NOT NULL CHECK(kind IN ('NOTE','TODO','EVENT')),
 visibility varchar(10) NOT NULL CHECK(visibility IN ('PERSONAL','GENERAL')),
 title varchar(200) NOT NULL CHECK(length(btrim(title)) >= 3), body text NOT NULL DEFAULT '',
 priority varchar(10) NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('NORMAL','HIGH')),
 pinned boolean NOT NULL DEFAULT false, completed boolean NOT NULL DEFAULT false, calendar boolean NOT NULL DEFAULT false,
 "startsAt" timestamptz(3), "endsAt" timestamptz(3), "orderId" uuid REFERENCES workshop."WorkOrder"(id),
 "ownerId" uuid NOT NULL REFERENCES workshop."Member"(id), "updatedById" uuid NOT NULL REFERENCES workshop."Member"(id),
 "createdAt" timestamptz(3) NOT NULL DEFAULT now(), "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
 "deletedAt" timestamptz(3), version integer NOT NULL DEFAULT 0,
 CHECK ((NOT calendar AND kind <> 'EVENT') OR "startsAt" IS NOT NULL),
 CHECK ("endsAt" IS NULL OR ("startsAt" IS NOT NULL AND "endsAt" > "startsAt")),
 CHECK (kind <> 'NOTE' OR NOT calendar)
);
CREATE INDEX organizer_visibility_owner ON workshop."OrganizerEntry"(visibility,"ownerId","deletedAt");
CREATE INDEX organizer_calendar ON workshop."OrganizerEntry"("startsAt");
ALTER TABLE workshop."OrganizerEntry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workshop."OrganizerEntry" FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON workshop."OrganizerEntry" TO workshop_runtime;
-- Private server-only schema. All organizer transactions set the verified Member id.
CREATE POLICY organizer_access ON workshop."OrganizerEntry" TO workshop_runtime
USING (EXISTS (SELECT 1 FROM workshop."Member" m WHERE m.id = nullif(current_setting('workshop.actor_id',true),'')::uuid
 AND m.active AND m.role IN ('ADMIN','OFFICE') AND (visibility='GENERAL' OR "ownerId"=m.id)))
WITH CHECK (EXISTS (SELECT 1 FROM workshop."Member" m WHERE m.id = nullif(current_setting('workshop.actor_id',true),'')::uuid
 AND m.active AND m.role IN ('ADMIN','OFFICE') AND (visibility='GENERAL' OR "ownerId"=m.id)));
