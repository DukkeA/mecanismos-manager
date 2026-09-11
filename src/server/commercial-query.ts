import "server-only";
import { z } from "zod";
import Decimal from "decimal.js";
import { db } from "./db";
import type { Actor } from "./commands";
import { requirePermission } from "@/domain/permissions";
import type {
  CommercialPage,
  CommercialRow,
  CommercialLine,
} from "@/domain/commercial";

const paramsSchema = z.object({
  resource: z.enum(["quotes", "sales", "payments"]).default("quotes"),
  q: z.string().trim().max(200).default(""),
  status: z.string().max(20).default(""),
  customerId: z.uuid().optional(),
  orderId: z.uuid().optional(),
  recordId: z.uuid().optional(),
  outstanding: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce
    .number()
    .refine((v) => [10, 25, 50].includes(v))
    .default(10),
  orderBy: z.enum(["date", "total", "customer", "number"]).default("date"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
const textDate = (date: Date) => date.toISOString().slice(0, 10);
const total = (values: { amount: { toString(): string } }[]) =>
  values.reduce((s, v) => s.plus(v.amount.toString()), new Decimal(0));
const plain = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;
export async function commercialPage(
  actor: Actor,
  params: URLSearchParams,
): Promise<CommercialPage> {
  requirePermission(actor.role, "finance:write");
  const input = paramsSchema.parse(Object.fromEntries(params));
  const {
    resource,
    q,
    status,
    customerId,
    page,
    pageSize,
    orderBy,
    direction,
  } = input;
  const dates =
    input.from || input.to
      ? {
          gte: input.from ? new Date(input.from) : undefined,
          lte: input.to ? new Date(`${input.to}T23:59:59.999Z`) : undefined,
        }
      : undefined;
  const customerFilter = customerId ? { customerId } : {};
  const shared = {
    ...(input.recordId ? { id: input.recordId } : {}),
    ...(input.orderId ? { orderId: input.orderId } : {}),
    ...customerFilter,
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            {
              customer: { name: { contains: q, mode: "insensitive" as const } },
            },
            ...(Number.isSafeInteger(Number(q)) ? [{ number: Number(q) }] : []),
          ],
        }
      : {}),
  };
  let rows: CommercialRow[] = [],
    count = 0;
  if (resource === "quotes") {
    const where = {
      ...shared,
      ...(status ? { status } : {}),
      ...(dates ? { createdAt: dates } : {}),
    };
    const sort =
      orderBy === "customer"
        ? { customer: { name: direction } }
        : { [orderBy === "date" ? "createdAt" : orderBy]: direction };
    const [records, n] = await Promise.all([
      db().quote.findMany({
        where,
        orderBy: [sort, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: true,
          order: true,
          lines: true,
          sale: { select: { id: true } },
        },
      }),
      db().quote.count({ where }),
    ]);
    count = n;
    rows = records.map((r) => ({
      id: r.id,
      number: r.number,
      title: r.title,
      customerId: r.customerId,
      customer: r.customer.name,
      status: r.status,
      total: r.total.toFixed(2),
      paid: "0",
      balance: r.total.toFixed(2),
      createdAt: r.createdAt.toISOString(),
      date: textDate(r.createdAt),
      dueOn: textDate(r.validUntil),
      orderId: r.orderId,
      orderNumber: r.order?.number,
      saleId: r.sale?.id,
      revision: r.revision,
      groupId: r.groupId,
      terms: r.terms,
      approvedBy: r.approvedBy,
      approvalNote: r.approvalNote,
      lines: plain<CommercialLine[]>(r.lines),
    }));
  } else if (resource === "sales") {
    const unpaid =
      input.outstanding === "true"
        ? await db().$queryRaw<{ id: string }[]>`
      SELECT s.id FROM workshop."Sale" s
      LEFT JOIN LATERAL (SELECT SUM(amount) amount FROM workshop."SaleReturn" WHERE "saleId"=s.id) r ON true
      LEFT JOIN LATERAL (SELECT SUM(amount) amount FROM workshop."PaymentAllocation" WHERE "saleId"=s.id) a ON true
      WHERE s.status='ISSUED' AND s.total-COALESCE(r.amount,0)-COALESCE(a.amount,0)>0
      AND (${customerId ?? null}::uuid IS NULL OR s."customerId"=${customerId ?? null}::uuid)
      AND (${input.recordId ?? null}::uuid IS NULL OR s.id=${input.recordId ?? null}::uuid)`
        : undefined;
    const where = {
      ...shared,
      ...(unpaid ? { id: { in: unpaid.map((s) => s.id) } } : {}),
      ...(status ? { status } : {}),
      ...(dates ? { issuedOn: dates } : {}),
    };
    const sort =
      orderBy === "customer"
        ? { customer: { name: direction } }
        : { [orderBy === "date" ? "issuedOn" : orderBy]: direction };
    const [records, n] = await Promise.all([
      db().sale.findMany({
        where,
        orderBy: [sort, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: true,
          order: true,
          lines: { include: { returnLines: true } },
          allocations: true,
          returns: true,
        },
      }),
      db().sale.count({ where }),
    ]);
    count = n;
    rows = records.map((r) => {
      const paid = total(r.allocations),
        value =
          r.status === "VOID"
            ? new Decimal(0)
            : new Decimal(r.total.toString()).minus(total(r.returns));
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        customerId: r.customerId,
        customer: r.customer.name,
        status: r.status,
        total: value.toFixed(2),
        paid: paid.toFixed(2),
        balance: value.minus(paid).toFixed(2),
        createdAt: r.createdAt.toISOString(),
        date: textDate(r.issuedOn),
        dueOn: textDate(r.dueOn),
        orderId: r.orderId,
        orderNumber: r.order?.number,
        terms: r.terms,
        invoiceReference: r.invoiceReference,
        lines: r.lines.map((l) => ({
          ...plain<CommercialLine>(l),
          returnedQuantity: l.returnLines
            .reduce((s, v) => s.plus(v.quantity.toString()), new Decimal(0))
            .toString(),
        })),
      };
    });
  } else {
    const where = {
      ...customerFilter,
      refundOfId: null,
      ...(q
        ? { customer: { name: { contains: q, mode: "insensitive" as const } } }
        : {}),
      ...(dates ? { entry: { occurredOn: dates } } : {}),
    };
    const sort =
      orderBy === "customer"
        ? { customer: { name: direction } }
        : orderBy === "total"
          ? { entry: { amount: direction } }
          : { createdAt: direction };
    const [records, n] = await Promise.all([
      db().customerPayment.findMany({
        where,
        orderBy: [sort, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: true,
          entry: { include: { reversal: true } },
          allocations: { include: { sale: true, reversal: true } },
          refunds: { include: { entry: { include: { reversal: true } } } },
        },
      }),
      db().customerPayment.count({ where }),
    ]);
    count = n;
    rows = records.map((r) => {
      const used = total(r.allocations),
        refund = total(
          r.refunds
            .filter((v) => !v.entry.reversal)
            .map((v) => ({ amount: v.entry.amount })),
        ),
        available = r.entry.reversal
          ? new Decimal(0)
          : new Decimal(r.entry.amount.toString()).minus(used).minus(refund);
      return {
        id: r.id,
        entryId: r.entryId,
        title: r.entry.reference || "Anticipo / cobro",
        customerId: r.customerId,
        customer: r.customer.name,
        status: r.entry.reversal ? "REVERSED" : "RECEIVED",
        total: r.entry.amount.toFixed(2),
        paid: used.toFixed(2),
        balance: available.toFixed(2),
        available: available.toFixed(2),
        createdAt: r.createdAt.toISOString(),
        date: textDate(r.entry.occurredOn),
        allocations: r.allocations
          .filter((a) => !a.reversalOfId)
          .map((a) => ({
            id: a.id,
            saleId: a.saleId,
            saleNumber: a.sale.number,
            amount: a.amount.toFixed(2),
            reversed: !!a.reversal,
          })),
      };
    });
  }
  const [summary] = await db().$queryRaw<
    { receivable: string; sales: string; advances: string }[]
  >`
    SELECT COALESCE(SUM(s.total-COALESCE(r.amount,0)-COALESCE(a.amount,0)),0)::text AS receivable,
    COALESCE(SUM(s.total-COALESCE(r.amount,0)),0)::text AS sales,
    (SELECT COALESCE(SUM(e.amount-COALESCE(ap.amount,0)-COALESCE(ref.amount,0)),0)::text
      FROM workshop."CustomerPayment" p JOIN workshop."CashEntry" e ON e.id=p."entryId"
      LEFT JOIN LATERAL (SELECT SUM(amount) amount FROM workshop."PaymentAllocation" WHERE "paymentId"=p.id) ap ON true
      LEFT JOIN LATERAL (SELECT SUM(re.amount) amount FROM workshop."CustomerPayment" rp JOIN workshop."CashEntry" re ON re.id=rp."entryId" WHERE rp."refundOfId"=p.id AND NOT EXISTS(SELECT 1 FROM workshop."CashEntry" rr WHERE rr."reversalOfId"=re.id)) ref ON true
      WHERE (${customerId ?? null}::uuid IS NULL OR p."customerId"=${customerId ?? null}::uuid) AND p."refundOfId" IS NULL AND e.direction='IN' AND NOT EXISTS(SELECT 1 FROM workshop."CashEntry" rev WHERE rev."reversalOfId"=e.id)) AS advances
    FROM workshop."Sale" s
    LEFT JOIN LATERAL (SELECT SUM(amount) amount FROM workshop."SaleReturn" WHERE "saleId"=s.id) r ON true
    LEFT JOIN LATERAL (SELECT SUM(amount) amount FROM workshop."PaymentAllocation" WHERE "saleId"=s.id) a ON true
    WHERE s.status='ISSUED' AND (${customerId ?? null}::uuid IS NULL OR s."customerId"=${customerId ?? null}::uuid)`;
  return { rows, total: count, page, pageSize, summary };
}
