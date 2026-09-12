import "server-only";
import { z } from "zod";
import Decimal from "decimal.js";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import type { Actor, Tx } from "./commands";
import { requirePermission } from "@/domain/permissions";
import { DomainError } from "@/domain/errors";
import {
  periodInput,
  type LeaveRow,
  type AdvanceRow,
  type BenefitPage,
  type VacationAccount,
  type PayrollPreview,
} from "@/domain/employee-benefits";
import { day } from "./commercial-ledger";
import { bogotaDay } from "./attendance-service";

const filterInput = z.object({
  q: z.string().max(120).default(""),
  memberId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  status: z.enum(["active", "voided", "all"]).default("active"),
  treatment: z.enum(["HOURS", "VACATION", "PAID"]).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  orderBy: z.enum(["date", "name", "amount"]).default("date"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
const fixed = (v: { toString(): string } | null | undefined) =>
  new Decimal(v?.toString() ?? 0).toFixed(2);
export async function benefitsPage(
  actor: Actor,
  params: URLSearchParams,
  resource: "leaves" | "advances",
): Promise<BenefitPage<LeaveRow> | BenefitPage<AdvanceRow>> {
  requirePermission(actor.role, "payroll:read");
  const p = filterInput.parse(Object.fromEntries(params));
  if (p.from && p.to && p.from > p.to)
    throw new DomainError(
      "La fecha final debe ser igual o posterior a la inicial.",
    );
  const sql = Prisma.sql,
    table =
      resource === "leaves"
        ? sql`workshop."EmployeeLeave"`
        : sql`workshop."SalaryAdvance"`;
  const date = resource === "leaves" ? sql`e."startsAt"` : sql`e."disbursedOn"`;
  const totalAmount =
    resource === "leaves"
      ? sql`(SELECT sum(d."salaryDeduction") FROM workshop."EmployeeLeaveDay" d WHERE d."leaveId"=e.id)`
      : sql`e.amount`;
  const filters = [
    sql`(${p.memberId ?? null}::uuid IS NULL OR e."memberId"=${p.memberId ?? null}::uuid)`,
    sql`(m.name ILIKE ${`%${p.q}%`} OR e.note ILIKE ${`%${p.q}%`})`,
  ];
  if (p.status !== "all")
    filters.push(
      p.status === "active"
        ? sql`e."voidedAt" IS NULL`
        : sql`e."voidedAt" IS NOT NULL`,
    );
  if (p.from)
    filters.push(
      resource === "leaves"
        ? sql`e."endsAt">=${new Date(`${p.from}T00:00:00-05:00`)}`
        : sql`${date}>=${day(p.from)}`,
    );
  if (p.to)
    filters.push(
      sql`${date}<${new Date(new Date(`${p.to}T00:00:00${resource === "leaves" ? "-05:00" : "Z"}`).getTime() + 86400000)}`,
    );
  if (p.treatment && resource === "leaves")
    filters.push(sql`e.treatment=${p.treatment}`);
  const source = sql`FROM ${table} e JOIN workshop."Member" m ON m.id=e."memberId" WHERE ${Prisma.join(filters, " AND ")}`;
  return db().$transaction(
    async (tx) => {
      const ids = await tx.$queryRaw<{ id: string; name: string }[]>(
        sql`SELECT e.id,m.name ${source} ORDER BY ${p.orderBy === "name" ? sql`m.name` : p.orderBy === "amount" ? totalAmount : date} ${Prisma.raw(p.direction)},e.id LIMIT 10 OFFSET ${(p.page - 1) * 10}`,
      );
      const count = await tx.$queryRaw<{ count: bigint }[]>(
        sql`SELECT count(*) ${source}`,
      );
      const metadata = {
        total: Number(count[0].count),
        page: p.page,
        pageSize: 10,
      };
      if (resource === "leaves") {
        const rows = await tx.employeeLeave.findMany({
          where: { id: { in: ids.map((i) => i.id) } },
          include: { days: true },
        });
        return {
          ...metadata,
          rows: ids.map((i) => {
            const r = rows.find((r) => r.id === i.id)!;
            return {
              id: r.id,
              memberId: r.memberId,
              name: i.name,
              treatment: r.treatment as LeaveRow["treatment"],
              startsAt: r.startsAt.toISOString(),
              endsAt: r.endsAt.toISOString(),
              note: r.note,
              voidedAt: r.voidedAt?.toISOString() ?? null,
              voidReason: r.voidReason,
              minutes: r.days.reduce((s, d) => s + d.minutes, 0),
              vacationDays: r.days
                .reduce(
                  (s, d) => s.plus(d.vacationDays.toString()),
                  new Decimal(0),
                )
                .toFixed(4),
              salaryDeduction: r.days
                .reduce(
                  (s, d) => s.plus(d.salaryDeduction.toString()),
                  new Decimal(0),
                )
                .toFixed(2),
            };
          }),
        };
      }
      const rows = await tx.salaryAdvance.findMany({
        where: { id: { in: ids.map((i) => i.id) } },
        include: {
          installments: { orderBy: [{ period: "asc" }, { createdAt: "asc" }] },
        },
      });
      const entries = await tx.cashEntry.findMany({
        where: { id: { in: rows.map((r) => r.entryId) } },
        include: { account: true },
      });
      return {
        ...metadata,
        rows: ids.map((i) => {
          const r = rows.find((r) => r.id === i.id)!;
          const applied = r.installments
            .filter((q) => q.appliedOn)
            .reduce((s, q) => s.plus(q.amount.toString()), new Decimal(0));
          return {
            id: r.id,
            memberId: r.memberId,
            name: i.name,
            amount: fixed(r.amount),
            balance: r.voidedAt
              ? "0.00"
              : new Decimal(r.amount.toString()).minus(applied).toFixed(2),
            disbursedOn: r.disbursedOn.toISOString().slice(0, 10),
            note: r.note,
            version: r.version,
            voidedAt: r.voidedAt?.toISOString() ?? null,
            voidReason: r.voidReason,
            account: entries.find((e) => e.id === r.entryId)!.account.name,
            installments: r.installments.map((q) => ({
              id: q.id,
              period: q.period,
              amount: fixed(q.amount),
              appliedOn: q.appliedOn?.toISOString().slice(0, 10) ?? null,
              cancelledAt: q.cancelledAt?.toISOString() ?? null,
            })),
          };
        }),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function vacationAccounts(
  actor: Actor,
): Promise<VacationAccount[]> {
  requirePermission(actor.role, "payroll:read");
  return db().$transaction(
    async (tx) => {
      const members = await tx.member.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, active: true },
      });
      const adjustments = await tx.vacationAdjustment.findMany({
        orderBy: { createdAt: "desc" },
      });
      const days = await tx.employeeLeaveDay.findMany({
        where: { leave: { voidedAt: null, treatment: "VACATION" } },
        include: { leave: true },
      });
      return members
        .filter(
          (m) =>
            m.active ||
            adjustments.some((a) => a.memberId === m.id) ||
            days.some((d) => d.leave.memberId === m.id),
        )
        .map((m) => {
          const history = adjustments.filter((a) => a.memberId === m.id),
            added = history.reduce(
              (s, a) => s.plus(a.days.toString()),
              new Decimal(0),
            ),
            used = days
              .filter((d) => d.leave.memberId === m.id)
              .reduce(
                (s, d) => s.plus(d.vacationDays.toString()),
                new Decimal(0),
              );
          return {
            memberId: m.id,
            name: m.name,
            adjustments: added.toFixed(4),
            used: used.toFixed(4),
            balance: added.minus(used).toFixed(4),
            history: history.map((a) => ({
              id: a.id,
              days: a.days.toString(),
              note: a.note,
              createdAt: a.createdAt.toISOString(),
            })),
          };
        });
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function advanceHistory(actor: Actor, id: string) {
  requirePermission(actor.role, "payroll:read");
  z.uuid().parse(id);
  const events = await db().auditEvent.findMany({
    where: { entityId: id, action: { startsWith: "SALARY_ADVANCE" } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const actors = await db().member.findMany({
    where: { id: { in: events.map((e) => e.actorId) } },
    select: { id: true, name: true },
  });
  return events.map((e) => ({
    id: e.id,
    action: e.action,
    createdAt: e.createdAt.toISOString(),
    actor: actors.find((a) => a.id === e.actorId)?.name ?? "Administración",
    details: e.details,
  }));
}
export async function payrollPreview(
  actor: Actor,
  period: string,
  raw: unknown = {},
): Promise<PayrollPreview> {
  requirePermission(actor.role, "payroll:read");
  periodInput.parse(period);
  const { orderBy, direction } = z
    .object({
      orderBy: z
        .enum([
          "name",
          "salary",
          "bonuses",
          "leaveDeduction",
          "installments",
          "payable",
        ])
        .default("name"),
      direction: z.enum(["asc", "desc"]).default("asc"),
    })
    .parse(raw);
  const result = await db().$transaction((tx) => monthlyPayroll(tx, period), {
    isolationLevel: "RepeatableRead",
  });
  result.rows.sort((a, b) => {
    if (a[orderBy] === null) return b[orderBy] === null ? 0 : 1;
    if (b[orderBy] === null) return -1;
    const compared =
      orderBy === "name"
        ? a.name.localeCompare(b.name, "es")
        : new Decimal(a[orderBy]!).comparedTo(b[orderBy]!);
    return (
      (direction === "asc" ? compared : -compared) ||
      a.name.localeCompare(b.name, "es")
    );
  });
  return result;
}
async function monthlyPayroll(tx: Tx, period: string): Promise<PayrollPreview> {
  const from = day(`${period}-01`),
    until = new Date(from);
  until.setUTCMonth(until.getUTCMonth() + 1);
  const today = bogotaDay(new Date()),
    asOf =
      period === today.slice(0, 7)
        ? day(today)
        : new Date(until.getTime() - 86400000);
  const [members, rates, extra, leaves, installments] = await Promise.all([
    tx.member.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, active: true },
    }),
    tx.laborRate.findMany({
      where: { effectiveOn: { lte: asOf } },
      orderBy: { effectiveOn: "desc" },
    }),
    tx.overtimeEntry.findMany({
      where: { workedOn: { gte: from, lt: until }, voidedAt: null },
    }),
    tx.employeeLeaveDay.findMany({
      where: { workedOn: { gte: from, lt: until }, leave: { voidedAt: null } },
      include: { leave: true },
    }),
    tx.advanceInstallment.findMany({
      where: { period, cancelledAt: null, advance: { voidedAt: null } },
      include: { advance: true },
    }),
  ]);
  return {
    period,
    rows: members
      .filter(
        (m) =>
          m.active ||
          extra.some((e) => e.memberId === m.id) ||
          leaves.some((l) => l.leave.memberId === m.id) ||
          installments.some((i) => i.advance.memberId === m.id),
      )
      .map((m) => {
        const rate = rates.find((r) => r.memberId === m.id),
          salary = rate?.monthlySalary?.toString() ?? null;
        const bonuses = extra
          .filter((e) => e.memberId === m.id)
          .reduce((s, e) => s.plus(e.pay.toString()), new Decimal(0));
        const leave = leaves.filter(
            (l) => l.leave.memberId === m.id && l.leave.treatment === "HOURS",
          ),
          leaveDeduction = leave.reduce(
            (s, l) => s.plus(l.salaryDeduction.toString()),
            new Decimal(0),
          );
        const quotas = installments.filter((i) => i.advance.memberId === m.id),
          deduction = quotas.reduce(
            (s, i) => s.plus(i.amount.toString()),
            new Decimal(0),
          );
        return {
          memberId: m.id,
          name: m.name,
          salary,
          bonuses: bonuses.toFixed(2),
          leaveMinutes: leave.reduce((s, l) => s + l.minutes, 0),
          leaveDeduction: leaveDeduction.toFixed(2),
          installments: deduction.toFixed(2),
          applied: quotas
            .filter((i) => i.appliedOn)
            .reduce((s, i) => s.plus(i.amount.toString()), new Decimal(0))
            .toFixed(2),
          payable:
            salary === null
              ? null
              : new Decimal(salary)
                  .plus(bonuses)
                  .minus(leaveDeduction)
                  .minus(deduction)
                  .toFixed(2),
        };
      }),
  };
}
