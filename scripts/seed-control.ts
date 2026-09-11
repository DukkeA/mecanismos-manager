import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { db } from "../src/server/db";
import {
  createPurchase,
  receivePurchase,
  paySupplier,
} from "../src/server/purchase-service";
import {
  reserveStock,
  transferStock,
  previewCount,
} from "../src/server/stock-workflows";
import {
  saveLaborRate,
  openWarranty,
  reviewWarranty,
  recordCheck,
  handoverOrder,
  registerUnit,
} from "../src/server/job-service";
import {
  saveRecurring,
  generateMonth,
  closeCash,
} from "../src/server/financial-control";
import { issueSale, returnSale } from "../src/server/sales-service";
import { receivePayment } from "../src/server/payment-service";
import { assignTask } from "../src/server/operations-service";
if (!process.env.DATABASE_URL?.includes("127.0.0.1:56322/"))
  throw Error("Solo se permite la base local de pruebas");
const id = (key: string) => {
  const h = createHash("sha256")
    .update(`control-fixtures-v1:${key}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
try {
  const actor = await db().member.findFirstOrThrow({
      where: { name: "Claudia Rojas", role: "ADMIN" },
    }),
    order = await db().workOrder.findFirstOrThrow({
      where: {
        purpose: "CUSTOMER_REPAIR",
        status: { notIn: ["CLOSED", "CANCELLED"] },
      },
      orderBy: { number: "asc" },
    }),
    locations = await db().location.findMany({ orderBy: { code: "asc" } }),
    locationId = order.locationId,
    dest = locations.find((l) => l.id !== locationId)!.id,
    account = await db().moneyAccount.findUniqueOrThrow({
      where: { name: "Oficina" },
    }),
    offer = await db().supplierOffer.findFirstOrThrow({
      where: { condition: "NEW" },
      orderBy: { unitCost: "asc" },
      include: { item: true },
    }),
    mechanics = await db().member.findMany({
      where: { role: "MECHANIC", active: true },
      orderBy: { name: "asc" },
    });
  const purchase = await createPurchase(actor, {
    requestId: id("purchase"),
    supplierId: offer.supplierId,
    locationId,
    orderedOn: "2026-09-11",
    dueOn: "2026-09-30",
    reference: "PED-PRUEBA-014",
    note: "Pedido de prueba. Entregar cuatro unidades hoy y las dos restantes la próxima semana.",
    lines: [
      {
        itemId: offer.itemId,
        quantity: "6",
        unitCost: offer.unitCost.toFixed(2),
        condition: "NEW",
      },
    ],
  });
  const line = await db().purchaseLine.findFirstOrThrow({
    where: { purchaseId: purchase.id },
  });
  await receivePurchase(actor, {
    requestId: id("receipt"),
    lineId: line.id,
    quantity: "4",
    occurredOn: "2026-09-11",
    reason:
      "Recepción de prueba: cuatro unidades verificadas, empaque en buen estado.",
  });
  await paySupplier(actor, {
    requestId: id("supplier-payment"),
    purchaseId: purchase.id,
    accountId: account.id,
    amount: new Decimal(offer.unitCost.toString()).mul(2).toFixed(2),
    occurredOn: "2026-09-11",
    reason: "Abono de prueba por la mitad de lo recibido",
  });
  await reserveStock(actor, {
    requestId: id("reservation"),
    itemId: offer.itemId,
    locationId,
    condition: "NEW",
    orderId: order.id,
    quantity: "1",
  });
  await transferStock(actor, {
    requestId: id("transfer"),
    itemId: offer.itemId,
    sourceId: locationId,
    destinationId: dest,
    condition: "NEW",
    quantity: "1",
    reason: "Traslado de prueba para disponibilidad en la otra sede",
  });
  for (const [i, m] of mechanics.entries())
    await saveLaborRate(actor, {
      requestId: id(`rate-${m.id}`),
      memberId: m.id,
      effectiveOn: "2026-09-01",
      hourlyCost: String(28000 + i * 1000),
      note: "Tarifa ficticia para probar costos de mano de obra; reemplazar antes de usar registros reales.",
    });
  await recordCheck(actor, {
    requestId: id("check"),
    orderId: order.id,
    name: "Prueba de retorno de inyectores",
    result: "FAIL",
    readings:
      "Prueba de datos: inyector 3, 58 ml; los demás entre 22 y 27 ml. Repetir después del ajuste.",
  });
  await handoverOrder(actor, {
    requestId: id("reception"),
    orderId: order.id,
    kind: "RECEPTION",
    condition: "Suciedad exterior y fuga leve en la conexión de retorno.",
    inventory:
      "Conjunto completo con sus cuatro inyectores, tubería de retorno y tornillos de fijación.",
    acceptedBy: "Carlos Rincón",
    note: "Constancia de prueba; cliente autoriza desmontaje para diagnóstico.",
  });
  const originalSale = await db().sale.findFirstOrThrow({
    where: { orderId: order.id, status: "ISSUED" },
  });
  const warranty = await openWarranty(actor, {
    requestId: id("warranty"),
    saleId: originalSale.id,
    locationId,
    symptom:
      "Caso de prueba: fuga por la tapa lateral después de montar la bomba.",
  });
  await reviewWarranty(actor, {
    requestId: id("warranty-review"),
    warrantyId: warranty.id,
    diagnosis:
      "Se encontró un empaque pellizcado. Reemplazar, verificar estanqueidad y repetir prueba en banco.",
    decision: "ACCEPTED",
    cause: "WORKMANSHIP",
  });
  const caseRow = await db().warrantyCase.findUniqueOrThrow({
    where: { id: warranty.id },
  });
  await assignTask(actor, {
    requestId: id("warranty-task"),
    orderId: caseRow.repairOrderId,
    title: "Cambiar empaque y verificar estanqueidad",
    description:
      "Registrar presión, duración de la prueba y fotografías del montaje.",
    memberIds: [mechanics[0].id],
  });
  const counter = await issueSale(actor, {
    requestId: id("counter-sale"),
    customerId: order.customerId!,
    locationId,
    title: `Venta de mostrador · ${offer.item.name}`,
    terms:
      "Referencia verificada con la muestra entregada. Documento ficticio de prueba.",
    issuedOn: "2026-09-11",
    dueOn: "2026-09-11",
    lines: [
      {
        itemId: offer.itemId,
        description: offer.item.name,
        quantity: "1",
        unitPrice: new Decimal(offer.unitCost.toString()).mul(1.4).toFixed(2),
        discount: "0",
        condition: "NEW",
      },
    ],
  });
  const saleLine = await db().saleLine.findFirstOrThrow({
    where: { saleId: counter.id },
  });
  await receivePayment(actor, {
    requestId: id("counter-payment"),
    customerId: order.customerId!,
    saleId: counter.id,
    accountId: account.id,
    amount: saleLine.total.toFixed(2),
    occurredOn: "2026-09-11",
    note: "Pago completo de prueba en mostrador",
    reference: "PRUEBA-MOS-01",
  });
  await returnSale(actor, {
    requestId: id("return"),
    saleId: counter.id,
    saleLineId: saleLine.id,
    quantity: "1",
    occurredOn: "2026-09-11",
    reason:
      "Devolución de prueba: el cliente requiere otra referencia. Dinero pendiente de devolución.",
  });
  const second = await db().workOrder.findFirstOrThrow({
      where: {
        purpose: "CUSTOMER_REPAIR",
        customerId: { not: null },
        id: { not: order.id },
        sales: { none: { status: "ISSUED" } },
        status: { not: "CANCELLED" },
      },
      orderBy: { number: "asc" },
    }),
    service = await db().catalogItem.findFirstOrThrow({
      where: { kind: "SERVICE" },
    });
  if (
    !(await db().commandReceipt.findUnique({
      where: { id: id("credit-sale") },
    }))
  )
    await issueSale(actor, {
      requestId: id("credit-sale"),
      customerId: second.customerId!,
      orderId: second.id,
      locationId: second.locationId,
      title: "Reparación de transmisión a crédito",
      terms: "Datos de prueba: pago a 15 días después de la entrega.",
      issuedOn: "2026-09-11",
      dueOn: "2026-09-26",
      lines: [
        {
          itemId: service.id,
          description: "Diagnóstico y ajuste de transmisión automática",
          quantity: "1",
          unitPrice: "420000",
          discount: "0",
          condition: "NEW",
        },
      ],
    });
  const recurrentIds = [];
  for (const [key, title, category, amount, dueDay] of [
    ["rent-office", "Arriendo oficina principal", "RENT", "2200000", 5],
    ["rent-workshop", "Arriendo bodega y taller", "RENT", "3600000", 5],
    ["utilities", "Servicios públicos del taller", "UTILITIES", "850000", 18],
    [
      "payroll",
      "Salarios y prestaciones del equipo",
      "PAYROLL",
      "24000000",
      30,
    ],
  ] as const) {
    const r = await saveRecurring(actor, {
      requestId: id(key),
      title,
      category,
      amount,
      dueDay,
    });
    recurrentIds.push(r.id);
  }
  await generateMonth(actor, {
    requestId: id("month"),
    period: "2026-10",
    recurringIds: recurrentIds,
  });
  const opening = await db().moneyAccount.findUniqueOrThrow({
    where: { id: account.id },
  });
  await closeCash(actor, {
    requestId: id("closure"),
    accountId: account.id,
    throughOn: "2026-08-31",
    counted: opening.openingBalance.toFixed(2),
    note: "Cierre inicial de prueba, antes de los movimientos de septiembre.",
  });
  const own = await db().workOrder.findFirst({
    where: { purpose: "OWN_REBUILD" },
  });
  if (own) {
    const item = await db().catalogItem.upsert({
      where: { code: "UP-RECONSTRUIDA" },
      create: {
        code: "UP-RECONSTRUIDA",
        name: "Conjunto diésel reconstruido",
        kind: "PART",
        serialized: true,
        unit: "unidad",
        notes:
          "Unidad propia identificada por serie; su costo se consulta en Unidades propias.",
      },
      update: {},
    });
    const existing = await db().serializedUnit.findUnique({
      where: { code: "UP-PRUEBA-001" },
    });
    if (existing && existing.itemId !== item.id)
      await db().serializedUnit.update({
        where: { id: existing.id },
        data: { itemId: item.id },
      });
    if (!existing)
      await registerUnit(actor, {
        requestId: id("unit-catalog"),
        itemId: item.id,
        locationId: own.locationId,
        code: "UP-PRUEBA-001",
        serial: "BANCO-RECON-001",
        orderId: own.id,
        coreCost: "650000",
      });
  }
  if (!(await db().commandReceipt.findUnique({ where: { id: id("count") } }))) {
    const balance = await db().stockBalance.findUniqueOrThrow({
      where: {
        itemId_locationId_condition: {
          itemId: offer.itemId,
          locationId,
          condition: "NEW",
        },
      },
    });
    await previewCount(actor, {
      requestId: id("count"),
      locationId,
      note: "Conteo de prueba pendiente de verificación física.",
      rows: [
        {
          code: offer.item.code,
          name: offer.item.name,
          reference: offer.item.reference,
          condition: "NEW",
          quantity: balance.quantity.toString(),
          unitCost: new Decimal(balance.materialCost.toString())
            .div(balance.quantity.toString())
            .toFixed(2),
        },
      ],
    });
  }
  console.log(
    "Expedientes de prueba: compra parcial, reserva, traslado, garantía, venta devuelta, reparación a crédito, tarifas, unidad propia, conteo y gastos de octubre.",
  );
} finally {
  await db().$disconnect();
}
