import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { db } from "@/server/db";
import {
  saveCompensation,
  recordOvertime,
  voidOvertime,
} from "@/server/team-service";
import {
  compensationHistory,
  overtimePage,
  teamOverview,
} from "@/server/team-query";
import { recordTaskTime } from "@/server/task-service";
import { orderCost } from "@/server/job-service";
import { hubPage } from "@/server/hub-query";
import { getOperations } from "@/server/operations-query";
import { recordsPage } from "@/server/records-query";
import { saveMember } from "@/server/operations-service";

it("keeps overtime in the private schema with runtime-only access", async () => {
  const result = await db().$queryRaw<
    { rls: boolean; anon: boolean; authenticated: boolean; runtime: boolean }[]
  >`SELECT c.relrowsecurity rls,has_table_privilege('anon','workshop."OvertimeEntry"','SELECT') anon,has_table_privilege('authenticated','workshop."OvertimeEntry"','SELECT') authenticated,has_table_privilege('workshop_runtime','workshop."OvertimeEntry"','SELECT,INSERT,UPDATE') runtime FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='workshop' AND c.relname='OvertimeEntry'`;
  expect(result[0]).toEqual({
    rls: true,
    anon: false,
    authenticated: false,
    runtime: true,
  });
});

const admin = { id: uuid(), role: "ADMIN" as const },
  office = { id: uuid(), role: "OFFICE" as const },
  mechanic = { id: uuid(), role: "MECHANIC" as const };
const memberIds: string[] = [admin.id, office.id, mechanic.id],
  taskId = uuid(),
  orderId = uuid(),
  locationId = uuid();
const name = `Prueba salarios ${uuid()}`;
const salary = {
  memberId: mechanic.id,
  monthlySalary: "2100000",
  monthlyEmployerCost: "420000",
  monthlyHours: 210,
  effectiveOn: "2026-08-01",
  note: "Salario inicial del empleado de prueba",
};
const extra = {
  memberId: mechanic.id,
  taskId,
  workedOn: "2026-08-05",
  minutes: 120,
  kind: "DAY",
  surchargePercent: 25,
  employerCost: "5000",
  note: "Prueba de bancada fuera de la jornada",
};
let extraId = "";
beforeAll(async () => {
  await db().member.createMany({
    data: [admin, office, mechanic].map((a) => ({
      ...a,
      name: `${name} ${a.role}`,
      email: `${a.id}@example.invalid`,
    })),
  });
  await db().location.create({
    data: { id: locationId, name, code: uuid().slice(0, 20) },
  });
  await db().workOrder.create({
    data: {
      id: orderId,
      purpose: "OWN_REBUILD",
      status: "IN_PROGRESS",
      title: name,
      reportedProblem: "Prueba de mano de obra y horas extra",
      locationId,
    },
  });
  await db().task.create({
    data: {
      id: taskId,
      title: name,
      orderId,
      assignments: { create: { memberId: mechanic.id } },
    },
  });
});
afterAll(async () => {
  await db().overtimeEntry.deleteMany({
    where: { memberId: { in: memberIds } },
  });
  await db().timeEntry.deleteMany({ where: { memberId: { in: memberIds } } });
  await db().taskAssignment.deleteMany({ where: { taskId } });
  await db().task.deleteMany({ where: { id: taskId } });
  await db().workOrder.deleteMany({ where: { id: orderId } });
  await db().location.deleteMany({ where: { id: locationId } });
  await db().laborRate.deleteMany({ where: { memberId: { in: memberIds } } });
  await db().auditEvent.deleteMany({ where: { actorId: { in: memberIds } } });
  await db().commandReceipt.deleteMany({
    where: { actorId: { in: memberIds } },
  });
  await db().member.deleteMany({ where: { id: { in: memberIds } } });
});
it("derives hourly cost from monthly salary and keeps the command idempotent", async () => {
  const input = { ...salary, requestId: uuid() };
  const a = await saveCompensation(admin, input),
    b = await saveCompensation(admin, input);
  expect(a.id).toBe(b.id);
  const r = await db().laborRate.findUniqueOrThrow({ where: { id: a.id } });
  expect(r.hourlyCost.toString()).toBe("12000");
  await expect(
    saveCompensation(admin, { ...input, monthlySalary: "2200000" }),
  ).rejects.toThrow();
  await recordTaskTime(mechanic, {
    taskId,
    workedOn: "2026-08-05",
    minutes: 60,
    note: "Tiempo ordinario de reparación",
    idempotencyKey: uuid(),
  });
});
it("freezes overtime pay, includes it once in order cost and agrees with the margin report", async () => {
  const input = { ...extra, requestId: uuid() };
  const beforeCash = await db().cashEntry.count(),
    beforeObligations = await db().obligation.count();
  const [a, b] = await Promise.all([
    recordOvertime(admin, input),
    recordOvertime(admin, input),
  ]);
  expect(a.id).toBe(b.id);
  extraId = a.id;
  const e = await db().overtimeEntry.findUniqueOrThrow({
    where: { id: extraId },
  });
  expect(e.pay.toString()).toBe("25000");
  const cost = await db().$transaction((tx) => orderCost(tx, orderId));
  expect(cost.labor.toString()).toBe("42000"); // 12k ordinary + 25k extra + 5k employer
  const margin = await hubPage(
    admin,
    new URLSearchParams({ resource: "margins", q: name }),
  );
  expect(Number(margin.rows[0].data.labor)).toBe(42000);
  expect(Number(margin.rows[0].data.minutes)).toBe(180);
  expect(await db().cashEntry.count()).toBe(beforeCash);
  expect(await db().obligation.count()).toBe(beforeObligations);
});
it("preserves past work when salary changes and rejects changes that reprice existing work", async () => {
  await expect(
    saveCompensation(admin, {
      ...salary,
      requestId: uuid(),
      effectiveOn: "2026-08-04",
    }),
  ).rejects.toThrow("Ya hay trabajo registrado");
  await saveCompensation(admin, {
    ...salary,
    requestId: uuid(),
    monthlySalary: "4200000",
    effectiveOn: "2026-09-01",
  });
  expect(
    (await db().$transaction((tx) => orderCost(tx, orderId))).labor.toString(),
  ).toBe("42000");
  expect(
    (
      await db().overtimeEntry.findUniqueOrThrow({ where: { id: extraId } })
    ).pay.toString(),
  ).toBe("25000");
  const history = await compensationHistory(admin, { memberId: mechanic.id });
  expect(history.map((r) => r.effectiveOn)).toEqual([
    "2026-09-01",
    "2026-08-01",
  ]);
});
it("rejects unassigned tasks, future dates, excessive hours and unavailable salary", async () => {
  await expect(
    recordOvertime(admin, { ...extra, memberId: office.id, requestId: uuid() }),
  ).rejects.toThrow("asignado");
  await expect(
    recordOvertime(admin, {
      ...extra,
      requestId: uuid(),
      workedOn: "2099-01-01",
    }),
  ).rejects.toThrow("después");
  await expect(
    recordOvertime(admin, { ...extra, requestId: uuid(), minutes: 1400 }),
  ).rejects.toThrow("24 horas");
  await expect(
    recordTaskTime(mechanic, {
      taskId,
      workedOn: extra.workedOn,
      minutes: 1400,
      note: "No cabe en el día",
      idempotencyKey: uuid(),
    }),
  ).rejects.toThrow("24 horas");
  await expect(
    recordOvertime(admin, {
      ...extra,
      requestId: uuid(),
      workedOn: "2026-07-01",
    }),
  ).rejects.toThrow("Configura el salario");
});
it("protects salaries and overtime values from office and mechanic roles", async () => {
  for (const actor of [office, mechanic]) {
    await expect(
      saveCompensation(actor, { ...salary, requestId: uuid() }),
    ).rejects.toThrow("permiso");
    await expect(
      recordOvertime(actor, { ...extra, requestId: uuid() }),
    ).rejects.toThrow("permiso");
    await expect(teamOverview(actor, { period: "2026-09" })).rejects.toThrow(
      "permiso",
    );
    await expect(
      compensationHistory(actor, { memberId: mechanic.id }),
    ).rejects.toThrow("permiso");
    await expect(overtimePage(actor, new URLSearchParams())).rejects.toThrow(
      "permiso",
    );
    await expect(
      recordsPage(
        actor,
        new URLSearchParams({ table: "members", orderBy: "monthlySalary" }),
      ),
    ).rejects.toThrow("permiso");
    const snapshot = await getOperations(actor);
    expect(JSON.stringify(snapshot)).not.toMatch(
      /monthlySalary|baseHourlyPay|surchargePercent/,
    );
  }
  const own = await getOperations(mechanic);
  const times = own.tasks.find((t) => t.id === taskId)!.timeEntries!;
  expect(times.reduce((sum, e) => sum + e.minutes, 0)).toBe(180);
  expect(times.filter((e) => e.overtime)).toHaveLength(1);
});
it("supports query, filters, sorting and pagination for overtime", async () => {
  await recordOvertime(admin, {
    ...extra,
    requestId: uuid(),
    workedOn: "2026-08-06",
    minutes: 60,
  });
  const result = await overtimePage(
    admin,
    new URLSearchParams({
      q: name,
      memberId: mechanic.id,
      from: "2026-08-01",
      to: "2026-08-31",
      orderBy: "pay",
      direction: "asc",
      pageSize: "1",
    }),
  );
  expect(result.total).toBe(2);
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0].pay).toBe("12500.00");
  expect(
    (
      await overtimePage(
        admin,
        new URLSearchParams({
          memberId: mechanic.id,
          page: "2",
          pageSize: "1",
          orderBy: "pay",
          direction: "asc",
        }),
      )
    ).rows[0].id,
  ).toBe(extraId);
  await expect(
    overtimePage(admin, new URLSearchParams({ orderBy: "pay;DROP TABLE" })),
  ).rejects.toThrow();
});
it("voids with audit history, removes the cost and keeps the correction idempotent", async () => {
  const input = {
    requestId: uuid(),
    id: extraId,
    reason: "Registro duplicado detectado al revisar las horas",
  };
  await voidOvertime(admin, input);
  await voidOvertime(admin, input);
  expect(
    (
      await overtimePage(
        admin,
        new URLSearchParams({ memberId: mechanic.id, status: "voided" }),
      )
    ).rows[0].voidReason,
  ).toBe(input.reason);
  expect(
    (await db().$transaction((tx) => orderCost(tx, orderId))).labor.toString(),
  ).toBe("29500");
  expect(
    (await getOperations(mechanic)).tasks
      .find((t) => t.id === taskId)!
      .timeEntries!.reduce((s, e) => s + e.minutes, 0),
  ).toBe(120);
});
it("creates a member and their salary atomically", async () => {
  const email = `${uuid()}@example.invalid`;
  const result = await saveMember(admin, {
    name: "Nueva persona de prueba",
    email,
    role: "OFFICE",
    active: true,
    compensation: { ...salary, note: "Salario asignado al crear empleado" },
  });
  memberIds.push(result.id);
  expect(
    (await compensationHistory(admin, { memberId: result.id }))[0]
      .monthlySalary,
  ).toBe("2100000");
  const invalidEmail = `${uuid()}@example.invalid`;
  await expect(
    saveMember(admin, {
      name: "Empleado sin activar",
      email: invalidEmail,
      role: "OFFICE",
      active: false,
      compensation: salary,
    }),
  ).rejects.toThrow();
  expect(
    await db().member.findUnique({ where: { email: invalidEmail } }),
  ).toBeNull();
});
