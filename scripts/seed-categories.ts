import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { catalogLabelKey } from "../src/domain/catalog-label";
import { db } from "../src/server/db";
import { once } from "../src/server/commands";
import { issueSale } from "../src/server/sales-service";
import { postStock } from "../src/server/commercial-ledger";
if (!process.env.DATABASE_URL?.includes("127.0.0.1:56322/"))
  throw Error("Solo se permite la base local de pruebas.");
const id = (key: string) => {
  const h = createHash("sha256")
    .update(`category-fixtures-v1:${key}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
try {
  const categories = await db().businessCategory.findMany(),
    category = (name: string) =>
      categories.find((c) => c.nameKey === catalogLabelKey(name))!.id;
  const pumps = category("Bombas de inyección"),
    injectors = category("Inyectores"),
    engines = category("Motores diésel"),
    transmissions = category("Transmisiones automáticas"),
    other = category("Otros repuestos y servicios");
  const codes: Record<string, string> = {
    "BOM-EMP-01": pumps,
    "BOM-REP-01": pumps,
    "BOM-VAL-01": pumps,
    "INY-AR-01": injectors,
    "INY-RET-01": injectors,
    "INY-TOB-01": injectors,
    "MOT-ACE-01": engines,
    "MOT-ANI-01": engines,
    "MOT-COJ-01": engines,
    "MOT-EMP-01": engines,
    "MOT-RET-01": engines,
    "UP-RECONSTRUIDA": engines,
    "TRA-ATF-01": transmissions,
    "TRA-DIS-01": transmissions,
    "TRA-EMP-01": transmissions,
    "TRA-FIL-01": transmissions,
    "TRA-SOL-01": transmissions,
    "COM-FIL-01": other,
    "LIM-DES-01": other,
    "SRV-1": other,
    "SRV-2": injectors,
    "SRV-3": pumps,
    "SRV-4": transmissions,
    "SRV-5": engines,
  };
  for (const [code, businessCategoryId] of Object.entries(codes))
    await db().catalogItem.updateMany({
      where: { code, businessCategoryId: null },
      data: { businessCategoryId },
    });
  // Exact fixture titles only. Never classify arbitrary customer data using keyword guesses.
  const orders: Record<string, string> = {
    "Chevrolet NHR · inyectores": injectors,
    "Transmisión automática · Mazda BT-50": transmissions,
    "Isuzu NPR · bomba de inyección": pumps,
    "Bomba de inyección · banco de pruebas": pumps,
    "Toyota Hilux · sellos de inyectores": injectors,
    "Motor diésel · reconstrucción": engines,
    "Ford Ranger · transmisión": transmissions,
    "Juego de inyectores · cuatro unidades": injectors,
    "Chevrolet NPR · motor": engines,
    "Kia K2700 · bomba": pumps,
    "Cuerpo de válvulas · transmisión": transmissions,
    "Nissan Frontier · inyección": other,
    "Garantía · Reparación y calibración de bomba de inyección": pumps,
    "Prueba local · Chevrolet NPR": transmissions,
  };
  for (const [title, businessCategoryId] of Object.entries(orders))
    await db().workOrder.updateMany({
      where: { title, businessCategoryId: null },
      data: { businessCategoryId },
    });
  const suppliers: Record<string, string[]> = {
    "Diésel Repuestos del Altiplano": [pumps, injectors],
    "Distribuidora Hidráulica del Norte": [pumps, injectors, transmissions],
    "Importadora Transmisiones Central": [transmissions],
    "Partes para Motores La Sabana": [engines],
    "Rectificadora Los Cedros": [engines],
    "Suministros Industriales El Roble": [other],
  };
  const actor = await db().member.findFirstOrThrow({
    where: { name: "Claudia Rojas", role: "ADMIN" },
  });
  await once(
    actor,
    id("supplier-categories"),
    "CATEGORY_FIXTURES",
    {},
    async (tx) => {
      for (const [name, ids] of Object.entries(suppliers)) {
        const supplier = await tx.supplier.findFirst({ where: { name } });
        if (supplier)
          await tx.supplierCategory.createMany({
            data: ids.map((categoryId) => ({
              supplierId: supplier.id,
              categoryId,
            })),
            skipDuplicates: true,
          });
      }
      return { done: true };
    },
  );
  await once(
    actor,
    id("supplier-offer-categories"),
    "CATEGORY_OFFER_FIXTURES",
    {},
    async (tx) => {
      const offers = await tx.supplierOffer.findMany({
        where: { supplier: { name: { in: Object.keys(suppliers) } } },
        include: { item: true },
      });
      await tx.supplierCategory.createMany({
        data: offers
          .filter((o) => o.item.businessCategoryId)
          .map((o) => ({
            supplierId: o.supplierId,
            categoryId: o.item.businessCategoryId!,
          })),
        skipDuplicates: true,
      });
      return { done: true };
    },
  );
  // Backfill only known local fixture items; a second run preserves all non-null historical snapshots.
  for (const line of await db().quoteLine.findMany({
    where: {
      businessCategoryId: null,
      item: { code: { in: Object.keys(codes) } },
    },
    include: { item: true },
  }))
    await db().quoteLine.update({
      where: { id: line.id },
      data: { businessCategoryId: line.item.businessCategoryId },
    });
  for (const line of await db().saleLine.findMany({
    where: {
      businessCategoryId: null,
      item: { code: { in: Object.keys(codes) } },
    },
    include: { item: true, sale: { include: { order: true } } },
  }))
    await db().saleLine.update({
      where: { id: line.id },
      data: {
        businessCategoryId: line.sale.orderId
          ? line.sale.order?.businessCategoryId
          : line.item.businessCategoryId,
      },
    });
  const mechanic = await db().member.findFirstOrThrow({
    where: { active: true, role: "MECHANIC", name: "Luis Cárdenas" },
  });
  const location = await db()
    .location.findFirstOrThrow({
      where: { name: { contains: "Bodega", mode: "insensitive" } },
    })
    .catch(() => db().location.findFirstOrThrow());
  const customer = await db().customer.findFirstOrThrow({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });
  for (const sample of [
    {
      key: "pump",
      categoryId: pumps,
      service: "SRV-3",
      part: "BOM-EMP-01",
      title: "Bomba Denso · reparación y calibración",
      material: "185000",
      price: "1150000",
      minutes: 240,
    },
    {
      key: "injectors",
      categoryId: injectors,
      service: "SRV-2",
      part: "INY-TOB-01",
      title: "Inyectores Hilux · cambio de toberas y prueba",
      material: "310000",
      price: "980000",
      minutes: 180,
    },
    {
      key: "transmission",
      categoryId: transmissions,
      service: "SRV-4",
      part: "TRA-DIS-01",
      title: "Caja Aisin · reparación con costo superior al precio",
      material: "780000",
      price: "650000",
      minutes: 960,
    },
  ]) {
    const service = await db().catalogItem.findUniqueOrThrow({
      where: { code: sample.service },
    });
    const result = await once(
      actor,
      id(`order-${sample.key}`),
      "CATEGORY_SAMPLE_ORDER",
      sample,
      async (tx) => {
        const order = await tx.workOrder.create({
          data: {
            title: sample.title,
            purpose: "CUSTOMER_REPAIR",
            status: "IN_PROGRESS",
            customerId: customer.id,
            locationId: location.id,
            businessCategoryId: sample.categoryId,
            receivedAt: new Date("2026-09-03T13:30:00Z"),
            reportedProblem:
              "Caso de prueba para comparar materiales, mano de obra y margen por categoría.",
          },
        });
        // An isolated material reference keeps fixture valuation independent of existing balances.
        const part = await tx.catalogItem.create({
          data: {
            code: `MUESTRA-${sample.key.toUpperCase()}`,
            name:
              sample.key === "pump"
                ? "Kit de reparación para bomba Denso"
                : sample.key === "injectors"
                  ? "Juego de toberas para Hilux"
                  : "Juego de reparación para caja Aisin",
            kind: "PART",
            businessCategoryId: sample.categoryId,
            purchasePrice: sample.material,
            salePrice: new Decimal(sample.material).mul("1.35").toFixed(2),
            notes: "Referencia de prueba para comparar costos de reparaciones.",
          },
        });
        await postStock(tx, actor, {
          itemId: part.id,
          locationId: location.id,
          condition: "NEW",
          quantity: "1",
          materialAmount: sample.material,
          kind: "RECEIPT",
          reason: "Material de muestra para reparación",
        });
        await postStock(tx, actor, {
          itemId: part.id,
          locationId: location.id,
          condition: "NEW",
          quantity: "-1",
          kind: "CONSUMPTION",
          orderId: order.id,
          reason: "Material instalado en reparación de muestra",
        });
        const task = await tx.task.create({
          data: {
            title: sample.title,
            orderId: order.id,
            status: "DONE",
            assignments: { create: { memberId: mechanic.id } },
          },
        });
        await tx.timeEntry.create({
          data: {
            taskId: task.id,
            memberId: mechanic.id,
            minutes: sample.minutes,
            workedOn: new Date("2026-09-04T12:00:00Z"),
            idempotencyKey: id(`time-${sample.key}`),
            note: "Tiempo de trabajo de muestra para comparar categorías.",
          },
        });
        await tx.workOrder.update({
          where: { id: order.id },
          data: {
            status: "CLOSED",
            closedAt: new Date("2026-09-05T21:00:00Z"),
          },
        });
        return { id: order.id };
      },
    );
    await issueSale(actor, {
      requestId: id(`sale-${sample.key}`),
      customerId: customer.id,
      orderId: result.id,
      locationId: location.id,
      title: sample.title,
      terms: "Venta de muestra pendiente de pago.",
      issuedOn: "2026-09-05",
      dueOn: "2026-09-30",
      lines: [
        {
          itemId: service.id,
          description: sample.title,
          quantity: "1",
          unitPrice: sample.price,
          discount: "0",
          condition: "NEW",
        },
      ],
    });
  }
  console.log(
    "Categorías asignadas a las muestras. Tres reparaciones completas, incluida una transmisión con pérdida. Los saldos de dinero no cambian.",
  );
} finally {
  await db().$disconnect();
}
