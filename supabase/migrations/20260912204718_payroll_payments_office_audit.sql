ALTER TABLE workshop."Obligation" ADD COLUMN "salaryPeriod" varchar(7) UNIQUE;
ALTER TABLE workshop."Obligation" ADD CONSTRAINT salary_period_check CHECK ("salaryPeriod" IS NULL OR ("salaryPeriod" = period AND category='PAYROLL'));
GRANT UPDATE(title,amount,"dueOn",estimated,"salaryPeriod") ON workshop."Obligation" TO workshop_runtime;
ALTER TABLE workshop."Obligation" DROP CONSTRAINT positive_obligation;
ALTER TABLE workshop."Obligation" ADD CONSTRAINT positive_obligation CHECK (amount > 0 OR ("salaryPeriod" IS NOT NULL AND amount = 0));
CREATE TABLE workshop."PayrollPayment" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "memberId" uuid NOT NULL REFERENCES workshop."Member"(id),
 period varchar(7) NOT NULL CHECK(period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 "entryId" uuid NOT NULL REFERENCES workshop."CashEntry"(id), amount decimal(18,2) NOT NULL CHECK(amount>0),
 calculation jsonb NOT NULL, "actorId" uuid NOT NULL REFERENCES workshop."Member"(id),
 "createdAt" timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX ON workshop."PayrollPayment"("memberId",period);
CREATE INDEX ON workshop."PayrollPayment"("entryId");
CREATE TABLE workshop."RecordChange" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "entityId" uuid NOT NULL, "entityType" varchar(80) NOT NULL,
 "actorId" uuid REFERENCES workshop."Member"(id) ON DELETE SET NULL, "actorName" varchar(160) NOT NULL, "batchId" varchar(40) NOT NULL, operation varchar(10) NOT NULL,
 before jsonb, after jsonb NOT NULL, "createdAt" timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX ON workshop."RecordChange"("entityId","createdAt");
CREATE INDEX ON workshop."RecordChange"("batchId");
CREATE TABLE workshop."AdminNotification" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "recipientId" uuid NOT NULL REFERENCES workshop."Member"(id) ON DELETE CASCADE,
 "batchId" varchar(40) NOT NULL, "readAt" timestamptz(3), "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE("recipientId","batchId")
);
CREATE INDEX ON workshop."AdminNotification"("recipientId","readAt","createdAt");
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['PayrollPayment','RecordChange','AdminNotification'] LOOP
 EXECUTE format('ALTER TABLE workshop.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON workshop.%I FROM anon, authenticated, workshop_runtime',t);
 EXECUTE format('GRANT SELECT,INSERT ON workshop.%I TO workshop_runtime',t);
 EXECUTE format('CREATE POLICY runtime_access ON workshop.%I TO workshop_runtime USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
GRANT UPDATE("readAt") ON workshop."AdminNotification" TO workshop_runtime;
CREATE FUNCTION workshop.record_money_team_change() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE author uuid; row_after jsonb; row_before jsonb; batch text;
BEGIN
 row_after := to_jsonb(NEW)-'authSubject';
 row_before := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)-'authSubject' ELSE NULL END;
 IF row_before IS NOT DISTINCT FROM row_after THEN RETURN NEW; END IF;
 author := nullif(current_setting('workshop.actor_id',true),'')::uuid;
 IF author IS NULL AND current_user='workshop_runtime' THEN RAISE EXCEPTION 'Missing actor for audited change'; END IF;
 batch := txid_current()::text;
 INSERT INTO workshop."RecordChange"("entityId","entityType","actorId","actorName","batchId",operation,before,after)
 VALUES((row_after->>'id')::uuid,TG_TABLE_NAME,author,COALESCE((SELECT name FROM workshop."Member" WHERE id=author),'Carga de datos'),batch,TG_OP,row_before,row_after);
 IF EXISTS(SELECT 1 FROM workshop."Member" WHERE id=author AND role='OFFICE') THEN
 INSERT INTO workshop."AdminNotification"("recipientId","batchId")
 SELECT id,batch FROM workshop."Member" WHERE role='ADMIN' AND active ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION workshop.record_money_team_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workshop.record_money_team_change() TO workshop_runtime;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['Member','LaborRate','OvertimeEntry','EmployeeLeave','VacationAdjustment','SalaryAdvance','AdvanceInstallment','AttendanceShift','MoneyAccount','CashEntry','Obligation','RecurringExpense','CashClosure','PayrollPayment','CustomerPayment','PaymentAllocation','SupplierPayment'] LOOP
 EXECUTE format('CREATE TRIGGER money_team_history AFTER INSERT OR UPDATE ON workshop.%I FOR EACH ROW EXECUTE FUNCTION workshop.record_money_team_change()',t);
 END LOOP;
END $$;

-- Mark pre-existing records explicitly; do not invent who originally edited them.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['Member','LaborRate','OvertimeEntry','EmployeeLeave','VacationAdjustment','SalaryAdvance','AdvanceInstallment','AttendanceShift','MoneyAccount','CashEntry','Obligation','RecurringExpense','CashClosure'] LOOP
 EXECUTE format('INSERT INTO workshop."RecordChange"("entityId","entityType","actorId","actorName","batchId",operation,before,after,"createdAt")
 SELECT x.id,%L,a."actorId",COALESCE(m.name,''Carga de datos''),''baseline'',''BASELINE'',NULL,to_jsonb(x)-''authSubject'',COALESCE(a."createdAt",now())
 FROM workshop.%I x LEFT JOIN LATERAL(SELECT "actorId","createdAt" FROM workshop."AuditEvent" WHERE "entityId"=x.id ORDER BY "createdAt" DESC LIMIT 1)a ON true
 LEFT JOIN workshop."Member" m ON m.id=a."actorId"
 WHERE NOT EXISTS(SELECT 1 FROM workshop."RecordChange" c WHERE c."entityId"=x.id)',t,t);
 END LOOP;
END $$;
