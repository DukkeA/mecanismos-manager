import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import type { Actor } from "./commands";
import { requirePermission } from "@/domain/permissions";
import type {
  InventoryPricePage,
  InventoryPriceRow,
} from "@/domain/inventory-history";

export async function inventoryPriceHistory(
  actor: Actor,
  params: URLSearchParams,
): Promise<InventoryPricePage> {
  requirePermission(actor.role, "inventory:write");
  const input = z
    .object({
      itemId: z.uuid(),
      kind: z.enum(["PURCHASE", "SALE"]),
      page: z.coerce.number().int().min(1).max(100000).default(1),
    })
    .parse(Object.fromEntries(params));
  const source =
    input.kind === "PURCHASE"
      ? Prisma.sql`
    SELECT m.id::text, 'PURCHASE' kind,
      COALESCE(r."occurredOn", m."occurredOn", (m."createdAt" AT TIME ZONE 'America/Bogota')::date)::text date,
      COALESCE(s.name, 'Entrada directa') counterparty,
      CASE WHEN p.id IS NOT NULL THEN 'Compra ' || p.number ELSE m.reason END document,
      m.condition::text, m.quantity::text,
      CASE WHEN m."costKnown" THEN round(m."materialAmount"/m.quantity, 2)::text END "unitPrice",
      CASE WHEN m."costKnown" THEN round(m."materialAmount"/m.quantity, 2)::text END "netUnitPrice",
      CASE WHEN EXISTS(SELECT 1 FROM workshop."StockMovement" rev WHERE rev."reversalOfId"=m.id) THEN 'REVERSED'
        WHEN COALESCE(ret.qty,0)>=m.quantity THEN 'RETURNED'
        WHEN COALESCE(ret.qty,0)>0 THEN 'PARTIAL_RETURN' ELSE 'ACTIVE' END status
    FROM workshop."StockMovement" m
    LEFT JOIN workshop."PurchaseReceipt" r ON r."movementId"=m.id
    LEFT JOIN workshop."PurchaseLine" pl ON pl.id=r."lineId"
    LEFT JOIN workshop."Purchase" p ON p.id=pl."purchaseId"
    LEFT JOIN workshop."Supplier" s ON s.id=p."supplierId"
    LEFT JOIN LATERAL (SELECT -sum(quantity) qty FROM workshop."PurchaseReceipt" WHERE "originalId"=r.id) ret ON true
    WHERE m."itemId"=${input.itemId}::uuid AND m.quantity>0 AND m.kind IN ('RECEIPT','PURCHASE_RECEIPT') AND m."reversalOfId" IS NULL
  `
      : Prisma.sql`
    SELECT l.id::text, 'SALE' kind, s."issuedOn"::text date, c.name counterparty,
      'Venta ' || s.number document, l.condition::text, l.quantity::text,
      l."unitPrice"::text "unitPrice", round(l.total/l.quantity,2)::text "netUnitPrice",
      CASE WHEN s.status='VOID' THEN 'VOID' WHEN COALESCE(ret.qty,0)>=l.quantity THEN 'RETURNED'
        WHEN COALESCE(ret.qty,0)>0 THEN 'PARTIAL_RETURN' ELSE 'ACTIVE' END status
    FROM workshop."SaleLine" l JOIN workshop."Sale" s ON s.id=l."saleId"
    JOIN workshop."Customer" c ON c.id=s."customerId"
    LEFT JOIN LATERAL (SELECT sum(quantity) qty FROM workshop."SaleReturnLine" WHERE "saleLineId"=l.id) ret ON true
    WHERE l."itemId"=${input.itemId}::uuid
  `;
  const [count] = await db().$queryRaw<{ total: bigint }[]>(
    Prisma.sql`SELECT count(*) total FROM (${source}) history`,
  );
  const total = Number(count.total),
    page = Math.min(input.page, Math.max(1, Math.ceil(total / 10)));
  const rows = await db().$queryRaw<InventoryPriceRow[]>(
    Prisma.sql`SELECT * FROM (${source}) history ORDER BY date DESC,id LIMIT 10 OFFSET ${(page - 1) * 10}`,
  );
  return { rows, total, page };
}
