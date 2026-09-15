import { db } from "../src/server/db";
import { saveOrganizer } from "../src/server/organizer-service";
import { createHash } from "node:crypto";
if (!process.env.DATABASE_URL?.includes("127.0.0.1:56322/"))
  throw new Error("Solo se permite la base local.");
const id = (key: string) => {
  const h = createHash("sha256")
    .update(`organizer-fixtures-v1:${key}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
try {
  const owner = await db().member.findFirstOrThrow({
    where: { role: "OFFICE", active: true },
    orderBy: { createdAt: "asc" },
  });
  const order = await db().workOrder.findFirst({
    where: { status: { notIn: ["CLOSED", "CANCELLED"] } },
  });
  const fixtures = [
    {
      key: "parts",
      kind: "NOTE",
      visibility: "GENERAL",
      title: "Referencias para el pedido de toberas",
      body: "Confirmar la referencia grabada antes de pedir. Guardar la cotización del proveedor junto con la orden.",
      priority: "HIGH",
      pinned: true,
    },
    {
      key: "call",
      kind: "TODO",
      visibility: "GENERAL",
      title: "Confirmar entrega de la bomba con el cliente",
      body: "Llamar después de que el banco de pruebas confirme el resultado.",
      orderId: order?.id ?? null,
      calendar: true,
      startsAt: "2026-09-18T10:00:00-05:00",
    },
    {
      key: "stock",
      kind: "EVENT",
      visibility: "GENERAL",
      title: "Revisión de existencias de inyectores",
      body: "Comparar las unidades de oficina con las de bodega.",
      startsAt: "2026-09-19T08:00:00-05:00",
      endsAt: "2026-09-19T09:00:00-05:00",
    },
    {
      key: "personal",
      kind: "NOTE",
      visibility: "PERSONAL",
      title: "Preguntas para revisar con administración",
      body: "Definir quién confirma los pedidos que llegan después del mediodía.",
    },
    {
      key: "done",
      kind: "TODO",
      visibility: "PERSONAL",
      title: "Revisar teléfonos de proveedores",
      body: "Se confirmaron los teléfonos de contacto.",
      completed: true,
    },
  ];
  for (const { key, ...entry } of fixtures) {
    if (!(await db().commandReceipt.findUnique({ where: { id: id(key) } })))
      await saveOrganizer(owner, { requestId: id(key), ...entry });
  }
  console.log(
    "Notas, pendientes y calendario de prueba preparados sin duplicados.",
  );
} finally {
  await db().$disconnect();
}
