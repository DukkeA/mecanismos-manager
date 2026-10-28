-- Preserve existing records; stop for a manual review if legacy names are ambiguous.
CREATE UNIQUE INDEX catalog_part_name_key
  ON workshop."CatalogItem" (workshop.catalog_label_key(name)) WHERE kind = 'PART';
