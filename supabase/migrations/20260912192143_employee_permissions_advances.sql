ALTER TABLE workshop."WorkshopSettings"
 ADD COLUMN "saturdayStartMinute" int NOT NULL DEFAULT 480 CHECK("saturdayStartMinute" BETWEEN 0 AND 1439),
 ADD COLUMN "saturdayEndMinute" int NOT NULL DEFAULT 720 CHECK("saturdayEndMinute" BETWEEN 0 AND 1439),
 ADD CHECK ("saturdayStartMinute" < "saturdayEndMinute");
CREATE TABLE workshop."EmployeeLeave" (
 id uuid PRIMARY KEY, "memberId" uuid NOT NULL REFERENCES workshop."Member"(id),
 treatment varchar(20) NOT NULL CHECK(treatment IN ('HOURS','VACATION','PAID')),
 "startsAt" timestamptz(3) NOT NULL, "endsAt" timestamptz(3) NOT NULL CHECK("endsAt">"startsAt"),
 note varchar(1000) NOT NULL, "actorId" uuid NOT NULL REFERENCES workshop."Member"(id),
 "createdAt" timestamptz(3) NOT NULL DEFAULT now(), "voidedAt" timestamptz(3), "voidReason" varchar(1000)
);
CREATE INDEX "EmployeeLeave_memberId_startsAt_idx" ON workshop."EmployeeLeave"("memberId","startsAt");
CREATE TABLE workshop."EmployeeLeaveDay" (
 id uuid PRIMARY KEY, "leaveId" uuid NOT NULL REFERENCES workshop."EmployeeLeave"(id),
 "workedOn" date NOT NULL, "startsAt" timestamptz(3) NOT NULL, "endsAt" timestamptz(3) NOT NULL,
 minutes int NOT NULL CHECK(minutes>0), "vacationDays" decimal(10,4) NOT NULL CHECK("vacationDays">=0),
 "salaryDeduction" decimal(18,2) NOT NULL CHECK("salaryDeduction">=0), "rateId" uuid REFERENCES workshop."LaborRate"(id),
 CHECK("endsAt">"startsAt"), UNIQUE("leaveId","workedOn")
);
CREATE INDEX "EmployeeLeaveDay_workedOn_idx" ON workshop."EmployeeLeaveDay"("workedOn");
CREATE TABLE workshop."VacationAdjustment" (
 id uuid PRIMARY KEY, "memberId" uuid NOT NULL REFERENCES workshop."Member"(id),
 days decimal(10,4) NOT NULL CHECK(days<>0), note varchar(1000) NOT NULL,
 "actorId" uuid NOT NULL REFERENCES workshop."Member"(id), "createdAt" timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX "VacationAdjustment_memberId_createdAt_idx" ON workshop."VacationAdjustment"("memberId","createdAt");
CREATE TABLE workshop."SalaryAdvance" (
 id uuid PRIMARY KEY, "memberId" uuid NOT NULL REFERENCES workshop."Member"(id),
 "entryId" uuid NOT NULL UNIQUE REFERENCES workshop."CashEntry"(id), amount decimal(18,2) NOT NULL CHECK(amount>0),
 "disbursedOn" date NOT NULL, note varchar(1000) NOT NULL, version int NOT NULL DEFAULT 1 CHECK(version>0),
 "actorId" uuid NOT NULL REFERENCES workshop."Member"(id), "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
 "voidedAt" timestamptz(3), "voidReason" varchar(1000)
);
CREATE INDEX "SalaryAdvance_memberId_disbursedOn_idx" ON workshop."SalaryAdvance"("memberId","disbursedOn");
CREATE TABLE workshop."AdvanceInstallment" (
 id uuid PRIMARY KEY, "advanceId" uuid NOT NULL REFERENCES workshop."SalaryAdvance"(id),
 period varchar(7) NOT NULL CHECK(period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 amount decimal(18,2) NOT NULL CHECK(amount>0), "appliedOn" date, "appliedBy" uuid REFERENCES workshop."Member"(id),
 "cancelledAt" timestamptz(3), "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
 CHECK ("cancelledAt" IS NULL OR "appliedOn" IS NULL), CHECK (("appliedOn" IS NULL)=("appliedBy" IS NULL))
);
CREATE INDEX "AdvanceInstallment_period_advanceId_idx" ON workshop."AdvanceInstallment"(period,"advanceId");
CREATE UNIQUE INDEX advance_active_month ON workshop."AdvanceInstallment"("advanceId",period) WHERE "cancelledAt" IS NULL;
ALTER TABLE workshop."EmployeeLeave" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workshop."EmployeeLeave" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON workshop."EmployeeLeave" TO workshop_runtime;
CREATE POLICY server_only ON workshop."EmployeeLeave" TO workshop_runtime USING(true) WITH CHECK(true);
ALTER TABLE workshop."EmployeeLeaveDay" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workshop."EmployeeLeaveDay" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON workshop."EmployeeLeaveDay" TO workshop_runtime;
CREATE POLICY server_only ON workshop."EmployeeLeaveDay" TO workshop_runtime USING(true) WITH CHECK(true);
ALTER TABLE workshop."VacationAdjustment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workshop."VacationAdjustment" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON workshop."VacationAdjustment" TO workshop_runtime;
CREATE POLICY server_only ON workshop."VacationAdjustment" TO workshop_runtime USING(true) WITH CHECK(true);
ALTER TABLE workshop."SalaryAdvance" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workshop."SalaryAdvance" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON workshop."SalaryAdvance" TO workshop_runtime;
CREATE POLICY server_only ON workshop."SalaryAdvance" TO workshop_runtime USING(true) WITH CHECK(true);
ALTER TABLE workshop."AdvanceInstallment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workshop."AdvanceInstallment" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON workshop."AdvanceInstallment" TO workshop_runtime;
CREATE POLICY server_only ON workshop."AdvanceInstallment" TO workshop_runtime USING(true) WITH CHECK(true);
