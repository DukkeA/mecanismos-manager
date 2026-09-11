ALTER TABLE workshop."CashEntry" ADD COLUMN "transferId" uuid;
CREATE UNIQUE INDEX "CashEntry_transferId_kind_direction_key" ON workshop."CashEntry" ("transferId", kind, direction);
ALTER TABLE workshop."CashEntry" ADD CONSTRAINT transfer_entry_shape CHECK (
  (kind <> 'TRANSFER' OR "transferId" IS NOT NULL) AND
  ("transferId" IS NULL OR (kind IN ('TRANSFER','REVERSAL') AND "obligationId" IS NULL))
);

-- Check the pair at commit, after both entries have been written. Invoker security
-- keeps the existing private-schema permissions and runtime RLS policies in force.
CREATE FUNCTION workshop.check_transfer_pair() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, workshop AS $$
DECLARE group_id uuid; entry_kind text; n integer; valid boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN group_id := OLD."transferId"; entry_kind := OLD.kind;
  ELSE group_id := NEW."transferId"; entry_kind := NEW.kind;
  END IF;
  IF group_id IS NULL THEN RETURN NULL; END IF;
  SELECT count(*), count(DISTINCT "accountId")=2 AND count(DISTINCT direction)=2
    AND count(DISTINCT amount)=1 AND count(DISTINCT "occurredOn")=1 AND count(DISTINCT "actorId")=1
  INTO n, valid FROM workshop."CashEntry" WHERE "transferId"=group_id AND kind=entry_kind;
  IF n <> 0 AND (n <> 2 OR NOT valid) THEN
    RAISE EXCEPTION 'La transferencia debe tener dos movimientos equilibrados.' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER balanced_transfer AFTER INSERT OR UPDATE OR DELETE ON workshop."CashEntry"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION workshop.check_transfer_pair();
