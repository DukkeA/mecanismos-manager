import "server-only";
import { z } from "zod";
import Decimal from "decimal.js";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/domain/permissions";
import type {
  Compensation,
  OvertimePage,
  OvertimeRow,
  TeamOverview,
} from "@/domain/team";
import type { Actor } from "./commands";
import { db } from "./db";
import { day } from "./commercial-ledger";

const serializeRate = (r: {
  id: string;
  memberId: string;
  effectiveOn: Date;
  monthlySalary: { toString(): string } | null;
  monthlyEmployerCost: { toString(): string } | null;
  monthlyHours: { toString(): string } | null;
  hourlyCost: { toString(): string };
  note: string;
}): Compensation => ({
  id: r.id,
  memberId: r.memberId,
  effectiveOn: r.effectiveOn.toISOString().slice(0, 10),
  monthlySalary: r.monthlySalary?.toString() ?? null,
  monthlyEmployerCost: r.monthlyEmployerCost?.toString() ?? null,
  monthlyHours: r.monthlyHours?.toString() ?? null,
  hourlyCost: r.hourlyCost.toString(),
  note: r.note,
});
export async function teamOverview(
  actor: Actor,
  raw: unknown,
): Promise<TeamOverview> {
  requirePermission(actor.role, "payroll:read");
  const { period } = z
    .object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })
    .parse(raw);
  const from = day(`${period}-01`),
    until = new Date(from);
  until.setUTCMonth(until.getUTCMonth() + 1);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
  }).format(new Date());
  const lastDay = new Date(until.getTime() - 86400000)
    .toISOString()
    .slice(0, 10);
  const asOf = period === today.slice(0, 7) ? today : lastDay;
  // DISTINCT ON picks the effective conditions per person without exposing all history.
  const [rates, members, extra] = await Promise.all([
    db().$queryRaw<Array<Parameters<typeof serializeRate>[0]>>(
      Prisma.sql`SELECT DISTINCT ON ("memberId") * FROM workshop."LaborRate" WHERE "effectiveOn"<=${day(asOf)} ORDER BY "memberId","effectiveOn" DESC`,
    ),
    db().member.findMany({ where: { active: true }, select: { id: true } }),
    db().overtimeEntry.aggregate({
      where: { workedOn: { gte: from, lt: until }, voidedAt: null },
      _sum: { pay: true, employerCost: true, minutes: true },
    }),
  ]);
  const activeRates = rates.filter(
    (r) => members.some((m) => m.id === r.memberId) && r.monthlySalary !== null,
  );
  const sum = (field: "monthlySalary" | "monthlyEmployerCost") =>
    activeRates.reduce((s, r) => s.plus(r[field]!.toString()), new Decimal(0));
  const salary = sum("monthlySalary"),
    employer = sum("monthlyEmployerCost");
  const overtime = new Decimal(extra._sum.pay?.toString() ?? 0),
    extraEmployer = new Decimal(extra._sum.employerCost?.toString() ?? 0);
  return {
    period,
    asOf,
    salaries: salary.toFixed(2),
    employerCosts: employer.toFixed(2),
    overtimePay: overtime.toFixed(2),
    overtimeEmployerCost: extraEmployer.toFixed(2),
    overtimeMinutes: extra._sum.minutes ?? 0,
    monthlyCost: salary
      .plus(employer)
      .plus(overtime)
      .plus(extraEmployer)
      .toFixed(2),
    configured: activeRates.length,
    missing: members.length - activeRates.length,
    rates: rates.map(serializeRate),
  };
}
export async function compensationHistory(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "payroll:read");
  const { memberId } = z.object({ memberId: z.uuid() }).parse(raw);
  return (
    await db().laborRate.findMany({
      where: { memberId },
      orderBy: { effectiveOn: "desc" },
      take: 50,
    })
  ).map(serializeRate);
}
export async function overtimePage(
  actor: Actor,
  params: URLSearchParams,
): Promise<OvertimePage> {
  requirePermission(actor.role, "payroll:read");
  const input = z
    .object({
      q: z.string().max(120).default(""),
      memberId: z.uuid().optional(),
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
      status: z.enum(["active", "voided", "all"]).default("active"),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(10),
      orderBy: z
        .enum(["name", "workedOn", "minutes", "pay"])
        .default("workedOn"),
      direction: z.enum(["asc", "desc"]).default("desc"),
    })
    .parse(Object.fromEntries(params));
  const sql = Prisma.sql,
    filters: Prisma.Sql[] = [
      sql`(m.name ILIKE ${`%${input.q}%`} OR e.note ILIKE ${`%${input.q}%`} OR t.title ILIKE ${`%${input.q}%`})`,
    ];
  if (input.memberId) filters.push(sql`e."memberId"=${input.memberId}::uuid`);
  if (input.from) filters.push(sql`e."workedOn">=${day(input.from)}`);
  if (input.to) filters.push(sql`e."workedOn"<=${day(input.to)}`);
  if (input.status !== "all")
    filters.push(
      input.status === "active"
        ? sql`e."voidedAt" IS NULL`
        : sql`e."voidedAt" IS NOT NULL`,
    );
  const source = sql`FROM workshop."OvertimeEntry" e JOIN workshop."Member" m ON m.id=e."memberId" LEFT JOIN workshop."Task" t ON t.id=e."taskId" WHERE ${Prisma.join(filters, " AND ")}`;
  const column = {
    name: sql`m.name`,
    workedOn: sql`e."workedOn"`,
    minutes: sql`e.minutes`,
    pay: sql`e.pay`,
  }[input.orderBy];
  const [rows, counts] = await db().$transaction(
    [
      db().$queryRaw<OvertimeRow[]>(
        sql`SELECT e.id,e."memberId",m.name,t.title task,e."taskId",e."workedOn"::text,e.minutes,e.kind,e."surchargePercent"::text,e."baseHourlyPay"::text,e.pay::text,e."employerCost"::text,e.note,e."voidedAt"::text,e."voidReason" ${source} ORDER BY ${column} ${Prisma.raw(input.direction)},e.id LIMIT ${input.pageSize} OFFSET ${(input.page - 1) * input.pageSize}`,
      ),
      db().$queryRaw<{ count: bigint }[]>(sql`SELECT count(*) ${source}`),
    ],
    { isolationLevel: "RepeatableRead" },
  );
  return {
    rows,
    total: Number(counts[0].count),
    page: input.page,
    pageSize: input.pageSize,
  };
}
