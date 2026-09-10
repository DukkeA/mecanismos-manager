-- Stable business locations only. No invented customers, employees or financial records.
INSERT INTO workshop."Location" (id, code, name) VALUES
  ('00000000-0000-4000-8000-000000000001', 'OFICINA', 'Oficina principal'),
  ('00000000-0000-4000-8000-000000000002', 'TALLER', 'Bodega / taller')
ON CONFLICT (code) DO NOTHING;
