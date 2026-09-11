ALTER TABLE workshop."Task" ADD COLUMN "plannedMinutes" integer;
ALTER TABLE workshop."Task" ADD CONSTRAINT task_planned_minutes CHECK ("plannedMinutes" IS NULL OR "plannedMinutes" BETWEEN 1 AND 43200);
