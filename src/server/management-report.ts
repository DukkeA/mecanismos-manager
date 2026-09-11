import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "./db";
import { marginSource } from "./hub-query";
import { requirePermission } from "@/domain/permissions";
import type { Actor } from "./commands";
export async function managementReport(actor: Actor, params: URLSearchParams) {
  requirePermission(actor.role, "members:write");
  const input = z
    .object({ from: z.iso.date().optional(), to: z.iso.date().optional() })
    .parse(Object.fromEntries(params));
  const from = input.from
    ? new Date(`${input.from}T00:00:00-05:00`)
    : new Date("2000-01-01");
  const to = input.to
    ? new Date(new Date(`${input.to}T00:00:00-05:00`).getTime() + 86400000)
    : new Date("2100-01-01");
  const [groups, causes, team] = await Promise.all([
    db().$queryRaw(Prisma.sql`WITH margins AS (${marginSource}), cohort AS (
      SELECT s.id,s.kind type,s."orderId" FROM workshop."Sale" s LEFT JOIN workshop."WorkOrder" o ON o.id=s."orderId" WHERE s.status='ISSUED' AND s."issuedOn">=${from}::date AND s."issuedOn"<${to}::date
    ) SELECT c.type,count(*)::int sales,count(*) FILTER(WHERE w.cases>0)::int affected,COALESCE(sum(w.cases),0)::int cases,
      COALESCE(sum(m.amount) FILTER(WHERE m.status='CLOSED'),0)::text margin,
      count(*) FILTER(WHERE m.id IS NOT NULL AND m.amount IS NULL)::int incomplete,
      COALESCE(sum(w.cost),0)::text "warrantyCost",COALESCE(sum(w.unknown),0)::int "warrantyUnknown"
      FROM cohort c LEFT JOIN margins m ON m.id=c."orderId"
      LEFT JOIN LATERAL(SELECT count(*) cases,sum((r.data->>'material')::numeric+(r.data->>'labor')::numeric) FILTER(WHERE (r.data->>'missingMinutes')::int=0 AND NOT (r.data->>'missingMaterials')::boolean) cost,count(*) FILTER(WHERE (r.data->>'missingMinutes')::int>0 OR (r.data->>'missingMaterials')::boolean) unknown FROM workshop."WarrantyCase" w LEFT JOIN margins r ON r.id=w."repairOrderId" WHERE w."saleId"=c.id AND w.decision='ACCEPTED')w ON true GROUP BY c.type ORDER BY c.type`),
    db().$queryRaw(
      Prisma.sql`SELECT w.cause,count(*)::int cases FROM workshop."WarrantyCase" w JOIN workshop."Sale" s ON s.id=w."saleId" WHERE w.decision='ACCEPTED' AND s.status='ISSUED' AND s."issuedOn">=${from}::date AND s."issuedOn"<${to}::date GROUP BY w.cause ORDER BY count(*) DESC`,
    ),
    db()
      .$queryRaw(Prisma.sql`SELECT m.name,COALESCE(t.minutes,0)::int minutes,COALESCE(a.completed,0)::int completed,COALESCE(a.open,0)::int open FROM workshop."Member" m
      LEFT JOIN LATERAL(SELECT sum(minutes) minutes FROM (SELECT minutes FROM workshop."TimeEntry" WHERE "memberId"=m.id AND "workedOn">=${from}::date AND "workedOn"<${to}::date UNION ALL SELECT minutes FROM workshop."OvertimeEntry" WHERE "memberId"=m.id AND "workedOn">=${from}::date AND "workedOn"<${to}::date AND "voidedAt" IS NULL)entries)t ON true
      LEFT JOIN LATERAL(SELECT count(*) FILTER(WHERE task.status='DONE') completed,count(*) FILTER(WHERE task.status<>'DONE') open FROM workshop."TaskAssignment" a JOIN workshop."Task" task ON task.id=a."taskId" WHERE a."memberId"=m.id AND task."deletedAt" IS NULL AND task."createdAt">=${from} AND task."createdAt"<${to})a ON true
      WHERE m.role='MECHANIC' AND m.active ORDER BY m.name`),
  ]);
  return { groups, causes, team };
}
