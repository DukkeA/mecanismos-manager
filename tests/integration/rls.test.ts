import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { Client } = pg;

function localRuntimeUrl() {
  const env = readFileSync(".env.local", "utf8");
  const value = env.match(/^DATABASE_URL=["']?([^\r\n"']+)/m)?.[1];
  if (!value) throw new Error("Falta DATABASE_URL local para probar RLS.");
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "56322")
    throw new Error("La prueba de RLS solo admite la base local.");
  return value;
}

describe("workshop row level security", () => {
  const admin = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(() => admin.connect());
  afterAll(() => admin.end());

  it("enables RLS and a workshop_runtime policy on every workshop table", async () => {
    const { rows: tables } = await admin.query<{
      table_name: string;
      rls_enabled: boolean;
      runtime_policy: boolean;
    }>(`
      SELECT
        table_record.relname AS table_name,
        table_record.relrowsecurity AS rls_enabled,
        EXISTS (
          SELECT 1
          FROM pg_policy policy
          WHERE policy.polrelid = table_record.oid
            AND (SELECT oid FROM pg_roles WHERE rolname = 'workshop_runtime') = ANY (policy.polroles)
        ) AS runtime_policy
      FROM pg_class table_record
      JOIN pg_namespace schema_record ON schema_record.oid = table_record.relnamespace
      WHERE schema_record.nspname = 'workshop'
        AND table_record.relkind IN ('r', 'p')
      ORDER BY table_record.relname
    `);

    expect(tables.length).toBeGreaterThan(0);
    expect(tables.filter((table) => !table.rls_enabled)).toEqual([]);
    expect(tables.filter((table) => !table.runtime_policy)).toEqual([]);
  });

  it.each(["anon", "authenticated", "service_role"])(
    "keeps %s outside the private workshop schema",
    async (role) => {
      const privileges = await admin.query<{ schema_access: boolean; table_grants: string }>(
        `
          SELECT
            has_schema_privilege($1, 'workshop', 'USAGE') AS schema_access,
            count(*)::text AS table_grants
          FROM information_schema.role_table_grants
          WHERE table_schema = 'workshop' AND grantee = $1
        `,
        [role],
      );
      expect(privileges.rows[0]).toEqual({
        schema_access: false,
        table_grants: "0",
      });
    },
  );

  it("lets the limited application role use ordinary tables but not private notes without an actor", async () => {
    const runtime = new Client({ connectionString: localRuntimeUrl() });
    await runtime.connect();
    try {
      const identity = await runtime.query<{ current_user: string }>(
        "SELECT current_user",
      );
      expect(identity.rows[0].current_user).toBe("workshop_runtime");
      await expect(
        runtime.query('SELECT count(*) FROM workshop."Location"'),
      ).resolves.toBeDefined();
      const privateNotes = await runtime.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM workshop."OrganizerEntry"',
      );
      expect(privateNotes.rows[0].count).toBe("0");
    } finally {
      await runtime.end();
    }
  });

  it("isolates a personal organizer entry to the actor set by the server transaction", async () => {
    const runtime = new Client({ connectionString: localRuntimeUrl() });
    await runtime.connect();
    await runtime.query("BEGIN");
    try {
      const members = await runtime.query<{ id: string }>(`
        SELECT id
        FROM workshop."Member"
        WHERE active AND role IN ('ADMIN', 'OFFICE')
        ORDER BY id
        LIMIT 2
      `);
      expect(members.rows).toHaveLength(2);
      const [owner, other] = members.rows;
      const noteId = randomUUID();

      await runtime.query(
        "SELECT set_config('workshop.actor_id', $1, true)",
        [owner.id],
      );
      await runtime.query(
        `
          INSERT INTO workshop."OrganizerEntry"
            (id, kind, visibility, title, body, "ownerId", "updatedById")
          VALUES ($1, 'NOTE', 'PERSONAL', 'Prueba privada RLS', '', $2, $2)
        `,
        [noteId, owner.id],
      );
      const visible = await runtime.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM workshop."OrganizerEntry" WHERE id = $1',
        [noteId],
      );
      expect(visible.rows[0].count).toBe("1");

      await runtime.query(
        "SELECT set_config('workshop.actor_id', $1, true)",
        [other.id],
      );
      const hidden = await runtime.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM workshop."OrganizerEntry" WHERE id = $1',
        [noteId],
      );
      expect(hidden.rows[0].count).toBe("0");
    } finally {
      await runtime.query("ROLLBACK");
      await runtime.end();
    }
  });
});
