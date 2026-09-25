import "server-only";
import Decimal from "decimal.js";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/domain/permissions";
import type {
  ProfitabilityJob,
  ProfitabilityOverview,
} from "@/domain/profitability";
import { db } from "./db";
import type { Actor, Tx } from "./commands";
import { monthlyPayroll } from "./employee-benefits-query";
import { orderCostSource, saleProfitSource } from "./profitability-source";

const sql = Prisma.sql;
type Value = { toString(): string } | string | number;
const money = (value: Value | null | undefined) =>
  new Decimal(value?.toString() ?? 0).toFixed(2);
type CostRow = {
  id: string;
  orderId: string | null;
  number: number;
  title: string;
  customer: string;
  purpose?: string;
  kind?: string;
  orderStatus?: string | null;
  status?: string;
  unitOrderId?: string | null;
  coreCost?: Value;
  originalSaleId?: string | null;
  revenue?: Value | null;
  material: Value;
  labor: Value;
  expenses: Value;
  warrantyCost?: Value;
  cost?: Value;
  margin?: Value | null;
  balance?: Value;
  missingMinutes: number;
  missingMaterials: boolean;
  missingTasks: number;
  unconsumedParts: number;
  estimatedExpenses: number;
  missingLines?: number;
  warrantyPending?: number;
};
function job(row: CostRow, sale: boolean): ProfitabilityJob {
  const pending: string[] = [];
  if (row.missingTasks) pending.push("Registrar tiempo en las tareas");
  if (row.missingMinutes) pending.push("Configurar costo por hora en Equipo");
  if (row.missingMaterials || row.missingLines)
    pending.push(
      "Completar costos de repuestos o vincular el servicio a un trabajo",
    );
  if (row.unconsumedParts)
    pending.push("Registrar los repuestos usados en el trabajo");
  if (row.estimatedExpenses) pending.push("Confirmar gastos del trabajo");
  if (row.warrantyPending)
    pending.push("Completar diagnóstico, trabajo y costos de garantía");
  const status = row.orderStatus ?? row.status ?? "CLOSED";
  if (sale && row.orderId && status !== "CLOSED")
    pending.push("Terminar y cerrar el trabajo");
  if (!sale && row.purpose === "CUSTOMER_REPAIR" && status !== "CANCELLED")
    pending.push("Registrar la venta del trabajo");
  return {
    id: row.id,
    saleId: sale ? row.id : null,
    orderId: sale ? (row.orderId ?? row.unitOrderId ?? null) : row.id,
    originalSaleId: row.originalSaleId ?? null,
    label: `${sale ? "VTA" : "OT"}-${row.number}`,
    title: row.title,
    customer: row.customer,
    purpose: row.purpose ?? row.kind ?? "",
    status,
    revenue: sale ? money(row.revenue) : null,
    material: money(
      new Decimal(row.material.toString()).plus(row.coreCost?.toString() ?? 0),
    ),
    labor: money(row.labor),
    expenses: money(row.expenses),
    warrantyCost: money(row.warrantyCost),
    cost: money(
      row.cost ??
        new Decimal(row.material.toString())
          .plus(row.coreCost?.toString() ?? 0)
          .plus(row.labor.toString())
          .plus(row.expenses.toString()),
    ),
    margin: sale && row.margin != null ? money(row.margin) : null,
    balance: sale ? money(row.balance) : null,
    pending,
  };
}

export async function profitabilityDetail(
  actor: Actor,
  params: URLSearchParams,
): Promise<ProfitabilityJob | null> {
  requirePermission(actor.role, "profitability:read");
  const { orderId, saleId } = z
    .object({ orderId: z.uuid().optional(), saleId: z.uuid().optional() })
    .refine((v) => !!v.orderId !== !!v.saleId)
    .parse(Object.fromEntries(params));
  const [sale] = await db().$queryRaw<
    CostRow[]
  >(sql`SELECT * FROM (${saleProfitSource}) s
    WHERE ${saleId ? sql`s.id=${saleId}::uuid` : sql`(s."orderId"=${orderId}::uuid OR s."unitOrderId"=${orderId}::uuid)`}`);
  if (sale) return job(sale, true);
  if (!orderId) return null;
  const [order] = await db().$queryRaw<
    CostRow[]
  >(sql`SELECT c.*,o.number,o.title,u."coreCost",w."saleId" "originalSaleId",COALESCE(customer.name,'Unidad propia') customer
    FROM (${orderCostSource}) c JOIN workshop."WorkOrder" o ON o.id=c.id
    LEFT JOIN workshop."SerializedUnit" u ON u."orderId"=o.id
    LEFT JOIN workshop."WarrantyCase" w ON w."repairOrderId"=o.id
    LEFT JOIN workshop."Customer" customer ON customer.id=o."customerId" WHERE c.id=${orderId}::uuid`);
  return order ? job(order, false) : null;
}

// These are period events, unlike the lifetime/cohort margins above. A sale in
// August returned in September reduces September revenue and recovered stock.
const materialEvents = sql`
SELECT s."issuedOn" date,
  CASE WHEN s.kind='UNIT' THEN l."materialCost"-l."laborCost"-l."expenseCost" ELSE l."materialCost" END amount,
  (l."materialCost" IS NULL OR s.kind='UNIT' AND (l."laborCost" IS NULL OR l."expenseCost" IS NULL)) missing
FROM workshop."SaleLine" l JOIN workshop."Sale" s ON s.id=l."saleId"
WHERE s.status='ISSUED' AND s."orderId" IS NULL AND l.kind='PART'
UNION ALL
SELECT r."occurredOn",-CASE WHEN s.kind='UNIT' THEN (l."materialCost"-l."laborCost"-l."expenseCost")*rl.quantity/l.quantity
  ELSE COALESCE(sm."materialAmount",l."materialCost"*rl.quantity/l.quantity) END,
  CASE WHEN s.kind='UNIT' THEN l."laborCost" IS NULL OR l."expenseCost" IS NULL OR l."materialCost" IS NULL
    ELSE l."materialCost" IS NULL OR (sm.id IS NOT NULL AND NOT sm."costKnown") END
FROM workshop."SaleReturnLine" rl JOIN workshop."SaleReturn" r ON r.id=rl."returnId"
JOIN workshop."SaleLine" l ON l.id=rl."saleLineId" JOIN workshop."Sale" s ON s.id=l."saleId"
LEFT JOIN workshop."StockMovement" sm ON sm.id=rl."movementId"
WHERE s.status='ISSUED' AND s."orderId" IS NULL AND l.kind='PART'
UNION ALL
SELECT CASE
  WHEN o.purpose='WARRANTY' AND NOT (w.decision='REJECTED' AND s.id IS NOT NULL) THEN COALESCE(m."occurredOn",(m."createdAt" AT TIME ZONE 'America/Bogota')::date)
  WHEN s.id IS NOT NULL THEN GREATEST(s."issuedOn",COALESCE(m."occurredOn",(m."createdAt" AT TIME ZONE 'America/Bogota')::date))
  WHEN o.status='CANCELLED' THEN GREATEST((COALESCE(o."closedAt",o."receivedAt") AT TIME ZONE 'America/Bogota')::date,COALESCE(m."occurredOn",(m."createdAt" AT TIME ZONE 'America/Bogota')::date))
  END date,-m."materialAmount" amount,NOT m."costKnown" missing
FROM workshop."StockMovement" m JOIN workshop."WorkOrder" o ON o.id=m."orderId"
LEFT JOIN workshop."WarrantyCase" w ON w."repairOrderId"=o.id
LEFT JOIN workshop."Sale" s ON s."orderId"=o.id AND s.status='ISSUED'
WHERE o.purpose<>'OWN_REBUILD'
UNION ALL
SELECT COALESCE(m."occurredOn",(m."createdAt" AT TIME ZONE 'America/Bogota')::date),-m."materialAmount",NOT m."costKnown"
FROM workshop."StockMovement" m LEFT JOIN workshop."StockMovement" original ON original.id=m."reversalOfId"
WHERE m."orderId" IS NULL AND COALESCE(original.kind,m.kind) IN ('ADJUSTMENT_IN','ADJUSTMENT_OUT','COUNT')`;

async function monthly(tx: Tx, period: string): Promise<ProfitabilityOverview> {
  const from = `${period}-01`,
    until = new Date(`${from}T00:00:00Z`);
  until.setUTCMonth(until.getUTCMonth() + 1);
  const to = until.toISOString().slice(0, 10);
  const [
    events,
    payroll,
    obligations,
    coverage,
    sales,
    orders,
    expenses,
    quality,
  ] = await Promise.all([
    tx.$queryRaw<{ revenue: Value; material: Value; missing: number }[]>(sql`
      WITH revenue AS (
        SELECT "issuedOn" date,total amount FROM workshop."Sale" WHERE status='ISSUED'
        UNION ALL SELECT r."occurredOn",-r.amount FROM workshop."SaleReturn" r JOIN workshop."Sale" s ON s.id=r."saleId" WHERE s.status='ISSUED'
      ), material AS (${materialEvents})
      SELECT (SELECT COALESCE(sum(amount),0) FROM revenue WHERE date>=${from}::date AND date<${to}::date) revenue,
        COALESCE(sum(amount),0) material,count(*) FILTER(WHERE missing)::int missing FROM material WHERE date>=${from}::date AND date<${to}::date`),
    monthlyPayroll(tx, period),
    tx.obligation.findMany({ where: { period, salaryPeriod: null } }),
    tx.monthCoverage.findUnique({ where: { period } }),
    tx.$queryRaw<CostRow[]>(
      sql`SELECT * FROM (${saleProfitSource}) s WHERE s."issuedOn">=${from}::date AND s."issuedOn"<${to}::date ORDER BY s."issuedOn" DESC,s.number DESC`,
    ),
    tx.$queryRaw<
      CostRow[]
    >(sql`SELECT c.*,o.number,o.title,u."coreCost",w."saleId" "originalSaleId",COALESCE(customer.name,'Unidad propia') customer
      FROM (${orderCostSource}) c JOIN workshop."WorkOrder" o ON o.id=c.id
      LEFT JOIN workshop."SerializedUnit" u ON u."orderId"=o.id
      LEFT JOIN workshop."WarrantyCase" w ON w."repairOrderId"=o.id
      LEFT JOIN workshop."Customer" customer ON customer.id=o."customerId"
      WHERE NOT EXISTS(SELECT 1 FROM workshop."Sale" s WHERE s."orderId"=o.id AND s.status='ISSUED')
      AND (u.id IS NULL OR u.status<>'SOLD')
      AND (o."receivedAt" AT TIME ZONE 'America/Bogota')::date<${to}::date
      AND (o.status NOT IN ('CLOSED','CANCELLED') OR (COALESCE(o."closedAt",o."receivedAt") AT TIME ZONE 'America/Bogota')::date>=${from}::date)
      ORDER BY o."receivedAt" DESC,o.number DESC`),
    tx.$queryRaw<
      { amount: Value }[]
    >(sql`SELECT COALESCE(sum(CASE WHEN e.direction='OUT' THEN e.amount ELSE -e.amount END),0) amount
      FROM workshop."CashEntry" e LEFT JOIN workshop."CashEntry" original ON original.id=e."reversalOfId"
      WHERE e."obligationId" IS NULL AND COALESCE(original.kind,e.kind)='EXPENSE_PAYMENT'
      AND e."occurredOn">=${from}::date AND e."occurredOn"<${to}::date`),
    tx.$queryRaw<
      { parts: number; legacy: number; inactive: string[] }[]
    >(sql`SELECT
      (SELECT count(*)::int FROM (${orderCostSource}) o WHERE o."unconsumedParts">0 AND EXISTS(SELECT 1 FROM workshop."Sale" s WHERE s."orderId"=o.id AND s.status='ISSUED' AND s."issuedOn">=${from}::date AND s."issuedOn"<${to}::date)) parts,
      (SELECT count(*)::int FROM workshop."Sale" s WHERE s.status='ISSUED' AND s."orderId" IS NULL AND EXISTS(SELECT 1 FROM workshop."SaleLine" l WHERE l."saleId"=s.id AND l.kind='SERVICE') AND s."issuedOn">=${from}::date AND s."issuedOn"<${to}::date) legacy,
      ARRAY(SELECT m.id::text FROM workshop."Member" m JOIN LATERAL (
        SELECT "monthlySalary" FROM workshop."LaborRate" r WHERE r."memberId"=m.id AND r."effectiveOn"<${to}::date ORDER BY r."effectiveOn" DESC LIMIT 1
      ) r ON true WHERE NOT m.active AND r."monthlySalary">0) inactive`),
  ]);
  const expenseTotal = obligations.reduce(
    (s, o) => s.plus(o.amount.toString()),
    new Decimal(expenses[0].amount.toString()),
  );
  // Salary advances are receivables, not reductions in the cost of employing someone.
  const salaryTotal = payroll.rows.reduce(
    (s, r) =>
      s
        .plus(r.salary ?? 0)
        .plus(r.bonuses)
        .minus(r.leaveDeduction),
    new Decimal(0),
  );
  const pending: ProfitabilityOverview["pending"] = [];
  const add = (label: string, view: string, extra = "") =>
    pending.push({
      label,
      href: `?view=${encodeURIComponent(view)}&period=${period}${extra}`,
    });
  if (!coverage?.confirmed)
    add(
      "Revisar y confirmar los gastos del mes",
      "Caja",
      "&moneyTab=review&controlTab=coverage",
    );
  if (obligations.some((o) => o.estimated))
    add(
      "Confirmar los importes estimados de gastos",
      "Caja",
      "&moneyTab=obligations",
    );
  const missingSalary = payroll.rows.filter((r) => r.salary === null).length;
  if (missingSalary)
    add(
      `${missingSalary} personas sin salario configurado (registra cero si no devengan salario)`,
      "Equipo",
    );
  if (
    quality[0].inactive.some(
      (id) => !payroll.rows.some((r) => r.memberId === id),
    )
  )
    add(
      "Revisar salarios del personal inactivo: falta confirmar si trabajó en este mes",
      "Equipo",
    );
  if (!obligations.some((o) => o.category === "PAYROLL") && salaryTotal.gt(0))
    add(
      "Registrar los aportes y prestaciones del mes",
      "Caja",
      "&moneyTab=obligations",
    );
  if (events[0].missing)
    add(
      `${events[0].missing} movimientos sin costo completo o desglose histórico de unidad`,
      "Inventario",
    );
  if (quality[0].parts)
    add(
      `${quality[0].parts} trabajos vendidos con repuestos pendientes de registrar`,
      "Órdenes",
    );
  if (quality[0].legacy)
    add(
      `${quality[0].legacy} ventas históricas de servicio sin trabajo asociado`,
      "Ventas",
    );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
  }).format(new Date());
  if (period >= today.slice(0, 7))
    add(
      "Mes en curso: el cálculo incluye la nómina completa del mes",
      "Equipo",
    );
  const result = new Decimal(events[0].revenue.toString())
    .minus(events[0].material.toString())
    .minus(salaryTotal)
    .minus(expenseTotal);
  const jobs = [
    ...sales.map((s) => job(s, true)),
    ...orders.map((o) => job(o, false)),
  ];
  return {
    period,
    revenue: money(events[0].revenue),
    materials: money(events[0].material),
    payroll: money(salaryTotal),
    expenses: money(expenseTotal),
    knownResult: money(result),
    result: pending.length ? null : money(result),
    pending,
    jobs,
    incompleteJobs: jobs.filter((j) => j.pending.length).length,
    workInProgress: money(
      orders
        .filter((o) => o.purpose !== "WARRANTY" && o.status !== "CANCELLED")
        .reduce(
          (s, o) =>
            s
              .plus(o.material.toString())
              .plus(o.coreCost?.toString() ?? 0)
              .plus(o.labor.toString())
              .plus(o.expenses.toString()),
          new Decimal(0),
        ),
    ),
  };
}

export async function profitabilityOverview(
  actor: Actor,
  params: URLSearchParams,
) {
  requirePermission(actor.role, "profitability:read");
  const { period } = z
    .object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })
    .parse(Object.fromEntries(params));
  return db().$transaction((tx) => monthly(tx, period), {
    isolationLevel: "RepeatableRead",
    timeout: 30000,
  });
}
