-- Catalog comparison is deliberately independent of the displayed spelling.
-- Keep constants and parity tests aligned with src/domain/catalog-label.ts.
CREATE FUNCTION workshop.catalog_label_key(label text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog
AS $function$
  SELECT btrim(regexp_replace(
    regexp_replace(lower(translate(
      regexp_replace(normalize(label, NFKD),
        U&'[\00ad\034f\061c\180e\200b-\200f\202a-\202e\2060-\206f\fe00-\fe0f\feff\+0e0100-\+0e01ef]', '', 'g'),
      'аΑαАВΒсСϹϲеЕΕεϵНΗіІΙιӀıјЈКκΚкМΜΝоОΟοрРΡρѕЅТΤτхХΧχуУΥυ', 'aaaabbcccceeeeehhiiiiiijjkkkkmmnooooppppsstttxxxxyyyy')),
      U&'[\0300-\036f\1ab0-\1aff\1dc0-\1dff\20d0-\20ff\fe20-\fe2f]', '', 'g'),
    '[^[:alnum:]]+', ' ', 'g'));
$function$;
REVOKE ALL ON FUNCTION workshop.catalog_label_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION workshop.catalog_label_key(text) TO workshop_runtime;

ALTER TABLE workshop."BusinessCategory"
  ADD COLUMN "nameKey" text GENERATED ALWAYS AS (workshop.catalog_label_key(name)) STORED NOT NULL;
-- Stop instead of merging historical records if an installation has ambiguous names.
DO $check$
BEGIN
  IF EXISTS (SELECT 1 FROM workshop."BusinessCategory" GROUP BY "nameKey" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Hay categorías equivalentes. Revisa sus relaciones antes de aplicar esta migración.';
  END IF;
  IF EXISTS (SELECT 1 FROM workshop."CatalogItem" WHERE kind = 'SERVICE'
             GROUP BY workshop.catalog_label_key(name) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Hay servicios con nombres equivalentes. Revisa el catálogo antes de aplicar esta migración.';
  END IF;
END;
$check$;
CREATE UNIQUE INDEX business_category_name_key ON workshop."BusinessCategory" ("nameKey");
ALTER TABLE workshop."BusinessCategory" ADD CONSTRAINT business_category_label_valid
  CHECK ("nameKey" ~ '^[a-z0-9 ]+$' AND "nameKey" ~ '[a-z]' AND char_length(btrim(name)) >= 2);
DROP INDEX workshop.business_category_name_ci;
-- Services are one shared definition per name; part identity still uses its unique code.
CREATE UNIQUE INDEX catalog_service_name_key ON workshop."CatalogItem" (workshop.catalog_label_key(name))
  WHERE kind = 'SERVICE';
COMMENT ON COLUMN workshop."BusinessCategory"."nameKey" IS 'Generated comparison key. Preserve name for display; use nameKey for duplicate checks.';
