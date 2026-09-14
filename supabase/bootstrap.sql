-- Run once after migrations on a new, empty cloud database as postgres.
-- This is configuration, not the local demo seed. Never resets existing data.
BEGIN;

-- Authorize the first administrator separately with their actual Google email.
-- See the README. Personal access lists do not belong in this repository.

INSERT INTO workshop."Location" (id, code, name)
VALUES
  (gen_random_uuid(), 'OFICINA', 'Oficina principal'),
  (gen_random_uuid(), 'BODEGA', 'Bodega / taller')
ON CONFLICT (code) DO NOTHING;

INSERT INTO workshop."MoneyAccount" (id, name, "openingBalance", balance)
VALUES
  (gen_random_uuid(), 'Bodega', 0, 0),
  (gen_random_uuid(), 'Oficina', 0, 0),
  (gen_random_uuid(), 'Caja Menor Oficina', 0, 0),
  (gen_random_uuid(), 'Caja Menor Bodega', 0, 0)
ON CONFLICT (name) DO NOTHING;

COMMIT;
