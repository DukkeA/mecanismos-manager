import "server-only";
import { z } from "zod";
import Decimal from "decimal.js";
import { compensationInput, hourlyCost, overtimePay } from "@/domain/team";
import { money } from "@/domain/commercial";
import { DomainError } from "@/domain/errors";
import { requirePermission } from "@/domain/permissions";
import { once, type Actor, type Tx } from "./commands";
import { day } from "./commercial-ledger";

export async function writeCompensation(
  tx: Tx,
  actor: Actor,
  memberId: string,
  input: z.infer<typeof compensationInput>,
) {
  const date = day(input.effectiveOn);
  const member = await tx.member.findUniqueOrThrow({ where: { id: memberId } });
  if (!member.active)
    throw new DomainError("Activa al empleado antes de registrar su salario.");
  const latest = await tx.laborRate.findFirst({
    where: { memberId },
    orderBy: { effectiveOn: "desc" },
  });
  if (latest && latest.effectiveOn >= date)
    throw new DomainError(
      "Ya hay condiciones para esa fecha o una posterior. Registra una nueva vigencia.",
    );
  // A new salary must not reprice work already costed under previous conditions.
  if (
    latest &&
    (await tx.timeEntry.findFirst({
      where: { memberId, workedOn: { gte: date } },
    }))
  )
    throw new DomainError(
      "Ya hay trabajo registrado desde esa fecha. Usa una vigencia posterior para conservar sus costos.",
    );
  const rate = await tx.laborRate.create({
    data: {
      memberId,
      effectiveOn: date,
      monthlySalary: input.monthlySalary,
      monthlyEmployerCost: input.monthlyEmployerCost,
      monthlyHours: input.monthlyHours,
      hourlyCost: hourlyCost(
        input.monthlySalary,
        input.monthlyEmployerCost,
        input.monthlyHours,
      ),
      note: input.note,
      actorId: actor.id,
    },
  });
  await tx.auditEvent.create({
    data: {
      actorId: actor.id,
      entityId: memberId,
      action: "COMPENSATION_SET",
      details: { rateId: rate.id, ...input },
    },
  });
  return { id: rate.id };
}
export async function saveCompensation(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "payroll:read");
  const input = compensationInput
    .extend({ requestId: z.uuid(), memberId: z.uuid() })
    .parse(raw);
  return once(actor, input.requestId, "COMPENSATION_SET", input, (tx) =>
    writeCompensation(tx, actor, input.memberId, input),
  );
}
export async function recordOvertime(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "payroll:read");
  const input = z
    .object({
      requestId: z.uuid(),
      memberId: z.uuid(),
      taskId: z.uuid().optional(),
      workedOn: z.iso.date(),
      minutes: z.coerce.number().int().min(1).max(1440),
      kind: z.enum(["DAY", "NIGHT"]),
      surchargePercent: z.coerce.number().min(0).max(300),
      employerCost: money,
      note: z.string().trim().min(5).max(1000),
    })
    .parse(raw);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
  }).format(new Date());
  if (input.workedOn > today)
    throw new DomainError("Registra las horas extra después de trabajarlas.");
  return once(
    actor,
    input.requestId,
    "OVERTIME_RECORDED",
    input,
    async (tx) => {
      const member = await tx.member.findUniqueOrThrow({
        where: { id: input.memberId },
      });
      if (!member.active)
        throw new DomainError("Selecciona un empleado activo.");
      if (input.taskId) {
        const task = await tx.task.findUniqueOrThrow({
          where: { id: input.taskId },
          include: { order: true, assignments: true },
        });
        if (
          task.deletedAt ||
          (task.order && ["CLOSED", "CANCELLED"].includes(task.order.status))
        )
          throw new DomainError(
            "La tarea está eliminada o su orden está cerrada.",
          );
        if (!task.assignments.some((a) => a.memberId === input.memberId))
          throw new DomainError("El empleado debe estar asignado a la tarea.");
      }
      const workedOn = day(input.workedOn);
      const rate = await tx.laborRate.findFirst({
        where: { memberId: input.memberId, effectiveOn: { lte: workedOn } },
        orderBy: { effectiveOn: "desc" },
      });
      if (!rate?.monthlySalary?.gt(0) || !rate.monthlyHours)
        throw new DomainError(
          "Configura el salario mensual vigente en la fecha trabajada.",
        );
      const [regular, extra] = await Promise.all([
        tx.timeEntry.aggregate({
          where: { memberId: input.memberId, workedOn },
          _sum: { minutes: true },
        }),
        tx.overtimeEntry.aggregate({
          where: { memberId: input.memberId, workedOn, voidedAt: null },
          _sum: { minutes: true },
        }),
      ]);
      if (
        (regular._sum.minutes ?? 0) +
          (extra._sum.minutes ?? 0) +
          input.minutes >
        1440
      )
        throw new DomainError(
          "El tiempo total del empleado supera las 24 horas de ese día.",
        );
      const baseHourlyPay = new Decimal(rate.monthlySalary.toString())
        .div(rate.monthlyHours.toString())
        .toFixed(6);
      const { requestId: _requestId, ...values } = input;
      const entry = await tx.overtimeEntry.create({
        data: {
          ...values,
          workedOn,
          rateId: rate.id,
          actorId: actor.id,
          baseHourlyPay,
          pay: overtimePay(
            baseHourlyPay,
            input.minutes,
            input.surchargePercent,
          ),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: entry.id,
          action: "OVERTIME_RECORDED",
          details: { ...input, pay: entry.pay.toString() },
        },
      });
      return { id: entry.id };
    },
  );
}
export async function voidOvertime(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "payroll:read");
  const input = z
    .object({
      requestId: z.uuid(),
      id: z.uuid(),
      reason: z.string().trim().min(5).max(1000),
    })
    .parse(raw);
  return once(actor, input.requestId, "OVERTIME_VOIDED", input, async (tx) => {
    const entry = await tx.overtimeEntry.findUniqueOrThrow({
      where: { id: input.id },
    });
    if (entry.voidedAt) throw new DomainError("Estas horas ya están anuladas.");
    if (entry.taskId) {
      const task = await tx.task.findUniqueOrThrow({
        where: { id: entry.taskId },
        include: { order: true },
      });
      if (task.order && ["CLOSED", "CANCELLED"].includes(task.order.status))
        throw new DomainError(
          "La orden está cerrada. Revisa sus costos antes de corregir el tiempo.",
        );
    }
    await tx.overtimeEntry.update({
      where: { id: input.id },
      data: { voidedAt: new Date(), voidReason: input.reason },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: input.id,
        action: "OVERTIME_VOIDED",
        details: input,
      },
    });
    return { id: input.id };
  });
}
