import "server-only";
import { z } from "zod";
import Decimal from "decimal.js";
import { once, type Actor, type Tx } from "./commands";
import { requirePermission } from "@/domain/permissions";
import { DomainError } from "@/domain/errors";
import { money, positiveMoney } from "@/domain/commercial";
import { day } from "./commercial-ledger";
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  note = z.string().trim().min(5).max(3000);
export async function assertOpenCash(
  tx: Tx,
  accountId: string,
  occurredOn: string,
) {
  if (
    await tx.cashClosure.findFirst({
      where: {
        accountId,
        throughOn: { gte: day(occurredOn) },
        reopenedAt: null,
      },
    })
  )
    throw new DomainError(
      "La fecha pertenece a un cierre de caja. Administración debe reabrirlo antes de registrar cambios.",
    );
}
export async function closeCash(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "finance:write");
  const input = z
    .object({
      requestId: z.uuid(),
      accountId: z.uuid(),
      throughOn: z.iso.date(),
      counted: money,
      note,
    })
    .parse(raw);
  return once(actor, input.requestId, "CASH_CLOSED", input, async (tx) => {
    const account = await tx.moneyAccount.findUniqueOrThrow({
      where: { id: input.accountId },
    });
    const through = day(input.throughOn);
    if (
      input.throughOn >
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(
        new Date(),
      )
    )
      throw new DomainError("No puedes cerrar una fecha futura.");
    if (
      await tx.cashClosure.findFirst({
        where: {
          accountId: input.accountId,
          throughOn: { gte: through },
          reopenedAt: null,
        },
      })
    )
      throw new DomainError("Ya existe un cierre que cubre esta fecha.");
    const entries = await tx.cashEntry.findMany({
      where: { accountId: input.accountId, occurredOn: { lte: through } },
    });
    const expected = entries.reduce(
      (s, e) =>
        s.plus(
          e.direction === "IN"
            ? e.amount.toString()
            : new Decimal(e.amount.toString()).negated(),
        ),
      new Decimal(account.openingBalance.toString()),
    );
    const result = await tx.cashClosure.create({
      data: {
        accountId: input.accountId,
        throughOn: through,
        expected: expected.toFixed(2),
        counted: input.counted,
        difference: new Decimal(input.counted).minus(expected).toFixed(2),
        note: input.note,
        actorId: actor.id,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: result.id,
        action: "CASH_CLOSED",
        details: input,
      },
    });
    return { id: result.id };
  });
}
export async function reopenCash(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const input = z
    .object({ requestId: z.uuid(), closureId: z.uuid(), reason: note })
    .parse(raw);
  return once(actor, input.requestId, "CASH_REOPENED", input, async (tx) => {
    const closure = await tx.cashClosure.findUniqueOrThrow({
      where: { id: input.closureId },
    });
    if (closure.reopenedAt)
      throw new DomainError("El cierre ya está reabierto.");
    if (
      await tx.cashClosure.findFirst({
        where: {
          accountId: closure.accountId,
          throughOn: { gt: closure.throughOn },
          reopenedAt: null,
        },
      })
    )
      throw new DomainError(
        "Reabre primero los cierres posteriores de esa cuenta.",
      );
    await tx.cashClosure.update({
      where: { id: closure.id },
      data: { reopenedAt: new Date(), reopenReason: input.reason },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: closure.id,
        action: "CASH_REOPENED",
        details: input,
      },
    });
    return { id: closure.id };
  });
}
export async function saveRecurring(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "finance:write");
  const input = z
    .object({
      requestId: z.uuid(),
      id: z.uuid().optional(),
      title: z.string().trim().min(3).max(200),
      category: z.enum(["RENT", "UTILITIES", "PAYROLL", "OTHER"]),
      amount: positiveMoney,
      dueDay: z.coerce.number().int().min(1).max(31),
      active: z.boolean().default(true),
    })
    .parse(raw);
  if (input.category === "PAYROLL")
    requirePermission(actor.role, "payroll:read");
  return once(actor, input.requestId, "RECURRING_SAVED", input, async (tx) => {
    if (input.id) {
      const before = await tx.recurringExpense.findUniqueOrThrow({
        where: { id: input.id },
      });
      if (before.category === "PAYROLL")
        requirePermission(actor.role, "payroll:read");
    }
    if (!input.active) requirePermission(actor.role, "members:write");
    const data = {
      title: input.title,
      category: input.category,
      amount: input.amount,
      dueDay: input.dueDay,
      active: input.active,
      actorId: actor.id,
    };
    const result = input.id
      ? await tx.recurringExpense.update({ where: { id: input.id }, data })
      : await tx.recurringExpense.create({ data });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: result.id,
        action: "RECURRING_SAVED",
        details: input,
      },
    });
    return { id: result.id };
  });
}
export async function generateMonth(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "finance:write");
  const input = z
    .object({
      requestId: z.uuid(),
      period,
      recurringIds: z.array(z.uuid()).max(100).optional(),
    })
    .parse(raw);
  return once(actor, input.requestId, "MONTH_GENERATED", input, async (tx) => {
    const templates = await tx.recurringExpense.findMany({
      where: {
        active: true,
        ...(input.recurringIds ? { id: { in: input.recurringIds } } : {}),
      },
    });
    const [year, month] = input.period.split("-").map(Number),
      last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (const t of templates)
      await tx.obligation.upsert({
        where: {
          recurringId_period: { recurringId: t.id, period: input.period },
        },
        create: {
          recurringId: t.id,
          title: t.title,
          category: t.category,
          amount: t.amount,
          period: input.period,
          dueOn: day(
            `${input.period}-${String(Math.min(t.dueDay, last)).padStart(2, "0")}`,
          ),
          estimated: true,
        },
        update: {},
      });
    await tx.monthCoverage.upsert({
      where: { period: input.period },
      create: {
        period: input.period,
        confirmed: false,
        note: "Gastos recurrentes generados; pendientes de revisión.",
        actorId: actor.id,
      },
      update: { confirmed: false },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: input.requestId,
        action: "MONTH_GENERATED",
        details: { period: input.period, templates: templates.length },
      },
    });
    return { id: input.requestId };
  });
}
export async function confirmMonth(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const input = z.object({ requestId: z.uuid(), period, note }).parse(raw);
  return once(actor, input.requestId, "MONTH_CONFIRMED", input, async (tx) => {
    if (!(await tx.obligation.count({ where: { period: input.period } })))
      throw new DomainError(
        "Registra los gastos del mes antes de confirmarlo.",
      );
    await tx.obligation.updateMany({
      where: { period: input.period },
      data: { estimated: false },
    });
    await tx.monthCoverage.upsert({
      where: { period: input.period },
      create: {
        period: input.period,
        note: input.note,
        confirmed: true,
        actorId: actor.id,
      },
      update: {
        note: input.note,
        confirmed: true,
        actorId: actor.id,
        confirmedAt: new Date(),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: input.requestId,
        action: "MONTH_CONFIRMED",
        details: input,
      },
    });
    return { id: input.requestId };
  });
}
export async function correctObligation(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "finance:write");
  const input = z
    .object({
      requestId: z.uuid(),
      obligationId: z.uuid(),
      amount: positiveMoney,
      dueOn: z.iso.date(),
      note,
    })
    .parse(raw);
  return once(
    actor,
    input.requestId,
    "OBLIGATION_CONFIRMED",
    input,
    async (tx) => {
      const o = await tx.obligation.findUniqueOrThrow({
        where: { id: input.obligationId },
        include: { entries: true },
      });
      if (o.salaryPeriod)
        throw new DomainError(
          "El importe de los salarios se calcula desde Equipo → Pago del mes.",
        );
      if (o.category === "PAYROLL")
        requirePermission(actor.role, "payroll:read");
      const paid = o.entries.reduce(
        (s, e) =>
          s.plus(
            e.direction === "OUT"
              ? e.amount.toString()
              : new Decimal(e.amount.toString()).negated(),
          ),
        new Decimal(0),
      );
      if (paid.gt(input.amount))
        throw new DomainError(
          "El importe no puede ser menor que lo ya pagado.",
        );
      await tx.obligation.update({
        where: { id: o.id },
        data: {
          amount: input.amount,
          dueOn: day(input.dueOn),
          estimated: false,
        },
      });
      await tx.monthCoverage.updateMany({
        where: { period: o.period },
        data: { confirmed: false },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: o.id,
          action: "OBLIGATION_CONFIRMED",
          details: input,
        },
      });
      return { id: o.id };
    },
  );
}
