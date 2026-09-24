-- The workshop schema is private. Supabase Auth is used for identity, while
-- the Next.js server is the only database client and connects as
-- workshop_runtime after applying the application role checks.
--
-- RLS is still enabled as a second boundary so an accidental future grant or
-- Data API configuration change cannot expose workshop rows to Supabase roles.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'workshop_runtime'
      AND NOT rolbypassrls
      AND NOT rolsuper
  ) THEN
    RAISE EXCEPTION 'workshop_runtime must exist without BYPASSRLS or SUPERUSER';
  END IF;
END
$$;

REVOKE ALL ON SCHEMA workshop FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA workshop FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA workshop FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA workshop FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA workshop
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA workshop
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA workshop
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

-- Existing grants on workshop_runtime remain the operation-level allowlist:
-- every table is readable, while UPDATE and DELETE stay limited per table or
-- column by the migrations that introduced each workflow.
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'workshop'
      AND c.relkind IN ('r', 'p')
    ORDER BY c.relname
  LOOP
    EXECUTE format(
      'ALTER TABLE workshop.%I ENABLE ROW LEVEL SECURITY',
      target.table_name
    );

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policy p
      JOIN pg_class policy_table ON policy_table.oid = p.polrelid
      JOIN pg_namespace policy_schema ON policy_schema.oid = policy_table.relnamespace
      WHERE policy_schema.nspname = 'workshop'
        AND policy_table.relname = target.table_name
        AND (SELECT oid FROM pg_roles WHERE rolname = 'workshop_runtime') = ANY (p.polroles)
    ) THEN
      EXECUTE format(
        'CREATE POLICY server_runtime_access ON workshop.%I FOR ALL TO workshop_runtime USING (true) WITH CHECK (true)',
        target.table_name
      );
    END IF;
  END LOOP;
END
$$;

-- Keep personal organizer entries isolated by the verified actor stored in the
-- transaction. The scalar subquery evaluates the setting once per statement.
DROP POLICY IF EXISTS organizer_access ON workshop."OrganizerEntry";
CREATE POLICY organizer_access ON workshop."OrganizerEntry"
  FOR ALL
  TO workshop_runtime
  USING (
    EXISTS (
      SELECT 1
      FROM workshop."Member" member
      WHERE member.id = (
        SELECT nullif(current_setting('workshop.actor_id', true), '')::uuid
      )
        AND member.active
        AND member.role IN ('ADMIN', 'OFFICE')
        AND (
          "OrganizerEntry".visibility = 'GENERAL'
          OR "OrganizerEntry"."ownerId" = member.id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workshop."Member" member
      WHERE member.id = (
        SELECT nullif(current_setting('workshop.actor_id', true), '')::uuid
      )
        AND member.active
        AND member.role IN ('ADMIN', 'OFFICE')
        AND (
          "OrganizerEntry".visibility = 'GENERAL'
          OR "OrganizerEntry"."ownerId" = member.id
        )
    )
  );
