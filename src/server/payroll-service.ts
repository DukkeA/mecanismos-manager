import "server-only";
import { z } from "zod";
import Decimal from "decimal.js";
import { once, type Actor, type Tx } from "./commands";
import { requirePermission } from "@/domain/permissions";
import { DomainError } from "@/domain/errors";
import { monthlyPayroll } from "./employee-benefits-query";
import { assertOpenCash } from "./financial-control";
import { day } from "./commercial-ledger";
import { bogotaDay } from "./attendance-service";

const periodInput = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const amountInput = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/)
  .refine((v) => new Decimal(v).gt(0));

export async function syncSalaryObligations(tx: Tx) {
  const obligations = await tx.obligation.findMany({
    where: { salaryPeriod: { not: null } },
  });
  for (const o of obligations) {
    const payroll = await monthlyPayroll(tx, o.salaryPeriod!);
    for (const row of payroll.rows) {
      if (
        new Decimal(row.paid).gt(0) &&
        (row.payable === null || new Decimal(row.payable).lt(row.paid))
      )
        throw new DomainError(
          `El cálculo de ${row.name} en ${payroll.period} quedaría por debajo de lo ya pagado. Revisa el descuento o solicita una reversión a administración.`,
        );
    }
    const total = payroll.rows.reduce(
      (s, r) => s.plus(Decimal.max(0, r.payable ?? 0)),
      new Decimal(0),
    );
    if (
      !total.eq(o.amount.toString()) ||
      o.title !== `Salarios · ${o.salaryPeriod}` ||
      o.estimated !== payroll.rows.some((r) => r.payable === null)
    )
      await tx.obligation.update({
        where: { id: o.id },
        data: {
          title: `Salarios · ${o.salaryPeriod}`,
          amount: total.toFixed(2),
          estimated: payroll.rows.some((r) => r.payable === null),
        },
      });
  }
}

export async function assertPayrollMutable(
  tx: Tx,
  memberId: string,
  from: string,
  to = from,
) {
  const periods = await tx.$queryRaw<{ period: string }[]>`
    SELECT DISTINCT p.period FROM workshop."PayrollPayment" p
    WHERE p."memberId"=${memberId}::uuid AND p.period>=${from.slice(0, 7)} AND p.period<=${to.slice(0, 7)}
    AND NOT EXISTS(SELECT 1 FROM workshop."CashEntry" r WHERE r."reversalOfId"=p."entryId")`;
  for (const { period } of periods) {
    const row = (await monthlyPayroll(tx, period)).rows.find(
      (r) => r.memberId === memberId,
    );
    if (row && new Decimal(row.remaining ?? 0).lte(0))
      throw new DomainError(
        "Este mes ya tiene pagos completos del empleado. Administración debe revertirlos antes de cambiar su cálculo.",
      );
  }
}

export async function adoptSalaryObligation(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const p = z
    .object({
      requestId: z.uuid(),
      obligationId: z.uuid(),
      period: periodInput,
    })
    .parse(raw);
  return once(
    actor,
    p.requestId,
    "PAYROLL_OBLIGATION_LINKED",
    p,
    async (tx) => {
      const existing = await tx.obligation.findUnique({
        where: { salaryPeriod: p.period },
      });
      if (existing)
        throw new DomainError(
          "Este mes ya tiene un gasto de salarios vinculado.",
        );
      const o = await tx.obligation.findUniqueOrThrow({
        where: { id: p.obligationId },
      });
      if (o.period !== p.period || o.category !== "PAYROLL")
        throw new DomainError("Selecciona un gasto de nómina del mismo mes.");
      await tx.obligation.update({
        where: { id: o.id },
        data: { salaryPeriod: p.period, estimated: false },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: o.id,
          action: "PAYROLL_OBLIGATION_LINKED",
          details: p,
        },
      });
      return { id: o.id };
    },
  );
}

export async function recordPayroll(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "team:write");
  const p = z
    .object({
      requestId: z.uuid(),
      period: periodInput,
      accountId: z.uuid(),
      occurredOn: z.iso.date(),
      note: z.string().trim().min(5).max(1000),
      existingEntryId: z.uuid().optional(),
      rows: z
        .array(
          z.object({
            memberId: z.uuid(),
            amount: amountInput,
            fingerprint: z.string().length(64),
          }),
        )
        .min(1)
        .max(100),
    })
    .parse(raw);
  if (new Set(p.rows.map((r) => r.memberId)).size !== p.rows.length)
    throw new DomainError("Hay empleados repetidos en la selección.");
  if (p.occurredOn > bogotaDay(new Date()) || p.occurredOn < `${p.period}-01`)
    throw new DomainError(
      "La fecha del pago debe estar entre el inicio del mes y hoy.",
    );
  return once(actor, p.requestId, "PAYROLL_PAID", p, async (tx) => {
    const payroll = await monthlyPayroll(tx, p.period);
    const total = p.rows.reduce((s, r) => s.plus(r.amount), new Decimal(0));
    let obligation = await tx.obligation.findUnique({
      where: { salaryPeriod: p.period },
    });
    const net = payroll.rows.reduce(
      (s, r) => s.plus(Decimal.max(0, r.payable ?? 0)),
      new Decimal(0),
    );
    for (const selection of p.rows) {
      const r = payroll.rows.find((r) => r.memberId === selection.memberId);
      if (!r || r.payable === null || r.fingerprint !== selection.fingerprint)
        throw new DomainError(
          "El cálculo cambió. Actualiza el pago del mes y revisa los importes antes de pagar.",
        );
      if (new Decimal(selection.amount).gt(r.remaining!))
        throw new DomainError(
          `El pago de ${r.name} supera su saldo pendiente.`,
        );
    }
    let existing = p.existingEntryId
      ? await tx.cashEntry.findUniqueOrThrow({
          where: { id: p.existingEntryId },
          include: { reversal: true },
        })
      : null;
    if (existing) {
      const available = payroll.unassigned?.find((e) => e.id === existing.id);
      if (
        !available ||
        total.gt(available.amount) ||
        existing.accountId !== p.accountId ||
        existing.occurredOn.toISOString().slice(0, 10) !== p.occurredOn
      )
        throw new DomainError(
          "El movimiento anterior no tiene ese importe disponible para asignar.",
        );
    } else {
      if (payroll.unassigned?.length)
        throw new DomainError(
          "Asigna primero los pagos anteriores a sus empleados para evitar pagarles dos veces.",
        );
      await assertOpenCash(tx, p.accountId, p.occurredOn);
      const account = await tx.moneyAccount.findUniqueOrThrow({
        where: { id: p.accountId },
      });
      if (total.gt(account.balance.toString()))
        throw new DomainError(
          "La cuenta no tiene saldo para todos los pagos seleccionados.",
        );
      await tx.moneyAccount.update({
        where: { id: account.id },
        data: { balance: { decrement: total.toFixed(2) } },
      });
    }
    if (!obligation)
      obligation = await tx.obligation.create({
        data: {
          salaryPeriod: p.period,
          period: p.period,
          title: `Salarios · ${p.period}`,
          category: "PAYROLL",
          amount: net.toFixed(2),
          dueOn: new Date(
            Date.UTC(
              Number(p.period.slice(0, 4)),
              Number(p.period.slice(5)),
              0,
            ),
          ),
          estimated: false,
        },
      });
    else
      await tx.obligation.update({
        where: { id: obligation.id },
        data: { amount: net.toFixed(2) },
      });
    for (const selection of p.rows) {
      const r = payroll.rows.find((r) => r.memberId === selection.memberId)!;
      const entry =
        existing ??
        (await tx.cashEntry.create({
          data: {
            accountId: p.accountId,
            obligationId: obligation.id,
            kind: "SALARY_PAYMENT",
            direction: "OUT",
            amount: selection.amount,
            counterparty: r.name,
            reference: p.period,
            note: p.note,
            occurredOn: day(p.occurredOn),
            actorId: actor.id,
          },
        }));
      const payment = await tx.payrollPayment.create({
        data: {
          memberId: r.memberId,
          period: p.period,
          entryId: entry.id,
          amount: selection.amount,
          calculation: JSON.parse(
            JSON.stringify({ ...r, payments: undefined }),
          ),
          actorId: actor.id,
        },
      });
      if (new Decimal(selection.amount).eq(r.remaining!)) {
        const quotas = await tx.advanceInstallment.findMany({
          where: {
            period: p.period,
            cancelledAt: null,
            appliedOn: null,
            advance: { memberId: r.memberId, voidedAt: null },
          },
        });
        for (const q of quotas) {
          await tx.advanceInstallment.update({
            where: { id: q.id },
            data: { appliedOn: day(p.occurredOn), appliedBy: actor.id },
          });
          await tx.salaryAdvance.update({
            where: { id: q.advanceId },
            data: { version: { increment: 1 } },
          });
          await tx.auditEvent.create({
            data: {
              actorId: actor.id,
              entityId: q.advanceId,
              action: "SALARY_ADVANCE_PAYROLL",
              details: {
                paymentId: payment.id,
                installmentId: q.id,
                period: p.period,
              },
            },
          });
        }
      }
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: r.memberId,
          action: "PAYROLL_PAID",
          details: {
            paymentId: payment.id,
            entryId: entry.id,
            amount: selection.amount,
            period: p.period,
            existing: !!existing,
            note: p.note,
          },
        },
      });
    }
    return { id: p.requestId };
  });
}

export async function reversePayroll(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const p = z
    .object({
      requestId: z.uuid(),
      entryId: z.uuid(),
      occurredOn: z.iso.date(),
      reason: z.string().trim().min(5).max(1000),
    })
    .parse(raw);
  return once(actor, p.requestId, "PAYROLL_REVERSED", p, async (tx) => {
    const entry = await tx.cashEntry.findUniqueOrThrow({
      where: { id: p.entryId },
      include: { reversal: true },
    });
    const payments = await tx.payrollPayment.findMany({
      where: { entryId: entry.id },
    });
    if (!payments.length || entry.reversal || entry.reversalOfId)
      throw new DomainError("Este pago no admite otra reversión.");
    if (
      p.occurredOn < entry.occurredOn.toISOString().slice(0, 10) ||
      p.occurredOn > bogotaDay(new Date())
    )
      throw new DomainError("Revisa la fecha de devolución del pago.");
    await assertOpenCash(tx, entry.accountId, p.occurredOn);
    const reversal = await tx.cashEntry.create({
      data: {
        accountId: entry.accountId,
        obligationId: entry.obligationId,
        kind: "REVERSAL",
        direction: "IN",
        amount: entry.amount,
        counterparty: entry.counterparty,
        reference: entry.reference,
        note: p.reason,
        occurredOn: day(p.occurredOn),
        actorId: actor.id,
        reversalOfId: entry.id,
      },
    });
    await tx.moneyAccount.update({
      where: { id: entry.accountId },
      data: { balance: { increment: entry.amount } },
    });
    for (const payment of payments) {
      const quotas = await tx.advanceInstallment.findMany({
        where: {
          period: payment.period,
          cancelledAt: null,
          appliedOn: { not: null },
          advance: { memberId: payment.memberId, voidedAt: null },
        },
      });
      for (const q of quotas) {
        const auto = await tx.auditEvent.findFirst({
          where: {
            entityId: q.advanceId,
            action: "SALARY_ADVANCE_PAYROLL",
            details: { path: ["installmentId"], equals: q.id },
          },
        });
        if (auto) {
          await tx.advanceInstallment.update({
            where: { id: q.id },
            data: { appliedOn: null, appliedBy: null },
          });
          await tx.salaryAdvance.update({
            where: { id: q.advanceId },
            data: { version: { increment: 1 } },
          });
        }
      }
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: payment.memberId,
          action: "PAYROLL_REVERSED",
          details: { ...p, paymentId: payment.id, period: payment.period },
        },
      });
    }
    return { id: reversal.id };
  });
}
