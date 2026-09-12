import { createHash } from "node:crypto";
import { db } from "../src/server/db";
import {
  recordLeave,
  adjustVacation,
  recordSalaryAdvance,
  rescheduleAdvance,
  applyAdvanceInstallment,
  voidLeave,
} from "../src/server/employee-benefits-service";
if (!process.env.DATABASE_URL?.includes("127.0.0.1:56322/"))
  throw Error("Solo se permite la base local de pruebas.");
const id = (key: string) => {
  const h = createHash("sha256")
    .update(`employee-benefits-v1:${key}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
async function seed(key: string, run: (requestId: string) => Promise<unknown>) {
  const requestId = id(key);
  if (!(await db().commandReceipt.findUnique({ where: { id: requestId } })))
    await run(requestId);
}
try {
  const admin = await db().member.findFirstOrThrow({
    where: { email: "persona1@taller.example.invalid" },
  });
  const members = await db().member.findMany({
    where: {
      active: true,
      role: { in: ["OFFICE", "MECHANIC"] },
      email: { endsWith: "@taller.example.invalid" },
    },
    orderBy: { name: "asc" },
  });
  const account = await db().moneyAccount.findUniqueOrThrow({
    where: { name: "Oficina" },
  });
  for (const member of members)
    await seed(`vacation-${member.id}`, (requestId) =>
      adjustVacation(admin, {
        requestId,
        memberId: member.id,
        days: "15",
        note: "Saldo inicial de prueba al 10 de septiembre de 2026.",
      }),
    );
  const reasons = [
    "Cita odontológica en la mañana.",
    "Diligencia en el colegio de su hijo.",
    "Cita médica de control.",
    "Trámite de documentos personales.",
    "Vacaciones acordadas con el jefe de taller.",
    "Acompañamiento a cita familiar.",
  ];
  for (let i = 0; i < 12; i++) {
    const member = members[i % members.length],
      treatment = i % 3 === 0 ? "HOURS" : i % 3 === 1 ? "PAID" : "VACATION",
      date = `2026-09-${String(14 + i).padStart(2, "0")}`;
    if (new Date(date).getUTCDay() === 0) continue;
    await seed(`leave-${i}`, (requestId) =>
      recordLeave(admin, {
        requestId,
        memberId: member.id,
        treatment,
        from: date,
        to: date,
        start: treatment === "VACATION" ? "00:00" : "09:00",
        end: treatment === "VACATION" ? "23:59" : "11:00",
        note:
          treatment === "VACATION"
            ? "Día de vacaciones acordado con el jefe de taller."
            : reasons[i % 4],
      }),
    );
  }
  await seed("past-permission", (requestId) =>
    recordLeave(admin, {
      requestId,
      memberId: members[0].id,
      treatment: "HOURS",
      from: "2026-09-11",
      to: "2026-09-11",
      start: "08:30",
      end: "10:30",
      note: "Trámite bancario autorizado al inicio de la jornada.",
    }),
  );
  await seed("cancelled-permission", (requestId) =>
    recordLeave(admin, {
      requestId,
      memberId: members[1].id,
      treatment: "PAID",
      from: "2026-09-10",
      to: "2026-09-10",
      start: "14:00",
      end: "16:00",
      note: "Cita de revisión que fue reprogramada.",
    }),
  );
  const cancelled = await db().commandReceipt.findUniqueOrThrow({
    where: { id: id("cancelled-permission") },
  });
  await seed("void-permission", (requestId) =>
    voidLeave(admin, {
      requestId,
      id: (cancelled.result as { id: string }).id,
      reason: "El empleado asistió; la cita se movió a otra fecha.",
    }),
  );
  await seed("vacation-correction", (requestId) =>
    adjustVacation(admin, {
      requestId,
      memberId: members[0].id,
      days: "-0.5",
      note: "Medio día usado antes de registrar el saldo inicial.",
    }),
  );
  const examples = [
    {
      amount: "600000",
      note: "Anticipo para matrícula. Se acordaron tres cuotas de $200.000.",
      installments: [
        { period: "2026-09", amount: "200000" },
        { period: "2026-10", amount: "200000" },
        { period: "2026-11", amount: "200000" },
      ],
    },
    {
      amount: "250000",
      note: "Anticipo para gasto familiar, descontable del próximo mes.",
      installments: [{ period: "2026-10", amount: "250000" }],
    },
    {
      amount: "180000",
      note: "Anticipo de transporte que se descuenta este mes.",
      installments: [{ period: "2026-09", amount: "180000" }],
    },
    {
      amount: "400000",
      note: "Anticipo para arreglo de vivienda.",
      installments: [{ period: "2026-10", amount: "400000" }],
    },
  ];
  for (const [i, example] of examples.entries())
    await seed(`advance-${i}`, (requestId) =>
      recordSalaryAdvance(admin, {
        requestId,
        memberId: members[i].id,
        accountId: account.id,
        disbursedOn: "2026-09-11",
        ...example,
      }),
    );
  const first = await db().commandReceipt.findUniqueOrThrow({
      where: { id: id("advance-0") },
    }),
    advanceId = (first.result as { id: string }).id;
  const firstAdvance = await db().salaryAdvance.findUniqueOrThrow({
    where: { id: advanceId },
    include: { installments: true },
  });
  await seed("first-installment", (requestId) =>
    applyAdvanceInstallment(admin, {
      requestId,
      id: advanceId,
      version: firstAdvance.version,
      installmentId: firstAdvance.installments.find(
        (i) => i.period === "2026-09",
      )!.id,
      appliedOn: "2026-09-12",
      reason: "Primera cuota descontada en el pago acordado.",
    }),
  );
  const fourth = await db().commandReceipt.findUniqueOrThrow({
      where: { id: id("advance-3") },
    }),
    fourthId = (fourth.result as { id: string }).id;
  const fourthAdvance = await db().salaryAdvance.findUniqueOrThrow({
    where: { id: fourthId },
  });
  await seed("reschedule-fourth", (requestId) =>
    rescheduleAdvance(admin, {
      requestId,
      id: fourthId,
      version: fourthAdvance.version,
      reason: "A petición del empleado, se divide en noviembre y diciembre.",
      installments: [
        { period: "2026-11", amount: "200000" },
        { period: "2026-12", amount: "200000" },
      ],
    }),
  );
  console.log(
    JSON.stringify({
      permissions: await db().employeeLeave.count(),
      advances: await db().salaryAdvance.count(),
      vacationAdjustments: await db().vacationAdjustment.count(),
    }),
  );
} finally {
  await db().$disconnect();
}
