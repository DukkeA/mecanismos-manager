import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "./db";
import { saleProfitSource } from "./profitability-source";
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
      businessCategoryId: z.union([z.uuid(), z.literal("NONE")]).optional(),
      businessOrderBy: z
        .enum(["name", "revenue", "cost", "margin"])
        .default("revenue"),
      businessDirection: z.enum(["asc", "desc"]).default("desc"),
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
  const base = sql`WITH margins AS (${saleProfitSource}), lines AS (
    SELECT l."itemId" id,i.name,i.reference,l."businessCategoryId",COALESCE(bc.name,'Sin categoría') "businessCategory",CASE WHEN l.kind='SERVICE' THEN 'SERVICE' ELSE l.condition::text END category,
      l.quantity-COALESCE(r.quantity,0) quantity,l.total-COALESCE(r.amount,0) revenue,
      CASE WHEN m.complete AND (s."orderId" IS NULL OR m."orderStatus"='CLOSED') THEN
        CASE WHEN s."orderId" IS NOT NULL THEN m.cost*l.total/s.total
          ELSE l."materialCost"-COALESCE(r.cost,0)+m."warrantyCost"*l.total/s.total END END cost
    FROM workshop."SaleLine" l JOIN workshop."Sale" s ON s.id=l."saleId" JOIN workshop."CatalogItem" i ON i.id=l."itemId"
    LEFT JOIN workshop."BusinessCategory" bc ON bc.id=l."businessCategoryId"
    LEFT JOIN margins m ON m.id=s.id
    LEFT JOIN LATERAL(SELECT sum(total) amount FROM workshop."Sale" WHERE "orderId"=s."orderId" AND status='ISSUED')gross ON true
    LEFT JOIN LATERAL(SELECT sum(rl.quantity) quantity,sum(rl.amount) amount,sum(CASE WHEN sm.id IS NOT NULL THEN sm."materialAmount" ELSE l."materialCost"*rl.quantity/l.quantity END) cost FROM workshop."SaleReturnLine" rl LEFT JOIN workshop."StockMovement" sm ON sm.id=rl."movementId" WHERE rl."saleLineId"=l.id)r ON true
    WHERE s.status='ISSUED' AND s."issuedOn">=${p.from ?? "2000-01-01"}::date AND s."issuedOn"<=${p.to ?? "2100-01-01"}::date
  ), grouped AS (SELECT id,name,reference,category,"businessCategoryId","businessCategory",sum(quantity) quantity,sum(revenue) revenue,
    CASE WHEN count(*) FILTER(WHERE cost IS NULL)=0 THEN sum(COALESCE(cost,0)) END cost,
    count(*) FILTER(WHERE cost IS NULL)::int missing FROM lines GROUP BY id,name,reference,category,"businessCategoryId","businessCategory"), filtered AS (
    SELECT *,revenue-cost margin FROM grouped WHERE (name ILIKE ${`%${p.q}%`} OR reference ILIKE ${`%${p.q}%`}) AND (${p.category ?? null}::text IS NULL OR category=${p.category ?? null})
      AND (${p.businessCategoryId ?? null}::text IS NULL OR COALESCE("businessCategoryId"::text,'NONE')=${p.businessCategoryId ?? null})
  )`;
  const [rows, total, categories, businessCategories] = await db().$transaction(
    [
      db().$queryRaw<ProductResult[]>(
        sql`${base} SELECT id,name,reference,category,"businessCategoryId","businessCategory",quantity::text,revenue::text,round(cost,2)::text cost,round(margin,2)::text margin,missing FROM filtered ORDER BY ${Prisma.raw(`filtered."${p.orderBy}"`)} ${Prisma.raw(p.direction)} NULLS LAST,id,category,"businessCategoryId" LIMIT 10 OFFSET ${(p.page - 1) * 10}`,
      ),
      db().$queryRaw<{ count: bigint }[]>(
        sql`${base} SELECT count(*) FROM filtered`,
      ),
      db().$queryRaw<ProductResults["categories"]>(
        sql`${base} SELECT category,sum(revenue)::text revenue FROM filtered GROUP BY category ORDER BY sum(revenue) DESC`,
      ),
      db().$queryRaw<ProductResults["businessCategories"]>(sql`${base}
        SELECT "businessCategoryId" id,"businessCategory" name,sum(revenue)::text revenue,
          CASE WHEN sum(missing)=0 THEN round(sum(cost),2)::text END cost,
          CASE WHEN sum(missing)=0 THEN round(sum(margin),2)::text END margin,
          CASE WHEN sum(missing)=0 AND sum(revenue)>0 THEN round(sum(margin)*100/sum(revenue),1)::text END "marginPercent",
          sum(missing)::int missing
        FROM filtered GROUP BY "businessCategoryId","businessCategory" ORDER BY ${Prisma.raw({ name: '"businessCategory"', revenue: "sum(revenue)", cost: "CASE WHEN sum(missing)=0 THEN sum(cost) END", margin: "CASE WHEN sum(missing)=0 THEN sum(margin) END" }[p.businessOrderBy])} ${Prisma.raw(p.businessDirection)} NULLS LAST,"businessCategory"`),
    ],
    { isolationLevel: "RepeatableRead" },
  );
  return {
    rows,
    total: Number(total[0].count),
    categories,
    businessCategories,
    page: p.page,
    pageSize: 10,
  };
}
