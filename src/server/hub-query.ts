import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import type { Actor } from "./commands";
import { requirePermission } from "@/domain/permissions";
import type { HubPage, HubRow, HubResource } from "@/domain/hub";
const resources = [
  "purchases",
  "reservations",
  "transfers",
  "counts",
  "units",
  "warranties",
  "checks",
  "handovers",
  "assets",
  "rates",
  "margins",
  "closures",
  "recurring",
  "coverage",
  "audit",
] as const;
const inputSchema = z.object({
  resource: z.enum(resources),
  q: z.string().max(200).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce
    .number()
    .pipe(z.union([z.literal(10), z.literal(25), z.literal(50)]))
    .default(10),
  orderBy: z.enum(["title", "date", "amount"]).default("date"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  status: z.string().max(30).default(""),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  orderId: z.uuid().optional(),
  customerId: z.uuid().optional(),
  outstanding: z.enum(["true", "false"]).optional(),
});
const sql = Prisma.sql;
const definition: Record<HubResource, Prisma.Sql> = {
  purchases: sql`SELECT p.id, 'Compra '||p.number AS title, s.name AS subtitle,p."orderedOn" AS date,p.status, COALESCE(v.received,0)-COALESCE(pay.paid,0) AS amount,
 jsonb_build_object('supplierId',p."supplierId",'locationId',p."locationId",'reference',p.reference,'note',p.note,'dueOn',p."dueOn",'ordered',COALESCE(v.ordered,0),'received',COALESCE(v.received,0),'paid',COALESCE(pay.paid,0)) AS data,
 COALESCE(v.entries,'[]'::jsonb) AS entries
 FROM workshop."Purchase" p JOIN workshop."Supplier" s ON s.id=p."supplierId"
 LEFT JOIN LATERAL (SELECT sum(l.quantity*l."unitCost") ordered,sum(COALESCE(r.amount,0)) received,jsonb_agg(jsonb_build_object('id',l.id,'title',l.description,'data',jsonb_build_object('quantity',l.quantity,'received',COALESCE(r.quantity,0),'unitCost',l."unitCost",'condition',l.condition),'receipts',r.entries)) entries FROM workshop."PurchaseLine" l LEFT JOIN LATERAL(SELECT sum(amount) amount,sum(quantity) quantity,jsonb_agg(jsonb_build_object('id',id,'quantity',quantity,'amount',amount,'originalId',"originalId")) entries FROM workshop."PurchaseReceipt" WHERE "lineId"=l.id)r ON true WHERE l."purchaseId"=p.id)v ON true
 LEFT JOIN LATERAL(SELECT sum(CASE WHEN e.direction='OUT' THEN e.amount ELSE -e.amount END) paid FROM workshop."SupplierPayment" sp JOIN workshop."CashEntry" e ON e.id=sp."entryId" WHERE sp."purchaseId"=p.id AND NOT EXISTS(SELECT 1 FROM workshop."CashEntry" x WHERE x."reversalOfId"=e.id))pay ON true`,
  reservations: sql`SELECT r.id,i.name title,'OT-'||o.number||' · '||l.name subtitle,r."createdAt" date,r.status,r.quantity amount,jsonb_build_object('orderId',r."orderId",'itemId',r."itemId",'quantity',r.quantity,'condition',r.condition) data FROM workshop."StockReservation" r JOIN workshop."CatalogItem" i ON i.id=r."itemId" JOIN workshop."WorkOrder" o ON o.id=r."orderId" JOIN workshop."Location" l ON l.id=r."locationId"`,
  transfers: sql`SELECT t.id,i.name title,l1.name||' → '||l2.name subtitle,t."createdAt" date,'RECORDED' status,abs(o.quantity) amount,jsonb_build_object('quantity',abs(o.quantity),'cost',abs(o."materialAmount"),'note',o.reason) data FROM workshop."StockTransfer" t JOIN workshop."StockMovement" o ON o.id=t."outboundId" JOIN workshop."StockMovement" n ON n.id=t."inboundId" JOIN workshop."CatalogItem" i ON i.id=o."itemId" JOIN workshop."Location" l1 ON l1.id=o."locationId" JOIN workshop."Location" l2 ON l2.id=n."locationId"`,
  counts: sql`SELECT c.id,l.name title,c.note subtitle,c."cutoffAt" date,c.status,jsonb_array_length(c.rows)::numeric amount,jsonb_build_object('rows',c.rows,'appliedAt',c."appliedAt") data FROM workshop."InventoryCount" c JOIN workshop."Location" l ON l.id=c."locationId"`,
  units: sql`SELECT u.id,u.code||' · '||i.name title,l.name subtitle,u."createdAt" date,u.status,u."coreCost"+COALESCE(u."rebuildCost",0) amount,jsonb_build_object('serial',u.serial,'coreCost',u."coreCost",'rebuildCost',u."rebuildCost",'orderId',u."orderId",'saleId',u."saleId") data FROM workshop."SerializedUnit" u JOIN workshop."CatalogItem" i ON i.id=u."itemId" JOIN workshop."Location" l ON l.id=u."locationId"`,
  warranties: sql`SELECT w.id,'Garantía · Venta '||s.number title,c.name subtitle,w."createdAt" date,w.decision status,NULL::numeric amount,jsonb_build_object('orderId',w."repairOrderId",'symptom',w.symptom,'diagnosis',w.diagnosis,'cause',w.cause,'originalOrderId',w."originalOrderId",'reviewer',m.name) data FROM workshop."WarrantyCase" w JOIN workshop."Sale" s ON s.id=w."saleId" JOIN workshop."Customer" c ON c.id=s."customerId" LEFT JOIN workshop."Member" m ON m.id=w."reviewerId"`,
  checks: sql`SELECT c.id,c.name title,'OT-'||o.number||' · '||m.name subtitle,c."createdAt" date,c.result status,NULL::numeric amount,jsonb_build_object('orderId',c."orderId",'readings',c.readings) data FROM workshop."OrderCheck" c JOIN workshop."WorkOrder" o ON o.id=c."orderId" JOIN workshop."Member" m ON m.id=c."actorId"`,
  handovers: sql`SELECT h.id,'OT-'||o.number title,h."acceptedBy" subtitle,h."createdAt" date,h.kind status,NULL::numeric amount,jsonb_build_object('orderId',h."orderId",'condition',h.condition,'inventory',h.inventory,'note',h.note,'acceptedBy',h."acceptedBy") data FROM workshop."OrderHandover" h JOIN workshop."WorkOrder" o ON o.id=h."orderId"`,
  assets: sql`SELECT a.id,a.description title,COALESCE(a.plate,a.serial,'')||' · '||COALESCE(c.name,'Unidad propia') subtitle,COALESCE(o.latest,'1970-01-01'::timestamptz) date,a.kind::text status,NULL::numeric amount,jsonb_build_object('customerId',a."customerId",'plate',a.plate,'serial',a.serial,'history',COALESCE(o.history,'[]'::jsonb)) data FROM workshop."Asset" a LEFT JOIN workshop."Customer" c ON c.id=a."customerId" LEFT JOIN LATERAL(SELECT max(w."receivedAt") latest,jsonb_agg(jsonb_build_object('orderId',w.id,'number',w.number,'customer',x.name,'receivedAt',w."receivedAt",'status',w.status) ORDER BY w."receivedAt" DESC) history FROM workshop."OrderAsset" oa JOIN workshop."WorkOrder" w ON w.id=oa."orderId" LEFT JOIN workshop."Customer" x ON x.id=w."customerId" WHERE oa."assetId"=a.id)o ON true`,
  rates: sql`SELECT r.id,m.name title,r.note subtitle,r."effectiveOn" date,'EFFECTIVE' status,r."hourlyCost" amount,jsonb_build_object('memberId',r."memberId",'note',r.note) data FROM workshop."LaborRate" r JOIN workshop."Member" m ON m.id=r."memberId"`,
  margins: sql`SELECT o.id,'OT-'||o.number||' · '||o.title title,COALESCE(c.name,'Reconstrucción propia') subtitle,o."receivedAt" date,o.status::text status,CASE WHEN s.revenue IS NULL OR COALESCE(t.missing,0)>0 OR COALESCE(mat.missing,false) THEN NULL ELSE COALESCE(s.revenue,0)-COALESCE(mat.cost,0)-COALESCE(t.cost,0) END amount,jsonb_build_object('revenue',COALESCE(s.revenue,0),'material',COALESCE(mat.cost,0),'labor',round(COALESCE(t.cost,0),2),'minutes',COALESCE(t.minutes,0),'missingMinutes',COALESCE(t.missing,0),'missingMaterials',COALESCE(mat.missing,false),'purpose',o.purpose,'estimatedMaterials',est.cost) data FROM workshop."WorkOrder" o LEFT JOIN workshop."Customer" c ON c.id=o."customerId"
 LEFT JOIN LATERAL(SELECT sum(v.total-COALESCE(r.amount,0)) revenue FROM workshop."Sale" v LEFT JOIN LATERAL(SELECT sum(amount) amount FROM workshop."SaleReturn" WHERE "saleId"=v.id)r ON true WHERE v."orderId"=o.id AND v.status='ISSUED')s ON true
 LEFT JOIN LATERAL(SELECT -sum("materialAmount") cost,bool_or(NOT "costKnown" AND quantity<0) missing FROM workshop."StockMovement" WHERE "orderId"=o.id)mat ON true
 LEFT JOIN LATERAL(SELECT sum(x.minutes) minutes,sum(x.missing) missing,round(sum(x.cost),2) cost FROM (
   SELECT e.minutes,CASE WHEN r.id IS NULL THEN e.minutes ELSE 0 END missing,e.minutes*r."hourlyCost"/60.0 cost FROM workshop."TimeEntry" e JOIN workshop."Task" task ON task.id=e."taskId" LEFT JOIN LATERAL(SELECT id,"hourlyCost" FROM workshop."LaborRate" WHERE "memberId"=e."memberId" AND "effectiveOn"<=e."workedOn" ORDER BY "effectiveOn" DESC LIMIT 1)r ON true WHERE task."orderId"=o.id
   UNION ALL SELECT e.minutes,0 missing,e.pay+e."employerCost" cost FROM workshop."OvertimeEntry" e JOIN workshop."Task" task ON task.id=e."taskId" WHERE task."orderId"=o.id AND e."voidedAt" IS NULL
 )x)t ON true
 LEFT JOIN LATERAL(SELECT CASE WHEN count(*) FILTER(WHERE l.kind='PART' AND l."estimatedUnitCost" IS NULL)>0 THEN NULL ELSE sum(COALESCE(l."estimatedUnitCost",0)*l.quantity) END cost FROM workshop."QuoteLine" l WHERE l."quoteId"=(SELECT id FROM workshop."Quote" WHERE "orderId"=o.id AND status='APPROVED' ORDER BY "createdAt" DESC LIMIT 1))est ON true`,
  closures: sql`SELECT c.id,a.name title,c.note subtitle,c."throughOn" date,CASE WHEN c."reopenedAt" IS NULL THEN 'CLOSED' ELSE 'REOPENED' END status,c.difference amount,jsonb_build_object('expected',c.expected,'counted',c.counted,'difference',c.difference,'reopenReason',c."reopenReason") data FROM workshop."CashClosure" c JOIN workshop."MoneyAccount" a ON a.id=c."accountId"`,
  recurring: sql`SELECT id,title,category subtitle,"createdAt" date,CASE WHEN active THEN 'ACTIVE' ELSE 'INACTIVE' END status,amount,jsonb_build_object('category',category,'dueDay',"dueDay",'active',active) data FROM workshop."RecurringExpense"`,
  coverage: sql`SELECT period id,period title,note subtitle,"confirmedAt" date,CASE WHEN confirmed THEN 'CONFIRMED' ELSE 'ESTIMATED' END status,NULL::numeric amount,jsonb_build_object('note',note) data FROM workshop."MonthCoverage"`,
  audit: sql`SELECT a.id,a.action title,m.name subtitle,a."createdAt" date,'RECORDED' status,NULL::numeric amount,jsonb_build_object('entityId',a."entityId",'details',a.details) data FROM workshop."AuditEvent" a LEFT JOIN workshop."Member" m ON m.id=a."actorId"`,
};
export const marginSource = definition.margins;
export async function hubPage(
  actor: Actor,
  params: URLSearchParams,
): Promise<HubPage> {
  const input = inputSchema.parse(Object.fromEntries(params));
  if (["audit", "rates", "margins", "coverage"].includes(input.resource))
    requirePermission(actor.role, "members:write");
  else if (input.resource !== "checks")
    requirePermission(actor.role, "orders:write");
  const q = `%${input.q}%`,
    filters: Prisma.Sql[] = [
      sql`(v.title ILIKE ${q} OR COALESCE(v.subtitle,'') ILIKE ${q})`,
    ];
  if (input.status) filters.push(sql`v.status=${input.status}`);
  if (input.resource === "purchases" && input.outstanding === "true")
    filters.push(sql`v.amount > 0`);
  if (input.from) filters.push(sql`v.date>=${new Date(input.from)}`);
  if (input.to)
    filters.push(
      sql`v.date<${new Date(new Date(input.to).getTime() + 86400000)}`,
    );
  if (input.customerId)
    filters.push(sql`v.data->>'customerId'=${input.customerId}`);
  if (input.orderId) filters.push(sql`v.data->>'orderId'=${input.orderId}`);
  if (actor.role === "MECHANIC")
    filters.push(
      sql`EXISTS(SELECT 1 FROM workshop."Task" t JOIN workshop."TaskAssignment" ta ON ta."taskId"=t.id WHERE t."orderId"::text=v.data->>'orderId' AND t."deletedAt" IS NULL AND ta."memberId"=${actor.id}::uuid)`,
    );
  if (actor.role !== "ADMIN" && input.resource === "recurring")
    filters.push(sql`v.subtitle<>'PAYROLL'`);
  const base = sql`FROM (${definition[input.resource]}) v WHERE ${Prisma.join(filters, " AND ")}`,
    sort = Prisma.raw(
      `v."${input.orderBy}" ${input.direction.toUpperCase()} NULLS LAST, v.id ASC`,
    );
  const [records, total] = await Promise.all([
    db().$queryRaw<HubRow[]>(
      sql`SELECT * ${base} ORDER BY ${sort} LIMIT ${input.pageSize} OFFSET ${(input.page - 1) * input.pageSize}`,
    ),
    db().$queryRaw<{ total: bigint }[]>(sql`SELECT count(*) total ${base}`),
  ]);
  return {
    rows: records.map((r) => ({
      ...r,
      date: ["purchases", "rates", "closures"].includes(input.resource)
        ? new Date(r.date).toISOString().slice(0, 10)
        : new Date(r.date).toISOString(),
      amount: r.amount == null ? undefined : String(r.amount),
      data: Object.fromEntries(
        Object.entries(r.data).map(([k, v]) => [
          k,
          v == null
            ? ""
            : typeof v === "object"
              ? JSON.stringify(v)
              : String(v),
        ]),
      ),
      entries: r.entries?.map((e) => ({
        ...e,
        data: Object.fromEntries(
          Object.entries(e.data).map(([k, v]) => [k, String(v)]),
        ),
      })),
    })),
    total: Number(total[0].total),
    page: input.page,
    pageSize: input.pageSize,
  };
}
