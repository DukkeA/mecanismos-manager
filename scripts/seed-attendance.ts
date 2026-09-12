import { createHash } from "node:crypto";
import { once } from "../src/server/commands";
import { db } from "../src/server/db";
import {
  correctAttendance,
  saveStation,
} from "../src/server/attendance-service";
import { recordOvertime } from "../src/server/team-service";
import { issueSale, voidSale } from "../src/server/sales-service";
import { moveStock } from "../src/server/inventory-service";
if (!process.env.DATABASE_URL?.includes("127.0.0.1:56322/"))
  throw Error("Solo base local.");
const id = (name: string) => {
  const h = createHash("sha256")
    .update(`attendance-fixtures-v1:${name}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
try {
  const actor = await db().member.findFirstOrThrow({
      where: { email: "persona1@taller.example.invalid", active: true },
    }),
    locations = await db().location.findMany({ orderBy: { code: "asc" } });
  const members = await db().member.findMany({
    where: {
      email: { endsWith: "@taller.example.invalid" },
      active: true,
      role: { in: ["OFFICE", "MECHANIC"] },
    },
    orderBy: { name: "asc" },
    take: 4,
  });
  for (const location of locations)
    await saveStation(actor, {
      requestId: id(`station-${location.id}`),
      locationId: location.id,
      active: true,
    });
  for (const [i, m] of members.entries()) {
    for (const [j, date] of [
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
    ].entries()) {
      const input = {
        requestId: id(`shift-v2-${m.id}-${date}`),
        memberId: m.id,
        locationId: locations[i % locations.length].id,
        startedAt: `${date}T${i === 1 && j === 1 ? "08:48" : "08:30"}:00-05:00`,
        endedAt: `${date}T${i === 0 && j === 2 ? "18:00" : "17:00"}:00-05:00`,
        breakMinutes: 0,
        note:
          i === 1 && j === 1
            ? "Llegada reportada por oficina; retraso en el transporte."
            : i === 0 && j === 2
              ? "Entrega de bomba terminada al final de la tarde."
              : "Jornada registrada en planilla de oficina.",
      };
      const legacy = await db().commandReceipt.findUnique({
        where: { id: id(`shift-${m.id}-${date}`) },
      });
      if (!legacy) await correctAttendance(actor, input);
      else
        await once(
          actor,
          input.requestId,
          "ATTENDANCE_FIXTURE_V2",
          input,
          async (tx) => {
            const shiftId = (legacy.result as { id: string }).id;
            const before = await tx.attendanceShift.findUniqueOrThrow({
              where: { id: shiftId },
            });
            // Only revise untouched sample records; never overwrite a correction made in the app.
            const corrections = await tx.auditEvent.count({
              where: { entityId: shiftId, action: "ATTENDANCE_CORRECTED" },
            });
            if (
              corrections !== 1 ||
              before.note !== input.note ||
              before.breakMinutes !== 60
            )
              return { id: shiftId, skipped: true };
            const after = await tx.attendanceShift.update({
              where: { id: shiftId },
              data: {
                startedAt: new Date(input.startedAt),
                endedAt: new Date(input.endedAt),
                expectedStart: new Date(`${date}T08:30:00-05:00`),
                expectedEnd: new Date(`${date}T17:00:00-05:00`),
                breakMinutes: 0,
                graceMinutes: 0,
              },
            });
            await tx.auditEvent.create({
              data: {
                actorId: actor.id,
                entityId: shiftId,
                action: "ATTENDANCE_FIXTURE_V2",
                details: JSON.parse(
                  JSON.stringify({
                    before,
                    after,
                    reason:
                      "Horario global confirmado: 08:30–17:00, sin descuento de almuerzo.",
                  }),
                ),
              },
            });
            return { id: shiftId };
          },
        );
    }
    await recordOvertime(actor, {
      requestId: id(`bonus-${m.id}`),
      memberId: m.id,
      workedOn: "2026-09-10",
      kind: "FIXED",
      minutes: 0,
      surchargePercent: 0,
      pay: String([150000, 90000, 120000, 80000][i]),
      employerCost: "0",
      note: [
        "Bono por entrega de la bomba dentro del plazo acordado.",
        "Bono por apoyo en organización y conteo de bodega.",
        "Reconocimiento por reparación de un retorno de garantía.",
        "Bono por cierre de remisiones pendientes de la semana.",
      ][i],
    });
  }
  // New and used parts have separate sales and material costs for comparison in the report.
  const customer = await db().customer.findFirstOrThrow({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
    }),
    parts = await db().catalogItem.findMany({
      where: { kind: "PART" },
      orderBy: { code: "asc" },
      take: 3,
    });
  for (const [i, item] of parts.entries())
    for (const condition of ["NEW", "USED"] as const) {
      const requestId = id(`sale-${item.id}-${condition}`);
      if (
        (/empaques/i.test(item.name) && condition === "USED") ||
        (/recuperado/i.test(item.name) && condition === "NEW")
      ) {
        const previous = await db().commandReceipt.findUnique({
          where: { id: requestId },
        });
        if (previous)
          await voidSale(actor, {
            requestId: id(`void-${item.id}-${condition}`),
            saleId: (previous.result as { id: string }).id,
            reason:
              "Corrección de condición incompatible en los datos de prueba.",
          });
        continue;
      }
      if (await db().commandReceipt.findUnique({ where: { id: requestId } }))
        continue;
      const unitCost =
        condition === "NEW" ? 80000 + i * 20000 : 35000 + i * 10000;
      await moveStock(actor, {
        requestId: id(`receipt-${item.id}-${condition}`),
        itemId: item.id,
        locationId: locations[0].id,
        condition,
        kind: "RECEIPT",
        quantity: "3",
        unitCost: String(unitCost),
        reason: "Ingreso de repuestos para pruebas locales de ventas.",
        costKnown: true,
      });
      await issueSale(actor, {
        requestId,
        customerId: customer.id,
        locationId: locations[0].id,
        title: `Venta de ${item.name.toLowerCase()} ${condition === "NEW" ? "nuevo" : "usado"}`,
        terms: "Estado y referencia revisados con el cliente.",
        issuedOn: "2026-09-10",
        dueOn: "2026-09-25",
        lines: [
          {
            itemId: item.id,
            description: item.name,
            quantity: String(i + 1),
            unitPrice: String(Math.round(unitCost * 1.55)),
            discount: "0",
            condition,
          },
        ],
      });
    }
  console.log(
    "12 jornadas, 4 bonos fijos y ventas de repuestos nuevos/usados disponibles. Se conservaron los registros previos.",
  );
} finally {
  await db().$disconnect();
}
