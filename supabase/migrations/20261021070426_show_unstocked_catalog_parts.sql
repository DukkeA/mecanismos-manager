-- Existing catalog-only parts must be visible as zero stock. Do not infer units or value.
INSERT INTO workshop."StockBalance" ("itemId", "locationId", condition, quantity, reserved, "materialCost", "costKnown")
SELECT i.id, l.id, 'NEW', 0, 0, 0, true
FROM workshop."CatalogItem" i
CROSS JOIN LATERAL (SELECT id FROM workshop."Location" ORDER BY name, id LIMIT 1) l
WHERE i.kind = 'PART' AND NOT i.serialized
  AND NOT EXISTS (SELECT 1 FROM workshop."StockBalance" b WHERE b."itemId" = i.id)
ON CONFLICT DO NOTHING;
