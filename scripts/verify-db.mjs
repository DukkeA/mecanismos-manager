import pg from 'pg';
import assert from 'node:assert/strict';

const client = new pg.Client({connectionString: process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:56322/postgres'});
await client.connect();
try {
  const {rows} = await client.query('SELECT count(*)::int AS count FROM workshop."Location"');
  assert.equal(rows[0].count, 2);
  for (const role of ['anon', 'authenticated']) {
    const result = await client.query('SELECT has_schema_privilege($1, $2, $3) AS allowed', [role, 'workshop', 'USAGE']);
    assert.equal(result.rows[0].allowed, false, `${role} must not access private workshop schema`);
  }
  await client.query('BEGIN');
  try {
    await client.query(`INSERT INTO workshop."TimeEntry" (id, "taskId", "memberId", minutes, "workedOn", note, "idempotencyKey") VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 0, CURRENT_DATE, 'invalid', gen_random_uuid())`);
    assert.fail('Invalid minutes accepted');
  } catch (error) {
    assert.equal(error.code, '23514', 'Expected check constraint rejection');
  } finally { await client.query('ROLLBACK'); }
  console.log('Database checks passed: locations, private schema access, minute constraint.');
} finally { await client.end(); }
