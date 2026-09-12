ALTER TABLE workshop."OvertimeEntry" ALTER COLUMN "rateId" DROP NOT NULL;
ALTER TABLE workshop."OvertimeEntry" DROP CONSTRAINT "OvertimeEntry_minutes_check", DROP CONSTRAINT "OvertimeEntry_kind_check", DROP CONSTRAINT "OvertimeEntry_baseHourlyPay_check";
ALTER TABLE workshop."OvertimeEntry" ADD CONSTRAINT supplement_calculation CHECK (
 (kind='FIXED' AND minutes=0 AND "rateId" IS NULL AND "baseHourlyPay"=0 AND "surchargePercent"=0 AND pay>0)
 OR (kind IN ('DAY','NIGHT') AND minutes>0 AND minutes<=1440 AND "rateId" IS NOT NULL AND "baseHourlyPay">0)
);
CREATE TABLE workshop."AttendanceStation" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "locationId" uuid NOT NULL UNIQUE REFERENCES workshop."Location"(id),secret varchar(64) NOT NULL,active boolean NOT NULL DEFAULT true,"actorId" uuid NOT NULL REFERENCES workshop."Member"(id),"createdAt" timestamptz(3) NOT NULL DEFAULT now()
);
CREATE TABLE workshop."AttendanceSchedule" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"memberId" uuid NOT NULL REFERENCES workshop."Member"(id),weekday int NOT NULL CHECK(weekday BETWEEN 0 AND 6),"effectiveOn" date NOT NULL,
 "startMinute" int NOT NULL CHECK("startMinute" BETWEEN 0 AND 1439),"endMinute" int NOT NULL CHECK("endMinute" BETWEEN 0 AND 1439),"breakMinutes" int NOT NULL CHECK("breakMinutes" BETWEEN 0 AND 240),"graceMinutes" int NOT NULL CHECK("graceMinutes" BETWEEN 0 AND 60),note varchar(1000) NOT NULL,"actorId" uuid NOT NULL REFERENCES workshop."Member"(id),"createdAt" timestamptz(3) NOT NULL DEFAULT now(),
 CONSTRAINT schedule_duration CHECK("startMinute"<>"endMinute" AND "breakMinutes"<(("endMinute"-"startMinute"+1440)%1440)),
 UNIQUE("memberId",weekday,"effectiveOn")
);
CREATE TABLE workshop."AttendanceShift" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"memberId" uuid NOT NULL REFERENCES workshop."Member"(id),"locationId" uuid NOT NULL REFERENCES workshop."Location"(id),"workedOn" date NOT NULL,"startedAt" timestamptz(3) NOT NULL,"endedAt" timestamptz(3),"expectedStart" timestamptz(3),"expectedEnd" timestamptz(3),"breakMinutes" int NOT NULL DEFAULT 0 CHECK("breakMinutes" BETWEEN 0 AND 240),"graceMinutes" int NOT NULL DEFAULT 0 CHECK("graceMinutes" BETWEEN 0 AND 60),source varchar(20) NOT NULL CHECK(source IN ('QR','MANUAL')),note varchar(1000) NOT NULL DEFAULT '',"createdAt" timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE("memberId","workedOn"),
 CONSTRAINT shift_duration CHECK("endedAt" IS NULL OR ("endedAt">"startedAt" AND "endedAt"<="startedAt"+interval '24 hours')),
 CONSTRAINT shift_schedule CHECK(("expectedStart" IS NULL AND "expectedEnd" IS NULL) OR ("expectedStart" IS NOT NULL AND "expectedEnd" IS NOT NULL AND "expectedEnd">"expectedStart")),
 CONSTRAINT shift_day CHECK("workedOn"=("startedAt" AT TIME ZONE 'America/Bogota')::date)
);
CREATE UNIQUE INDEX attendance_one_open ON workshop."AttendanceShift"("memberId") WHERE "endedAt" IS NULL;
CREATE INDEX "AttendanceShift_workedOn_id_idx" ON workshop."AttendanceShift"("workedOn",id);
CREATE TABLE workshop."AttendanceScan" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"memberId" uuid NOT NULL REFERENCES workshop."Member"(id),"tokenHash" varchar(64) NOT NULL,"shiftId" uuid NOT NULL REFERENCES workshop."AttendanceShift"(id),action varchar(10) NOT NULL CHECK(action IN ('IN','OUT')),"createdAt" timestamptz(3) NOT NULL DEFAULT now(), UNIQUE("memberId","tokenHash")
);
CREATE INDEX attendance_scan_shift ON workshop."AttendanceScan"("shiftId");
ALTER TABLE workshop."AttendanceStation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workshop."AttendanceStation" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON workshop."AttendanceStation" TO workshop_runtime;
CREATE POLICY attendance_server ON workshop."AttendanceStation" TO workshop_runtime USING(true) WITH CHECK(true);
ALTER TABLE workshop."AttendanceSchedule" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workshop."AttendanceSchedule" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON workshop."AttendanceSchedule" TO workshop_runtime;
CREATE POLICY attendance_server ON workshop."AttendanceSchedule" TO workshop_runtime USING(true) WITH CHECK(true);
ALTER TABLE workshop."AttendanceShift" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workshop."AttendanceShift" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON workshop."AttendanceShift" TO workshop_runtime;
CREATE POLICY attendance_server ON workshop."AttendanceShift" TO workshop_runtime USING(true) WITH CHECK(true);
ALTER TABLE workshop."AttendanceScan" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workshop."AttendanceScan" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON workshop."AttendanceScan" TO workshop_runtime;
CREATE POLICY attendance_server ON workshop."AttendanceScan" TO workshop_runtime USING(true) WITH CHECK(true);
