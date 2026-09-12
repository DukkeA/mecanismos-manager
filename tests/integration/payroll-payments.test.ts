import { parseEnv } from "node:util";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { cleanupActivity } from "./activity-cleanup";
import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { db } from "@/server/db";
import {
  recordPayroll,
  reversePayroll,
  adoptSalaryObligation,
} from "@/server/payroll-service";
import { payrollPreview } from "@/server/employee-benefits-query";
import { saveCompensation, recordOvertime } from "@/server/team-service";
import {
  recordSalaryAdvance,
  applyAdvanceInstallment,
  voidLeave,
} from "@/server/employee-benefits-service";
import { saveMember } from "@/server/operations-service";
import { reverseCash } from "@/server/cash-service";
import { activityQuery, readNotification } from "@/server/activity-query";
import { getOperations } from "@/server/operations-query";
import { cashSummary } from "@/features/cash/summary";
const admin = { id: uuid(), role: "ADMIN" as const },
  office = { id: uuid(), role: "OFFICE" as const },
  worker = { id: uuid(), role: "MECHANIC" as const },
  second = { id: uuid(), role: "MECHANIC" as const };
const actors = [admin, office, worker, second],
  ids = actors.map((a) => a.id),
  accountId = uuid(),
  period = "2026-06";
const priorSalaryIds: string[] = [];
let advanceId = "",
  legacyId = "";
async function row(memberId = worker.id) {
  return (await payrollPreview(admin, period)).rows.find(
    (r) => r.memberId === memberId,
  )!;
}
async function input(memberId = worker.id, amount?: string) {
  const r = await row(memberId);
  return {
    requestId: uuid(),
    period,
    accountId,
    occurredOn: "2026-06-30",
    note: "Pago mensual de prueba",
    rows: [
      { memberId, amount: amount ?? r.remaining!, fingerprint: r.fingerprint },
    ],
  };
}
beforeAll(async () => {
  priorSalaryIds.push(
    ...(
      await db().obligation.findMany({
        where: { salaryPeriod: { not: null } },
        select: { id: true },
      })
    ).map((o) => o.id),
  );
  await db().member.createMany({
    data: actors.map((a) => ({
      ...a,
      name: `Prueba pagos ${a.id}`,
      email: `${a.id}@example.invalid`,
    })),
  });
  await db().moneyAccount.create({
    data: {
      id: accountId,
      name: `Prueba pagos ${uuid()}`,
      openingBalance: "10000000",
      balance: "10000000",
    },
  });
  for (const m of [worker, second])
    await saveCompensation(admin, {
      requestId: uuid(),
      memberId: m.id,
      monthlySalary: "2000000",
      monthlyEmployerCost: "0",
      monthlyHours: 200,
      effectiveOn: "2026-06-01",
      note: "Salario inicial para prueba de pagos",
    });
  advanceId = (
    await recordSalaryAdvance(office, {
      requestId: uuid(),
      memberId: worker.id,
      accountId,
      amount: "200000",
      disbursedOn: "2026-06-01",
      note: "Anticipo a descontar en junio",
      installments: [{ period, amount: "200000" }],
    })
  ).id;
});
afterAll(async () => {
  const changes = await db().recordChange.findMany({
    where: { actorId: { in: ids } },
    select: { batchId: true },
  });
  await db().adminNotification.deleteMany({
    where: { batchId: { in: changes.map((c) => c.batchId) } },
  });
  await db().recordChange.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] },
  });
  await db().payrollPayment.deleteMany({ where: { memberId: { in: ids } } });
  await db().advanceInstallment.deleteMany({
    where: { advance: { memberId: { in: ids } } },
  });
  await db().salaryAdvance.deleteMany({ where: { memberId: { in: ids } } });
  await db().cashEntry.deleteMany({
    where: { accountId, reversalOfId: { not: null } },
  });
  await db().cashEntry.deleteMany({ where: { accountId } });
  await db().obligation.deleteMany({
    where: {
      id: { notIn: priorSalaryIds },
      OR: [{ salaryPeriod: period }, { id: legacyId || uuid() }],
    },
  });
  await db().moneyAccount.delete({ where: { id: accountId } });
  await db().laborRate.deleteMany({ where: { memberId: { in: ids } } });
  await db().overtimeEntry.deleteMany({ where: { memberId: { in: ids } } });
  await db().auditEvent.deleteMany({ where: { actorId: { in: ids } } });
  await db().commandReceipt.deleteMany({ where: { actorId: { in: ids } } });
  await cleanupActivity(
    (await db().member.findMany({ where: { id: { in: ids } } })).map(
      (m) => m.id,
    ),
  );
  await db().member.deleteMany({ where: { id: { in: ids } } });
  await db().$disconnect();
});

it("records an office partial payment once, notifies administrators and updates cash coverage", async () => {
  const p = await input(worker.id, "500000");
  expect(await recordPayroll(office, p)).toEqual(
    await recordPayroll(office, p),
  );
  const r = await row();
  expect(r.paid).toBe("500000.00");
  expect(r.remaining).toBe("1300000.00");
  expect(r.payments).toHaveLength(1);
  expect(
    (
      await db().moneyAccount.findUniqueOrThrow({ where: { id: accountId } })
    ).balance.toString(),
  ).toBe("9300000");
  const data = await getOperations(office),
    summary = cashSummary(data, period, "2026-06-30");
  expect(data.obligations.find((o) => o.salaryPeriod === period)?.paid).toBe(
    "500000.00",
  );
  expect(Number(summary.paid)).toBeGreaterThanOrEqual(500000);
  const change = await db().recordChange.findFirstOrThrow({
    where: { entityType: "PayrollPayment", actorId: office.id },
  });
  expect(
    await db().adminNotification.count({
      where: { batchId: change.batchId, recipientId: admin.id },
    }),
  ).toBe(1);
  const stamp = (await activityQuery(
    office,
    new URLSearchParams({ resource: "latest" }),
  )) as Record<string, { author: string }>;
  expect(stamp[worker.id].author).toBe(`Prueba pagos ${office.id}`);
});
it("rolls back an invalid bulk payment and rejects stale concurrent selections", async () => {
  const first = await input(worker.id, "100000"),
    secondRow = await row(second.id);
  await expect(
    recordPayroll(office, {
      ...first,
      rows: [
        ...first.rows,
        {
          memberId: second.id,
          amount: "2000001",
          fingerprint: secondRow.fingerprint,
        },
      ],
    }),
  ).rejects.toThrow("supera");
  expect((await row()).paid).toBe("500000.00");
  const same = await input(worker.id, "1300000");
  const results = await Promise.allSettled([
    recordPayroll(office, same),
    recordPayroll(admin, { ...same, requestId: uuid() }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await row()).remaining).toBe("0.00");
  const quota = await db().advanceInstallment.findFirstOrThrow({
    where: { advanceId },
  });
  expect(quota.appliedOn).not.toBeNull();
  expect(
    (
      await db().moneyAccount.findUniqueOrThrow({ where: { id: accountId } })
    ).balance.toString(),
  ).toBe("8000000");
});
it("protects paid calculations and disallows office reversals and privilege escalation", async () => {
  await expect(
    recordOvertime(office, {
      requestId: uuid(),
      memberId: worker.id,
      workedOn: "2026-06-28",
      kind: "FIXED",
      pay: "100000",
      minutes: 0,
      surchargePercent: 0,
      employerCost: "0",
      note: "Cambio posterior al pago",
    }),
  ).rejects.toThrow("ya tiene pagos");
  await expect(
    saveCompensation(office, {
      requestId: uuid(),
      memberId: worker.id,
      monthlySalary: "2500000",
      monthlyEmployerCost: "0",
      monthlyHours: 200,
      effectiveOn: "2026-06-15",
      note: "Cambio posterior al pago",
    }),
  ).rejects.toThrow("ya tiene pagos");
  await expect(
    saveMember(office, {
      id: office.id,
      name: "Autorización indebida",
      email: `${office.id}@example.invalid`,
      role: "ADMIN",
      active: true,
    }),
  ).rejects.toThrow("Solo administración");
  await expect(
    saveMember(office, {
      id: worker.id,
      name: "Desactivación indebida",
      email: `${worker.id}@example.invalid`,
      role: "MECHANIC",
      active: false,
    }),
  ).rejects.toThrow("Solo administración");
  const entry = (await row()).payments[0];
  await expect(
    reversePayroll(office, {
      requestId: uuid(),
      entryId: entry.entryId,
      occurredOn: "2026-06-30",
      reason: "Intento de reversión",
    }),
  ).rejects.toThrow("permiso");
  await expect(voidLeave(office, {})).rejects.toThrow("permiso");
  await expect(
    reverseCash(admin, {
      requestId: uuid(),
      entryId: entry.entryId,
      occurredOn: "2026-06-30",
      reason: "Reversión por caja genérica",
    }),
  ).rejects.toThrow("Equipo");
  const a = await db().salaryAdvance.findUniqueOrThrow({
      where: { id: advanceId },
    }),
    quota = await db().advanceInstallment.findFirstOrThrow({
      where: { advanceId },
    });
  await expect(
    applyAdvanceInstallment(admin, {
      requestId: uuid(),
      id: advanceId,
      version: a.version,
      installmentId: quota.id,
      reverse: true,
      appliedOn: "2026-06-30",
      reason: "Reversión sin devolver el salario",
    }),
  ).rejects.toThrow("ya tiene pagos");
});
it("reverses cash and automatic deductions together while retaining payment history", async () => {
  const entry =
    (await row()).payments.find((p) => p.amount === "1300000") ??
    (await row()).payments.find((p) => Number(p.amount) === 1300000)!;
  const p = {
    requestId: uuid(),
    entryId: entry.entryId,
    occurredOn: "2026-06-30",
    reason: "Empleado devuelve el pago duplicado en el banco",
  };
  await reversePayroll(admin, p);
  await reversePayroll(admin, p);
  const r = await row();
  expect(r.paid).toBe("500000.00");
  expect(r.remaining).toBe("1300000.00");
  expect(r.payments.filter((p) => p.reversed)).toHaveLength(1);
  expect(
    (await db().advanceInstallment.findFirstOrThrow({ where: { advanceId } }))
      .appliedOn,
  ).toBeNull();
  await recordPayroll(office, await input(worker.id));
  expect((await row()).remaining).toBe("0.00");
});
it("rejects an underfunded bulk payment without cash or payment side effects", async () => {
  const p = await input(second.id);
  await db().moneyAccount.update({
    where: { id: accountId },
    data: { balance: "1" },
  });
  const count = await db().cashEntry.count({ where: { accountId } });
  await expect(recordPayroll(office, p)).rejects.toThrow("saldo");
  expect(await db().cashEntry.count({ where: { accountId } })).toBe(count);
  expect((await row(second.id)).paid).toBe("0.00");
  await db().moneyAccount.update({
    where: { id: accountId },
    data: { balance: "8000000" },
  });
});
it("keeps notifications recipient scoped and records before and after profile edits", async () => {
  const member = await db().member.findUniqueOrThrow({
    where: { id: second.id },
  });
  await saveMember(office, {
    id: member.id,
    name: "Nombre corregido en oficina",
    email: member.email,
    role: "MECHANIC",
    active: true,
  });
  const change = await db().recordChange.findFirstOrThrow({
    where: { entityId: member.id, actorId: office.id, operation: "UPDATE" },
  });
  expect((change.before as { name: string }).name).toBe(member.name);
  expect((change.after as { name: string }).name).toBe(
    "Nombre corregido en oficina",
  );
  const notice = await db().adminNotification.findFirstOrThrow({
    where: { batchId: change.batchId, recipientId: admin.id },
  });
  await expect(readNotification(office, { ids: [notice.id] })).rejects.toThrow(
    "permiso",
  );
  await readNotification(admin, { ids: [notice.id] });
  expect(
    (
      await db().adminNotification.findUniqueOrThrow({
        where: { id: notice.id },
      })
    ).readAt,
  ).not.toBeNull();
  const other = await db().adminNotification.findFirstOrThrow({
    where: { batchId: change.batchId, recipientId: { not: admin.id } },
  });
  await readNotification(admin, { ids: [other.id] });
  expect(
    (
      await db().adminNotification.findUniqueOrThrow({
        where: { id: other.id },
      })
    ).readAt,
  ).toBeNull();
  await expect(
    activityQuery(worker, new URLSearchParams({ resource: "latest" })),
  ).rejects.toThrow("permiso");
});
it("protects immutable payroll history and record changes at database role level", async () => {
  const [p] = await db().$queryRaw<
    { cash: boolean; payroll: boolean; changes: boolean; anonymous: boolean }[]
  >`SELECT
    has_table_privilege('workshop_runtime','workshop."CashEntry"','UPDATE,DELETE') cash,
    has_table_privilege('workshop_runtime','workshop."PayrollPayment"','UPDATE,DELETE') payroll,
    has_table_privilege('workshop_runtime','workshop."RecordChange"','UPDATE,DELETE') changes,
    has_table_privilege('anon','workshop."RecordChange"','SELECT') anonymous`;
  expect(p).toEqual({
    cash: false,
    payroll: false,
    changes: false,
    anonymous: false,
  });
});

it("assigns an older cash payment in parts without moving money again", async () => {
  const month = "2026-07";
  legacyId = (
    await db().obligation.create({
      data: {
        title: "Salarios anteriores de prueba",
        category: "PAYROLL",
        period: month,
        amount: "4000000",
        dueOn: new Date("2026-07-31"),
      },
    })
  ).id;
  const e = await db().cashEntry.create({
    data: {
      accountId,
      obligationId: legacyId,
      amount: "500000",
      direction: "OUT",
      kind: "EXPENSE_PAYMENT",
      counterparty: "Personal de prueba",
      reference: month,
      note: "Pago anterior por asignar",
      occurredOn: new Date("2026-07-31"),
      actorId: admin.id,
    },
  });
  await adoptSalaryObligation(admin, {
    requestId: uuid(),
    obligationId: legacyId,
    period: month,
  });
  const before = (
    await db().moneyAccount.findUniqueOrThrow({ where: { id: accountId } })
  ).balance.toString();
  for (let i = 0; i < 2; i++) {
    const r = (await payrollPreview(office, month)).rows.find(
      (r) => r.memberId === worker.id,
    )!;
    const p = {
      requestId: uuid(),
      period: month,
      accountId,
      occurredOn: "2026-07-31",
      note: "Asignación de comprobante anterior",
      rows: [
        { memberId: worker.id, amount: "250000", fingerprint: r.fingerprint },
      ],
    };
    await expect(recordPayroll(office, p)).rejects.toThrow("Asigna primero");
    await recordPayroll(office, {
      ...p,
      requestId: uuid(),
      existingEntryId: e.id,
    });
  }
  const q = await payrollPreview(admin, month);
  expect(q.unassigned).toHaveLength(0);
  expect(q.rows.find((r) => r.memberId === worker.id)!.paid).toBe("500000.00");
  expect(
    (
      await db().moneyAccount.findUniqueOrThrow({ where: { id: accountId } })
    ).balance.toString(),
  ).toBe(before);
});
it("keeps partial payments while allowing later bonuses and rejects an underfunded recalculation", async () => {
  await recordOvertime(office, {
    requestId: uuid(),
    memberId: worker.id,
    workedOn: "2026-07-28",
    kind: "FIXED",
    pay: "10000",
    minutes: 0,
    surchargePercent: 0,
    employerCost: "0",
    note: "Bono después del abono de quincena",
  });
  const current = (await payrollPreview(office, "2026-07")).rows.find(
    (r) => r.memberId === worker.id,
  )!;
  expect(current.paid).toBe("500000.00");
  expect(current.remaining).toBe("1510000.00");
  await expect(
    saveCompensation(office, {
      requestId: uuid(),
      memberId: worker.id,
      monthlySalary: "300000",
      monthlyEmployerCost: "0",
      monthlyHours: 200,
      effectiveOn: "2026-07-15",
      note: "Descuento que supera el pendiente",
    }),
  ).rejects.toThrow("por debajo de lo ya pagado");
  expect(
    (await payrollPreview(office, "2026-07")).rows.find(
      (r) => r.memberId === worker.id,
    )!.salary,
  ).toBe("2000000");
  await reversePayroll(admin, {
    requestId: uuid(),
    entryId: current.payments[0].entryId,
    occurredOn: "2026-07-31",
    reason: "Devolución del pago anterior de prueba",
  });
  const latest = (await activityQuery(
    admin,
    new URLSearchParams({ resource: "latest" }),
  )) as Record<string, { author: string }>;
  expect(latest[worker.id].author).toBe(`Prueba pagos ${admin.id}`);
  expect(latest[legacyId].author).toBe(`Prueba pagos ${admin.id}`);
  const history = (await activityQuery(
    admin,
    new URLSearchParams({ resource: "history", id: worker.id }),
  )) as { author: string; after: Record<string, unknown> }[];
  expect(
    history.some(
      (c) =>
        c.author === `Prueba pagos ${admin.id}` && c.after.kind === "REVERSAL",
    ),
  ).toBe(true);
});

it("writes obligation corrections and their audit through the application database role", async () => {
  const rollback = new Error("rollback runtime probe");
  const connectionString = parseEnv(
    readFileSync(".env.local", "utf8"),
  ).DATABASE_URL;
  if (!connectionString)
    throw new Error(
      "Falta DATABASE_URL local para la prueba del rol de aplicación.",
    );
  const url = new URL(connectionString);
  expect(["127.0.0.1", "localhost"]).toContain(url.hostname);
  expect(url.port).toBe("56322");
  const runtime = new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: 1 }),
  });
  try {
    await expect(
      runtime.$transaction(async (tx) => {
        expect(
          (
            await tx.$queryRaw<{ current_user: string }[]>`SELECT current_user`
          )[0].current_user,
        ).toBe("workshop_runtime");
        await tx.$queryRaw`SELECT set_config('workshop.actor_id',${office.id},true)`;
        await tx.obligation.update({
          where: { id: legacyId },
          data: { amount: "42.00", estimated: true },
        });
        const change = await tx.recordChange.findFirstOrThrow({
          where: { entityId: legacyId, actorId: office.id },
          orderBy: { createdAt: "desc" },
        });
        expect(change.actorName).toBe(`Prueba pagos ${office.id}`);
        expect(
          await tx.adminNotification.count({
            where: { batchId: change.batchId, recipientId: admin.id },
          }),
        ).toBe(1);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await runtime.$disconnect();
  }
});
