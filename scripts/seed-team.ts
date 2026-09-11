import { createHash } from "node:crypto";
import { db } from "../src/server/db";
import {
  saveCompensation,
  recordOvertime,
  voidOvertime,
} from "../src/server/team-service";
if (!process.env.DATABASE_URL?.includes("127.0.0.1:56322/"))
  throw Error("Solo se permite la base local de pruebas.");
const id = (key: string) => {
  const h = createHash("sha256")
    .update(`team-fixtures-v1:${key}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
try {
  const actor = await db().member.findFirstOrThrow({
    where: {
      role: "ADMIN",
      active: true,
      email: "persona1@taller.example.invalid",
    },
  });
  const members = await db().member.findMany({
    where: { email: { endsWith: "@taller.example.invalid" }, active: true },
    orderBy: { name: "asc" },
  });
  for (const [i, member] of members.entries()) {
    const requestId = id(`salary-${member.id}`);
    if (await db().commandReceipt.findUnique({ where: { id: requestId } }))
      continue;
    // New conditions start after the existing fixture time entries. Historical costs stay intact.
    await saveCompensation(actor, {
      requestId,
      memberId: member.id,
      effectiveOn: "2026-09-10",
      monthlySalary:
        member.role === "ADMIN"
          ? "0"
          : String(
              member.role === "OFFICE" ? 2400000 : 2600000 + (i % 5) * 250000,
            ),
      monthlyEmployerCost:
        member.role === "ADMIN"
          ? "0"
          : String(member.role === "OFFICE" ? 850000 : 1100000),
      monthlyHours: 210,
      note:
        member.role === "ADMIN"
          ? "Socio del taller, sin salario fijo asignado."
          : "Salario de prueba para septiembre. Aportes, prestaciones y auxilios incluidos en costos adicionales.",
    });
  }
  const mechanics = members.filter((m) => m.role === "MECHANIC");
  for (const [i, member] of mechanics.slice(0, 3).entries()) {
    const requestId = id(`extra-${member.id}`);
    if (await db().commandReceipt.findUnique({ where: { id: requestId } }))
      continue;
    const task = await db().task.findFirst({
      where: {
        deletedAt: null,
        assignments: { some: { memberId: member.id } },
        order: { status: { notIn: ["CLOSED", "CANCELLED"] } },
      },
      orderBy: { id: "asc" },
    });
    await recordOvertime(actor, {
      requestId,
      memberId: member.id,
      ...(task ? { taskId: task.id } : {}),
      workedOn: "2026-09-10",
      minutes: [90, 120, 60][i],
      kind: i === 1 ? "NIGHT" : "DAY",
      surchargePercent: i === 1 ? 75 : 25,
      employerCost: "12000",
      note: [
        "Prueba de retorno y ajuste final de los inyectores antes de la entrega.",
        "Montaje de la transmisión y prueba en carretera al terminar la jornada.",
        "Orden y limpieza de herramientas del banco de pruebas.",
      ][i],
    });
  }
  const office = members.find((m) => m.role === "OFFICE")!;
  const created = await recordOvertime(actor, {
    requestId: id("void-example"),
    memberId: office.id,
    workedOn: "2026-09-10",
    minutes: 60,
    kind: "DAY",
    surchargePercent: 25,
    employerCost: "0",
    note: "Organización de remisiones y llamadas a proveedores.",
  });
  await voidOvertime(actor, {
    requestId: id("void-example-cancel"),
    id: created.id,
    reason:
      "El tiempo correspondía a la jornada ordinaria; registro corregido por oficina.",
  });
  console.log(
    "Equipo: salarios mensuales, horas extra diurnas y nocturnas, tareas asociadas y una anulación. Se conservaron los movimientos de dinero y las tarifas anteriores.",
  );
} finally {
  await db().$disconnect();
}
