import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "./db";
import { marginSource } from "./hub-query";
import { requirePermission } from "@/domain/permissions";
import type { Actor } from "./commands";
import type { ProductResult, ProductResults } from "@/domain/product-results";

export async function productResults(
  actor: Actor,
  params: URLSearchParams,
): Promise<ProductResults> {
  requirePermission(actor.role, "profitability:read");
  const p = z
    .object({
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
      q: z.string().trim().max(120).default(""),
      category: z.enum(["SERVICE", "NEW", "USED", "REBUILT"]).optional(),
      page: z.coerce.number().int().min(1).max(100000).default(1),
      orderBy: z
        .enum(["name", "quantity", "revenue", "margin"])
        .default("revenue"),
      direction: z.enum(["asc", "desc"]).default("desc"),
    })
    .parse(Object.fromEntries(params));
  if (p.from && p.to && p.from > p.to)
    throw Error("Rango de fechas no válido.");
  const sql = Prisma.sql;
  // Order costs are allocated by each line's share of original order revenue. No cost is counted twice.
  const base = sql`WITH margins AS (${marginSource}), lines AS (
    SELECT l."itemId" id,i.name,i.reference,CASE WHEN l.kind='SERVICE' THEN 'SERVICE' ELSE l.condition::text END category,
      l.quantity-COALESCE(r.quantity,0) quantity,l.total-COALESCE(r.amount,0) revenue,
      CASE WHEN s."orderId" IS NOT NULL THEN
        CASE WHEN m.status='CLOSED' AND m.amount IS NOT NULL AND gross.amount>0
          THEN ((m.data->>'material')::numeric+(m.data->>'labor')::numeric)*l.total/gross.amount END
        WHEN l.kind='PART' AND l."materialCost" IS NOT NULL THEN l."materialCost"-COALESCE(r.cost,0) END cost
    FROM workshop."SaleLine" l JOIN workshop."Sale" s ON s.id=l."saleId" JOIN workshop."CatalogItem" i ON i.id=l."itemId"
    LEFT JOIN margins m ON m.id=s."orderId"
    LEFT JOIN LATERAL(SELECT sum(total) amount FROM workshop."Sale" WHERE "orderId"=s."orderId" AND status='ISSUED')gross ON true
    LEFT JOIN LATERAL(SELECT sum(rl.quantity) quantity,sum(rl.amount) amount,sum(COALESCE(sm."materialAmount",l."materialCost"*rl.quantity/l.quantity)) cost FROM workshop."SaleReturnLine" rl LEFT JOIN workshop."StockMovement" sm ON sm.id=rl."movementId" WHERE rl."saleLineId"=l.id)r ON true
    WHERE s.status='ISSUED' AND s."issuedOn">=${p.from ?? "2000-01-01"}::date AND s."issuedOn"<=${p.to ?? "2100-01-01"}::date
  ), grouped AS (SELECT id,name,reference,category,sum(quantity) quantity,sum(revenue) revenue,
    CASE WHEN count(*) FILTER(WHERE cost IS NULL)=0 THEN sum(COALESCE(cost,0)) END cost,
    count(*) FILTER(WHERE cost IS NULL)::int missing FROM lines GROUP BY id,name,reference,category), filtered AS (
    SELECT *,revenue-cost margin FROM grouped WHERE (name ILIKE ${`%${p.q}%`} OR reference ILIKE ${`%${p.q}%`}) AND (${p.category ?? null}::text IS NULL OR category=${p.category ?? null})
  )`;
  const [rows, total, categories] = await db().$transaction(
    [
      db().$queryRaw<ProductResult[]>(
        sql`${base} SELECT id,name,reference,category,quantity::text,revenue::text,round(cost,2)::text cost,round(margin,2)::text margin,missing FROM filtered ORDER BY ${Prisma.raw(`filtered."${p.orderBy}"`)} ${Prisma.raw(p.direction)} NULLS LAST,id,category LIMIT 10 OFFSET ${(p.page - 1) * 10}`,
      ),
      db().$queryRaw<{ count: bigint }[]>(
        sql`${base} SELECT count(*) FROM filtered`,
      ),
      db().$queryRaw<ProductResults["categories"]>(
        sql`${base} SELECT category,sum(revenue)::text revenue FROM grouped GROUP BY category ORDER BY sum(revenue) DESC`,
      ),
    ],
    { isolationLevel: "RepeatableRead" },
  );
  return {
    rows,
    total: Number(total[0].count),
    categories,
    page: p.page,
    pageSize: 10,
  };
}
