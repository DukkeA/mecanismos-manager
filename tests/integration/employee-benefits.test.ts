import { cleanupActivity } from "./activity-cleanup";
import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { db } from "@/server/db";
import {
  recordLeave,
  voidLeave,
  adjustVacation,
  recordSalaryAdvance,
  rescheduleAdvance,
  applyAdvanceInstallment,
  voidSalaryAdvance,
} from "@/server/employee-benefits-service";
import {
  benefitsPage,
  vacationAccounts,
  payrollPreview,
  advanceHistory,
} from "@/server/employee-benefits-query";
import { saveCompensation } from "@/server/team-service";
import { reverseCash } from "@/server/cash-service";
import { getOperations } from "@/server/operations-query";
import { recordsPage } from "@/server/records-query";
import { attendancePage } from "@/server/attendance-query";

const admin = { id: uuid(), role: "ADMIN" as const },
  office = { id: uuid(), role: "OFFICE" as const },
  worker = { id: uuid(), role: "MECHANIC" as const };
const ids = [admin.id, office.id, worker.id],
  accountId = uuid(),
  locationId = uuid(),
  name = `Permisos ${uuid()}`;
let settings: Awaited<
  ReturnType<ReturnType<typeof db>["workshopSettings"]["findUniqueOrThrow"]>
>;
beforeAll(async () => {
  settings = await db().workshopSettings.findUniqueOrThrow({
    where: { id: "global" },
  });
  await db().workshopSettings.update({
    where: { id: "global" },
    data: {
      startMinute: 510,
      endMinute: 1020,
      saturdayStartMinute: 480,
      saturdayEndMinute: 720,
    },
  });
  await db().member.createMany({
    data: [admin, office, worker].map((a) => ({
      ...a,
      name: `${name} ${a.role}`,
      email: `${a.id}@example.invalid`,
    })),
  });
  await db().moneyAccount.create({
    data: {
      id: accountId,
      name: uuid(),
      openingBalance: "10000000",
      balance: "10000000",
    },
  });
  await db().location.create({
    data: { id: locationId, code: uuid().slice(0, 20), name },
  });
  await saveCompensation(admin, {
    requestId: uuid(),
    memberId: worker.id,
    monthlySalary: "2100000",
    monthlyEmployerCost: "420000",
    monthlyHours: 210,
    effectiveOn: "2026-08-01",
    note: "Salario inicial para pruebas de permisos",
  });
});
afterAll(async () => {
  await db().workshopSettings.update({
    where: { id: "global" },
    data: settings,
  });
  await db().attendanceShift.deleteMany({ where: { memberId: { in: ids } } });
  await db().employeeLeaveDay.deleteMany({
    where: { leave: { memberId: { in: ids } } },
  });
  await db().employeeLeave.deleteMany({ where: { memberId: { in: ids } } });
  await db().vacationAdjustment.deleteMany({
    where: { memberId: { in: ids } },
  });
  await db().advanceInstallment.deleteMany({
    where: { advance: { memberId: { in: ids } } },
  });
  await db().salaryAdvance.deleteMany({ where: { memberId: { in: ids } } });
  await db().cashClosure.deleteMany({ where: { accountId } });
  await db().cashEntry.deleteMany({ where: { accountId } });
  await db().moneyAccount.delete({ where: { id: accountId } });
  await db().laborRate.deleteMany({ where: { memberId: { in: ids } } });
  await db().auditEvent.deleteMany({ where: { actorId: { in: ids } } });
  await db().commandReceipt.deleteMany({ where: { actorId: { in: ids } } });
  await cleanupActivity(
    (await db().member.findMany({ where: { id: { in: ids } } })).map(
      (m) => m.id,
    ),
  );
  await db().member.deleteMany({ where: { id: { in: ids } } });
  await db().location.delete({ where: { id: locationId } });
});
const leave = (from: string, to = from) => ({
  requestId: uuid(),
  memberId: worker.id,
  treatment: "HOURS",
  from,
  to,
  note: "Permiso autorizado para diligencia personal",
});
const advance = (amount = "600000") => ({
  requestId: uuid(),
  memberId: worker.id,
  accountId,
  amount,
  disbursedOn: "2026-09-10",
  note: "Anticipo acordado con el empleado",
  installments: [{ period: "2026-09", amount }],
});
it("deducts scheduled hours across months, snapshots salary and rejects overlaps", async () => {
  const p = leave("2026-08-31", "2026-09-01");
  const [a, b] = await Promise.all([
    recordLeave(admin, p),
    recordLeave(admin, p),
  ]);
  expect(a).toEqual(b);
  const days = await db().employeeLeaveDay.findMany({
    where: { leaveId: a.id },
    orderBy: { workedOn: "asc" },
  });
  expect(days.map((d) => d.minutes)).toEqual([510, 510]);
  expect(days.map((d) => d.salaryDeduction.toString())).toEqual([
    "85000",
    "85000",
  ]);
  await expect(
    recordLeave(admin, {
      ...leave("2026-09-01"),
      start: "10:00",
      end: "11:00",
    }),
  ).rejects.toThrow("Ya hay un permiso");
  for (const period of ["2026-08", "2026-09"]) {
    const row = (await payrollPreview(admin, period)).rows.find(
      (r) => r.memberId === worker.id,
    )!;
    expect(row.leaveDeduction).toBe("85000.00");
  }
  await voidLeave(admin, {
    requestId: uuid(),
    id: a.id,
    reason: "El empleado pudo asistir esos días",
  });
  expect(
    (await payrollPreview(admin, "2026-08")).rows.find(
      (r) => r.memberId === worker.id,
    )?.leaveDeduction,
  ).toBe("0.00");
  expect(
    (
      await benefitsPage(
        admin,
        new URLSearchParams({ q: name, status: "voided" }),
        "leaves",
      )
    ).total,
  ).toBe(1);
});
it("reserves vacation balances, counts Saturday correctly and retains adjustments", async () => {
  await expect(
    recordLeave(admin, { ...leave("2026-09-12"), treatment: "VACATION" }),
  ).rejects.toThrow("suficientes días");
  await adjustVacation(admin, {
    requestId: uuid(),
    memberId: worker.id,
    days: "2",
    note: "Saldo inicial confirmado por administración",
  });
  const a = await recordLeave(admin, {
    ...leave("2026-09-12", "2026-09-13"),
    treatment: "VACATION",
  });
  const d = await db().employeeLeaveDay.findFirstOrThrow({
    where: { leaveId: a.id },
  });
  expect(d.minutes).toBe(240);
  expect(d.vacationDays.toString()).toBe("1");
  expect(d.salaryDeduction.toString()).toBe("0");
  expect(
    (await vacationAccounts(admin)).find((r) => r.memberId === worker.id)
      ?.balance,
  ).toBe("1.0000");
  await expect(
    adjustVacation(admin, {
      requestId: uuid(),
      memberId: worker.id,
      days: "-2",
      note: "Corrección de saldo registrado",
    }),
  ).rejects.toThrow("negativo");
  await voidLeave(admin, {
    requestId: uuid(),
    id: a.id,
    reason: "Se aplazaron las vacaciones",
  });
  expect(
    (await vacationAccounts(admin)).find((r) => r.memberId === worker.id)
      ?.balance,
  ).toBe("2.0000");
  const two = await Promise.allSettled([
    recordLeave(admin, {
      ...leave("2026-09-14", "2026-09-15"),
      treatment: "VACATION",
    }),
    recordLeave(admin, {
      ...leave("2026-09-16", "2026-09-17"),
      treatment: "VACATION",
    }),
  ]);
  expect(two.filter((r) => r.status === "fulfilled")).toHaveLength(1);
});
it("paid permission excuses lateness without reducing salary or inventing overtime", async () => {
  await recordLeave(admin, {
    ...leave("2026-09-11"),
    treatment: "PAID",
    start: "08:30",
    end: "10:30",
  });
  await db().attendanceShift.create({
    data: {
      memberId: worker.id,
      locationId,
      workedOn: new Date("2026-09-11"),
      startedAt: new Date("2026-09-11T10:40:00-05:00"),
      endedAt: new Date("2026-09-11T17:00:00-05:00"),
      expectedStart: new Date("2026-09-11T08:30:00-05:00"),
      expectedEnd: new Date("2026-09-11T17:00:00-05:00"),
      source: "MANUAL",
    },
  });
  const result = await attendancePage(worker, new URLSearchParams());
  expect(result.rows[0]).toMatchObject({
    authorizedMinutes: 120,
    excusedLateMinutes: 120,
    lateMinutes: 10,
    extraMinutes: 0,
  });
  expect(result.summary.lateMinutes).toBe(10);
});
it("disburses once, enforces plan sums, closed periods and available cash", async () => {
  await expect(
    recordSalaryAdvance(admin, {
      ...advance(),
      installments: [{ period: "2026-09", amount: "1000" }],
    }),
  ).rejects.toThrow("suma");
  await expect(
    recordSalaryAdvance(admin, {
      ...advance(),
      installments: [{ period: "2026-08", amount: "600000" }],
    }),
  ).rejects.toThrow("anteriores");
  await expect(recordSalaryAdvance(admin, advance("10000001"))).rejects.toThrow(
    "saldo suficiente",
  );
  const p = advance(),
    [a, b] = await Promise.all([
      recordSalaryAdvance(admin, p),
      recordSalaryAdvance(admin, p),
    ]);
  expect(a).toEqual(b);
  expect(await db().cashEntry.count({ where: { accountId } })).toBe(1);
  const row = await db().salaryAdvance.findUniqueOrThrow({
    where: { id: a.id },
  });
  await expect(
    reverseCash(admin, {
      requestId: uuid(),
      entryId: row.entryId,
      occurredOn: "2026-09-10",
      reason: "Corrección desde dinero",
    }),
  ).rejects.toThrow("Equipo");
  const closure = await db().cashClosure.create({
    data: {
      accountId,
      throughOn: new Date("2026-09-10"),
      expected: "9400000",
      counted: "9400000",
      difference: "0",
      note: "Cierre de cuenta prueba",
      actorId: admin.id,
    },
  });
  await expect(recordSalaryAdvance(admin, advance("100"))).rejects.toThrow();
  await db().cashClosure.delete({ where: { id: closure.id } });
});
it("reschedules pending quotas, applies and reverses without a second cash movement", async () => {
  const a = await recordSalaryAdvance(admin, advance("300000"));
  await rescheduleAdvance(admin, {
    requestId: uuid(),
    id: a.id,
    version: 1,
    reason: "Acordamos tres descuentos mensuales",
    installments: [
      { period: "2026-09", amount: "100000" },
      { period: "2026-10", amount: "100000" },
      { period: "2026-11", amount: "100000" },
    ],
  });
  await expect(
    rescheduleAdvance(admin, {
      requestId: uuid(),
      id: a.id,
      version: 1,
      reason: "Versión desactualizada de prueba",
      installments: [{ period: "2026-10", amount: "300000" }],
    }),
  ).rejects.toThrow("cambió");
  let row = await db().salaryAdvance.findUniqueOrThrow({
    where: { id: a.id },
    include: { installments: true },
  });
  const installment = row.installments.find(
    (i) => !i.cancelledAt && i.period === "2026-09",
  )!;
  const cash = await db().cashEntry.count({ where: { accountId } });
  const apply = {
    requestId: uuid(),
    id: a.id,
    version: 2,
    installmentId: installment.id,
    reason: "Cuota descontada al pagar salario",
    appliedOn: "2026-09-12",
  };
  expect(await applyAdvanceInstallment(admin, apply)).toEqual(
    await applyAdvanceInstallment(admin, apply),
  );
  expect(await db().cashEntry.count({ where: { accountId } })).toBe(cash);
  expect(
    (await payrollPreview(admin, "2026-09")).rows.find(
      (r) => r.memberId === worker.id,
    ),
  ).toMatchObject({
    installments: "700000.00",
    applied: "100000.00",
    payable: "1400000.00",
  });
  await expect(
    voidSalaryAdvance(admin, {
      requestId: uuid(),
      id: a.id,
      version: 3,
      reason: "Anulación de anticipo con descuentos",
      occurredOn: "2026-09-12",
    }),
  ).rejects.toThrow("Revierte");
  await applyAdvanceInstallment(admin, {
    ...apply,
    requestId: uuid(),
    version: 3,
    reverse: true,
    reason: "Se aplazó el pago de salario",
  });
  await voidSalaryAdvance(admin, {
    requestId: uuid(),
    id: a.id,
    version: 4,
    reason: "El empleado devolvió el dinero",
    occurredOn: "2026-09-12",
  });
  row = await db().salaryAdvance.findUniqueOrThrow({
    where: { id: a.id },
    include: { installments: true },
  });
  expect(row.voidedAt).toBeTruthy();
  expect(row.installments.every((i) => !!i.cancelledAt)).toBe(true);
  expect(
    (await advanceHistory(admin, a.id)).some(
      (e) => (e.details as { reverse?: boolean }).reverse,
    ),
  ).toBe(true);
});
it("allows office to query advances while protecting them from mechanics", async () => {
  const entries = await db().cashEntry.findMany({ where: { accountId } }),
    entryIds = entries.map((e) => e.id);
  const snapshot = await getOperations(office);
  expect(
    snapshot.cashEntries.filter((e) => entryIds.includes(e.id)),
  ).toHaveLength(entries.length);
  const page = await recordsPage(
    office,
    new URLSearchParams({ table: "cashEntries", q: name }),
  );
  expect(page.total).toBeGreaterThan(0);
  for (const actor of [worker]) {
    await expect(
      benefitsPage(actor, new URLSearchParams(), "advances"),
    ).rejects.toThrow("permiso");
    await expect(payrollPreview(actor, "2026-09")).rejects.toThrow("permiso");
    await expect(vacationAccounts(actor)).rejects.toThrow("permiso");
    await expect(recordLeave(actor, leave("2026-09-18"))).rejects.toThrow(
      "permiso",
    );
    await expect(recordSalaryAdvance(actor, advance())).rejects.toThrow(
      "permiso",
    );
  }
  expect(
    (
      await benefitsPage(
        admin,
        new URLSearchParams({ q: name, status: "all" }),
        "advances",
      )
    ).total,
  ).toBe(2);
  const rights = await db().$queryRaw<
    { allowed: boolean }[]
  >`SELECT has_table_privilege('anon','workshop."SalaryAdvance"','SELECT') OR has_table_privilege('authenticated','workshop."EmployeeLeave"','SELECT') allowed`;
  expect(rights[0].allowed).toBe(false);
  const snapshots = await db().$queryRaw<
    { allowed: boolean }[]
  >`SELECT has_table_privilege('workshop_runtime','workshop."EmployeeLeaveDay"','UPDATE') OR has_table_privilege('workshop_runtime','workshop."VacationAdjustment"','UPDATE') allowed`;
  expect(snapshots[0].allowed).toBe(false);
  const sorted = await payrollPreview(admin, "2026-09", {
    orderBy: "payable",
    direction: "desc",
  });
  const amounts = sorted.rows
    .filter((r) => r.payable !== null)
    .map((r) => Number(r.payable));
  expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
});
