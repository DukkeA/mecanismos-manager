-- Keep the transaction actor lookup out of the per-row policy expression so
-- PostgreSQL can initialize it once for the statement.
CREATE OR REPLACE FUNCTION workshop.current_actor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT nullif(current_setting('workshop.actor_id', true), '')::uuid
$$;

REVOKE ALL ON FUNCTION workshop.current_actor_id() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION workshop.current_actor_id() TO workshop_runtime;

DROP POLICY IF EXISTS organizer_access ON workshop."OrganizerEntry";
CREATE POLICY organizer_access ON workshop."OrganizerEntry"
  FOR ALL
  TO workshop_runtime
  USING (
    EXISTS (
      SELECT 1
      FROM workshop."Member" member
      WHERE member.id = (SELECT workshop.current_actor_id())
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
      WHERE member.id = (SELECT workshop.current_actor_id())
        AND member.active
        AND member.role IN ('ADMIN', 'OFFICE')
        AND (
          "OrganizerEntry".visibility = 'GENERAL'
          OR "OrganizerEntry"."ownerId" = member.id
        )
    )
  );
