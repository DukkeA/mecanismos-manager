CREATE TABLE workshop."WorkshopSettings" (
 id varchar(20) PRIMARY KEY CHECK (id='global'),
 version int NOT NULL DEFAULT 1 CHECK(version>0),
 "startMinute" int NOT NULL DEFAULT 510 CHECK("startMinute" BETWEEN 0 AND 1439),
 "endMinute" int NOT NULL DEFAULT 1020 CHECK("endMinute" BETWEEN 0 AND 1439),
 "graceMinutes" int NOT NULL DEFAULT 0 CHECK("graceMinutes" BETWEEN 0 AND 60),
 "actorId" uuid REFERENCES workshop."Member"(id),
 "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
 CHECK("startMinute"<>"endMinute")
);
INSERT INTO workshop."WorkshopSettings"(id) VALUES ('global');
ALTER TABLE workshop."WorkshopSettings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workshop."WorkshopSettings" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON workshop."WorkshopSettings" TO workshop_runtime;
CREATE POLICY settings_server ON workshop."WorkshopSettings" TO workshop_runtime USING(true) WITH CHECK(true);

-- A paired display can only fetch its own changing QR, without an employee session.
ALTER TABLE workshop."AttendanceStation"
 ADD COLUMN "pairingHash" varchar(64) UNIQUE,
 ADD COLUMN "pairingExpiresAt" timestamptz(3),
 ADD COLUMN "deviceHash" varchar(64) UNIQUE;
