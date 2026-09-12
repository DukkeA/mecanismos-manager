import "server-only";
import { z } from "zod";
import Decimal from "decimal.js";
import { once, type Actor, type Tx } from "./commands";
import { requirePermission } from "@/domain/permissions";
import { DomainError } from "@/domain/errors";
import {
  leaveInput,
  leaveSlices,
  installmentInput,
  validateInstallments,
} from "@/domain/employee-benefits";
import { positiveMoney } from "@/domain/commercial";
import { day } from "./commercial-ledger";
import { assertOpenCash } from "./financial-control";
import { bogotaDay } from "./attendance-service";

const note = z.string().trim().min(5).max(1000);
const audit = (
  tx: Tx,
  actor: Actor,
  id: string,
  action: string,
  details: unknown,
) =>
  tx.auditEvent.create({
    data: {
      actorId: actor.id,
      entityId: id,
      action,
      details: JSON.parse(JSON.stringify(details)),
    },
  });
const guard = (actor: Actor) => requirePermission(actor.role, "payroll:read");
async function activeMember(tx: Tx, id: string) {
  const member = await tx.member.findUniqueOrThrow({ where: { id } });
  if (!member.active)
    throw new DomainError(
      "Activa al empleado antes de registrar esta operación.",
    );
  return member;
}
export async function vacationBalance(tx: Tx, memberId: string) {
  const [adjustments, used] = await Promise.all([
    tx.vacationAdjustment.aggregate({
      where: { memberId },
      _sum: { days: true },
    }),
    tx.employeeLeaveDay.aggregate({
      where: { leave: { memberId, voidedAt: null, treatment: "VACATION" } },
      _sum: { vacationDays: true },
    }),
  ]);
  return new Decimal(adjustments._sum.days?.toString() ?? 0).minus(
    used._sum.vacationDays?.toString() ?? 0,
  );
}
export async function recordLeave(actor: Actor, raw: unknown) {
  guard(actor);
  const p = leaveInput.parse(raw);
  return once(actor, p.requestId, "EMPLOYEE_LEAVE", p, async (tx) => {
    await activeMember(tx, p.memberId);
    const settings = await tx.workshopSettings.findUniqueOrThrow({
      where: { id: "global" },
    });
    let slices: ReturnType<typeof leaveSlices>;
    try {
      slices = leaveSlices(p, settings);
    } catch (e) {
      throw new DomainError((e as Error).message);
    }
    if (
      await tx.employeeLeaveDay.findFirst({
        where: {
          leave: { memberId: p.memberId, voidedAt: null },
          OR: slices.days.map((d) => ({
            startsAt: { lt: d.endsAt },
            endsAt: { gt: d.startsAt },
          })),
        },
      })
    )
      throw new DomainError(
        "Ya hay un permiso vigente en parte de ese horario.",
      );
    const days = [];
    for (const d of slices.days) {
      const rate =
        p.treatment === "HOURS"
          ? await tx.laborRate.findFirst({
              where: { memberId: p.memberId, effectiveOn: { lte: d.workedOn } },
              orderBy: { effectiveOn: "desc" },
            })
          : null;
      if (
        p.treatment === "HOURS" &&
        (!rate?.monthlySalary ||
          !rate.monthlyHours ||
          Number(rate.monthlySalary) <= 0)
      )
        throw new DomainError(
          "Registra el salario y las horas mensuales vigentes para calcular el descuento.",
        );
      days.push({
        ...d,
        vacationDays: p.treatment === "VACATION" ? d.vacationDays : "0",
        rateId: rate?.id,
        salaryDeduction: rate
          ? new Decimal(rate.monthlySalary!.toString())
              .div(rate.monthlyHours!.toString())
              .mul(d.minutes)
              .div(60)
              .toFixed(2)
          : "0",
      });
    }
    const vacation = days.reduce(
      (s, d) => s.plus(d.vacationDays),
      new Decimal(0),
    );
    if (
      p.treatment === "VACATION" &&
      (await vacationBalance(tx, p.memberId)).lt(vacation)
    )
      throw new DomainError(
        "No hay suficientes días de vacaciones. Revisa el saldo inicial y los ajustes.",
      );
    const leave = await tx.employeeLeave.create({
      data: {
        memberId: p.memberId,
        treatment: p.treatment,
        startsAt: slices.startsAt,
        endsAt: slices.endsAt,
        note: p.note,
        actorId: actor.id,
        days: { create: days },
      },
    });
    await audit(tx, actor, leave.id, "EMPLOYEE_LEAVE", { ...p, days });
    return { id: leave.id };
  });
}
export async function voidLeave(actor: Actor, raw: unknown) {
  guard(actor);
  const p = z
    .object({ requestId: z.uuid(), id: z.uuid(), reason: note })
    .parse(raw);
  return once(actor, p.requestId, "EMPLOYEE_LEAVE_VOID", p, async (tx) => {
    const row = await tx.employeeLeave.findUniqueOrThrow({
      where: { id: p.id },
    });
    if (row.voidedAt) throw new DomainError("El permiso ya está anulado.");
    await tx.employeeLeave.update({
      where: { id: p.id },
      data: { voidedAt: new Date(), voidReason: p.reason },
    });
    await audit(tx, actor, p.id, "EMPLOYEE_LEAVE_VOID", p);
    return { id: p.id };
  });
}
export async function adjustVacation(actor: Actor, raw: unknown) {
  guard(actor);
  const p = z
    .object({
      requestId: z.uuid(),
      memberId: z.uuid(),
      days: z
        .string()
        .regex(/^-?\d{1,4}(\.\d{1,4})?$/)
        .refine((v) => !new Decimal(v).isZero()),
      note,
    })
    .parse(raw);
  return once(actor, p.requestId, "VACATION_ADJUSTMENT", p, async (tx) => {
    await activeMember(tx, p.memberId);
    if ((await vacationBalance(tx, p.memberId)).plus(p.days).lt(0))
      throw new DomainError(
        "El ajuste dejaría un saldo de vacaciones negativo.",
      );
    const row = await tx.vacationAdjustment.create({
      data: {
        memberId: p.memberId,
        days: p.days,
        note: p.note,
        actorId: actor.id,
      },
    });
    await audit(tx, actor, row.id, "VACATION_ADJUSTMENT", p);
    return { id: row.id };
  });
}
function planCheck(
  plan: z.infer<typeof installmentInput>,
  amount: string,
  earliest: string,
) {
  try {
    validateInstallments(plan, amount, earliest);
  } catch (e) {
    throw new DomainError((e as Error).message);
  }
}
export async function recordSalaryAdvance(actor: Actor, raw: unknown) {
  guard(actor);
  const p = z
    .object({
      requestId: z.uuid(),
      memberId: z.uuid(),
      accountId: z.uuid(),
      amount: positiveMoney,
      disbursedOn: z.iso.date(),
      note,
      installments: installmentInput,
    })
    .parse(raw);
  if (p.disbursedOn > bogotaDay(new Date()))
    throw new DomainError("La fecha del desembolso no puede ser futura.");
  planCheck(p.installments, p.amount, p.disbursedOn.slice(0, 7));
  return once(actor, p.requestId, "SALARY_ADVANCE", p, async (tx) => {
    const member = await activeMember(tx, p.memberId);
    await assertOpenCash(tx, p.accountId, p.disbursedOn);
    const account = await tx.moneyAccount.findUniqueOrThrow({
      where: { id: p.accountId },
    });
    if (new Decimal(account.balance.toString()).lt(p.amount))
      throw new DomainError(
        "La cuenta no tiene saldo suficiente para el anticipo.",
      );
    const entry = await tx.cashEntry.create({
      data: {
        accountId: p.accountId,
        amount: p.amount,
        direction: "OUT",
        kind: "SALARY_ADVANCE",
        counterparty: member.name,
        reference: "Anticipo de salario",
        note: p.note,
        occurredOn: day(p.disbursedOn),
        actorId: actor.id,
      },
    });
    await tx.moneyAccount.update({
      where: { id: p.accountId },
      data: { balance: { decrement: p.amount } },
    });
    const advance = await tx.salaryAdvance.create({
      data: {
        memberId: p.memberId,
        entryId: entry.id,
        amount: p.amount,
        disbursedOn: day(p.disbursedOn),
        note: p.note,
        actorId: actor.id,
        installments: { create: p.installments },
      },
    });
    await audit(tx, actor, advance.id, "SALARY_ADVANCE", {
      ...p,
      entryId: entry.id,
    });
    return { id: advance.id };
  });
}
const versioned = z.object({
  requestId: z.uuid(),
  id: z.uuid(),
  version: z.number().int().positive(),
  reason: note,
});
async function currentAdvance(tx: Tx, id: string, version: number) {
  const advance = await tx.salaryAdvance.findUniqueOrThrow({
    where: { id },
    include: { installments: true },
  });
  if (advance.voidedAt) throw new DomainError("El anticipo está anulado.");
  if (advance.version !== version)
    throw new DomainError(
      "El anticipo cambió. Actualiza la página antes de continuar.",
    );
  return advance;
}
export async function rescheduleAdvance(actor: Actor, raw: unknown) {
  guard(actor);
  const p = versioned.extend({ installments: installmentInput }).parse(raw);
  return once(actor, p.requestId, "SALARY_ADVANCE_PLAN", p, async (tx) => {
    const advance = await currentAdvance(tx, p.id, p.version);
    const applied = advance.installments
      .filter((i) => i.appliedOn)
      .reduce((s, i) => s.plus(i.amount.toString()), new Decimal(0));
    const balance = new Decimal(advance.amount.toString()).minus(applied);
    if (balance.lte(0))
      throw new DomainError("Este anticipo ya está descontado por completo.");
    planCheck(
      p.installments,
      balance.toFixed(2),
      advance.disbursedOn.toISOString().slice(0, 7),
    );
    if (
      p.installments.some((p) =>
        advance.installments.some((i) => i.appliedOn && i.period === p.period),
      )
    )
      throw new DomainError(
        "Ese mes ya tiene una cuota aplicada. Revierte el descuento para modificarlo.",
      );
    await tx.advanceInstallment.updateMany({
      where: { advanceId: p.id, appliedOn: null, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });
    await tx.advanceInstallment.createMany({
      data: p.installments.map((i) => ({ ...i, advanceId: p.id })),
    });
    await tx.salaryAdvance.update({
      where: { id: p.id },
      data: { version: { increment: 1 } },
    });
    await audit(tx, actor, p.id, "SALARY_ADVANCE_PLAN", {
      before: advance.installments,
      ...p,
    });
    return { id: p.id };
  });
}
export async function applyAdvanceInstallment(actor: Actor, raw: unknown) {
  guard(actor);
  const p = versioned
    .extend({
      installmentId: z.uuid(),
      reverse: z.boolean().default(false),
      appliedOn: z.iso.date(),
    })
    .parse(raw);
  return once(actor, p.requestId, "SALARY_ADVANCE_DEDUCTION", p, async (tx) => {
    const advance = await currentAdvance(tx, p.id, p.version),
      installment = advance.installments.find((i) => i.id === p.installmentId);
    if (!installment || installment.cancelledAt)
      throw new DomainError("La cuota ya no pertenece al plan vigente.");
    if (p.reverse ? !installment.appliedOn : !!installment.appliedOn)
      throw new DomainError(
        "El estado del descuento cambió. Actualiza la página.",
      );
    if (
      !p.reverse &&
      (p.appliedOn < `${installment.period}-01` ||
        p.appliedOn > bogotaDay(new Date()))
    )
      throw new DomainError(
        "Registra el descuento a partir del mes de la cuota y hasta hoy.",
      );
    await tx.advanceInstallment.update({
      where: { id: installment.id },
      data: {
        appliedOn: p.reverse ? null : day(p.appliedOn),
        appliedBy: p.reverse ? null : actor.id,
      },
    });
    await tx.salaryAdvance.update({
      where: { id: p.id },
      data: { version: { increment: 1 } },
    });
    await audit(tx, actor, p.id, "SALARY_ADVANCE_DEDUCTION", {
      before: installment,
      ...p,
    });
    return { id: p.id };
  });
}
export async function voidSalaryAdvance(actor: Actor, raw: unknown) {
  guard(actor);
  const p = versioned.extend({ occurredOn: z.iso.date() }).parse(raw);
  return once(actor, p.requestId, "SALARY_ADVANCE_VOID", p, async (tx) => {
    const advance = await currentAdvance(tx, p.id, p.version);
    if (advance.installments.some((i) => i.appliedOn))
      throw new DomainError(
        "Revierte los descuentos aplicados antes de anular el anticipo.",
      );
    if (
      p.occurredOn < advance.disbursedOn.toISOString().slice(0, 10) ||
      p.occurredOn > bogotaDay(new Date())
    )
      throw new DomainError(
        "La devolución debe ser entre la fecha del desembolso y hoy.",
      );
    const original = await tx.cashEntry.findUniqueOrThrow({
      where: { id: advance.entryId },
      include: { reversal: true },
    });
    if (original.reversal)
      throw new DomainError("El desembolso ya fue revertido.");
    await assertOpenCash(tx, original.accountId, p.occurredOn);
    await tx.cashEntry.create({
      data: {
        accountId: original.accountId,
        amount: advance.amount,
        direction: "IN",
        kind: "REVERSAL",
        counterparty: original.counterparty,
        reference: original.reference,
        note: p.reason,
        occurredOn: day(p.occurredOn),
        actorId: actor.id,
        reversalOfId: original.id,
      },
    });
    await tx.moneyAccount.update({
      where: { id: original.accountId },
      data: { balance: { increment: advance.amount } },
    });
    await tx.advanceInstallment.updateMany({
      where: { advanceId: p.id, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });
    await tx.salaryAdvance.update({
      where: { id: p.id },
      data: {
        voidedAt: new Date(),
        voidReason: p.reason,
        version: { increment: 1 },
      },
    });
    await audit(tx, actor, p.id, "SALARY_ADVANCE_VOID", p);
    return { id: p.id };
  });
}
