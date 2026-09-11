-- The existing hourly values remain valid for historical work.
ALTER TABLE workshop."LaborRate"
  ADD COLUMN "monthlySalary" numeric(18,2),
  ADD COLUMN "monthlyEmployerCost" numeric(18,2),
  ADD COLUMN "monthlyHours" numeric(8,2),
  ADD CONSTRAINT labor_monthly_values CHECK (
    ("monthlySalary" IS NULL AND "monthlyEmployerCost" IS NULL AND "monthlyHours" IS NULL)
    OR ("monthlySalary" IS NOT NULL AND "monthlyEmployerCost" IS NOT NULL AND "monthlyHours" IS NOT NULL
      AND "monthlySalary">=0 AND "monthlyEmployerCost">=0 AND "monthlyHours">0 AND "monthlyHours"<=744
      AND "hourlyCost"=round(("monthlySalary"+"monthlyEmployerCost")/"monthlyHours",2))
  );
CREATE TABLE workshop."OvertimeEntry" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "memberId" uuid NOT NULL REFERENCES workshop."Member"(id) ON DELETE RESTRICT,
  "taskId" uuid REFERENCES workshop."Task"(id) ON DELETE RESTRICT,
  "rateId" uuid NOT NULL REFERENCES workshop."LaborRate"(id) ON DELETE RESTRICT,
  "workedOn" date NOT NULL,
  minutes integer NOT NULL CHECK (minutes>0 AND minutes<=1440),
  kind varchar(20) NOT NULL CHECK (kind IN ('DAY','NIGHT')),
  "surchargePercent" numeric(7,2) NOT NULL CHECK ("surchargePercent">=0 AND "surchargePercent"<=300),
  "baseHourlyPay" numeric(18,6) NOT NULL CHECK ("baseHourlyPay">0),
  pay numeric(18,2) NOT NULL CHECK (pay>=0),
  "employerCost" numeric(18,2) NOT NULL CHECK ("employerCost">=0),
  note varchar(1000) NOT NULL,
  "actorId" uuid NOT NULL REFERENCES workshop."Member"(id) ON DELETE RESTRICT,
  "voidedAt" timestamptz(3),
  "voidReason" varchar(1000),
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT overtime_void CHECK (("voidedAt" IS NULL)=("voidReason" IS NULL))
);
CREATE INDEX "OvertimeEntry_memberId_workedOn_idx" ON workshop."OvertimeEntry"("memberId","workedOn");
CREATE INDEX "OvertimeEntry_taskId_idx" ON workshop."OvertimeEntry"("taskId");
CREATE INDEX "OvertimeEntry_workedOn_id_idx" ON workshop."OvertimeEntry"("workedOn",id);
ALTER TABLE workshop."OvertimeEntry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workshop."OvertimeEntry" FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON workshop."OvertimeEntry" TO workshop_runtime;
CREATE POLICY overtime_server ON workshop."OvertimeEntry" TO workshop_runtime USING (true) WITH CHECK (true);
