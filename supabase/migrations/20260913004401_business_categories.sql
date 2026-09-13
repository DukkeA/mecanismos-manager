-- Shared business lines. Existing records remain explicitly unclassified.
CREATE TABLE workshop."BusinessCategory" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(100) NOT NULL UNIQUE,
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 0,
 "createdAt" timestamptz(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX business_category_name_ci ON workshop."BusinessCategory" (lower(name));
CREATE TABLE workshop."SupplierCategory" (
 "supplierId" uuid NOT NULL REFERENCES workshop."Supplier"(id) ON DELETE CASCADE,
 "categoryId" uuid NOT NULL REFERENCES workshop."BusinessCategory"(id) ON DELETE RESTRICT,
 PRIMARY KEY("supplierId","categoryId")
);
CREATE INDEX ON workshop."SupplierCategory"("categoryId");
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['CatalogItem','WorkOrder','QuoteLine','SaleLine'] LOOP
 EXECUTE format('ALTER TABLE workshop.%I ADD COLUMN "businessCategoryId" uuid REFERENCES workshop."BusinessCategory"(id) ON DELETE RESTRICT', t);
 EXECUTE format('CREATE INDEX ON workshop.%I ("businessCategoryId")',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['BusinessCategory','SupplierCategory'] LOOP
 EXECUTE format('ALTER TABLE workshop.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON workshop.%I FROM anon, authenticated, workshop_runtime',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON workshop.%I TO workshop_runtime',t);
 EXECUTE format('CREATE POLICY runtime_access ON workshop.%I TO workshop_runtime USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
GRANT DELETE ON workshop."SupplierCategory" TO workshop_runtime;
INSERT INTO workshop."BusinessCategory" (name) VALUES
 ('Bombas de inyección'),('Inyectores'),('Motores diésel'),('Transmisiones automáticas'),('Otros repuestos y servicios');
