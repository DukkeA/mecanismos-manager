import { cleanupActivity } from "./activity-cleanup";
import { managementReport } from "@/server/management-report";
import { recordsPage } from "@/server/records-query";
import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { db } from "@/server/db";
import {
  createPurchase,
  receivePurchase,
  returnPurchase,
  paySupplier,
} from "@/server/purchase-service";
import {
  reserveStock,
  finishReservation,
  transferStock,
  previewCount,
  applyCount,
} from "@/server/stock-workflows";
import {
  closeCash,
  reopenCash,
  saveRecurring,
  generateMonth,
  confirmMonth,
} from "@/server/financial-control";
import { recordCash } from "@/server/cash-service";
import {
  recordCheck,
  handoverOrder,
  saveLaborRate,
  orderCost,
  openWarranty,
  reviewWarranty,
  changeOwner,
  registerUnit,
  finishUnit,
  sellUnit,
} from "@/server/job-service";
import {
  assignTask,
  transitionOrder,
  receiveOrder,
} from "@/server/operations-service";
import { issueSale, returnSale } from "@/server/sales-service";
import { hubPage } from "@/server/hub-query";
const admin = { id: uuid(), role: "ADMIN" as const },
  office = { id: uuid(), role: "OFFICE" as const },
  mechanic = { id: uuid(), role: "MECHANIC" as const },
  actors = [admin, office, mechanic],
  actorIds = actors.map((a) => a.id),
  customerId = uuid(),
  supplierId = uuid(),
  itemId = uuid(),
  serviceId = uuid(),
  loc = uuid(),
  dest = uuid(),
  account = uuid(),
  orderId = uuid();
const reason = "Prueba de operación con trazabilidad";
const stock = () =>
  db().stockBalance.findUniqueOrThrow({
    where: {
      itemId_locationId_condition: {
        itemId,
        locationId: loc,
        condition: "NEW",
      },
    },
  });
beforeAll(async () => {
  await db().member.createMany({
    data: actors.map((a) => ({
      ...a,
      name: "Prueba control",
      email: `${a.id}@example.invalid`,
    })),
  });
  await db().customer.create({
    data: { id: customerId, name: "Cliente de prueba de control" },
  });
  await db().supplier.create({
    data: {
      id: supplierId,
      name: "Proveedor de prueba de control",
      phone: "0000000",
    },
  });
  await db().location.createMany({
    data: [
      { id: loc, code: uuid().slice(0, 20), name: "Origen de prueba" },
      { id: dest, code: uuid().slice(0, 20), name: "Destino de prueba" },
    ],
  });
  await db().catalogItem.createMany({
    data: [
      {
        id: itemId,
        code: uuid(),
        name: "Repuesto de prueba de control",
        kind: "PART",
      },
      {
        id: serviceId,
        code: uuid(),
        name: "Servicio de prueba de control",
        kind: "SERVICE",
      },
    ],
  });
  await db().moneyAccount.create({
    data: {
      id: account,
      name: uuid(),
      balance: "1000000",
      openingBalance: "1000000",
    },
  });
  await db().workOrder.create({
    data: {
      id: orderId,
      purpose: "CUSTOMER_REPAIR",
      title: "Trabajo de prueba",
      reportedProblem: reason,
      customerId,
      locationId: loc,
    },
  });
});
afterAll(async () => {
  const orders = (
      await db().workOrder.findMany({
        where: { customerId },
        select: { id: true },
      })
    ).map((o) => o.id),
    sales = (
      await db().sale.findMany({ where: { customerId }, select: { id: true } })
    ).map((s) => s.id);
  const purchaseIds = (
    await db().purchase.findMany({
      where: { actorId: { in: actorIds } },
      select: { id: true },
    })
  ).map((p) => p.id);
  await db().serializedUnit.deleteMany({
    where: { actorId: { in: actorIds } },
  });
  await db().saleReturnLine.deleteMany({
    where: { document: { saleId: { in: sales } } },
  });
  await db().saleReturn.deleteMany({ where: { saleId: { in: sales } } });
  await db().warrantyCase.deleteMany({ where: { actorId: { in: actorIds } } });
  await db().orderCheck.deleteMany({ where: { actorId: { in: actorIds } } });
  await db().orderHandover.deleteMany({ where: { actorId: { in: actorIds } } });
  await db().stockReservation.deleteMany({
    where: { actorId: { in: actorIds } },
  });
  await db().stockTransfer.deleteMany({ where: { actorId: { in: actorIds } } });
  await db().inventoryCount.deleteMany({
    where: { actorId: { in: actorIds } },
  });
  await db().laborRate.deleteMany({ where: { actorId: { in: actorIds } } });
  await db().cashClosure.deleteMany({ where: { actorId: { in: actorIds } } });
  await db().monthCoverage.deleteMany({ where: { actorId: { in: actorIds } } });
  await db().obligation.deleteMany({
    where: {
      recurringId: {
        in: (
          await db().recurringExpense.findMany({
            where: { actorId: { in: actorIds } },
            select: { id: true },
          })
        ).map((r) => r.id),
      },
    },
  });
  await db().recurringExpense.deleteMany({
    where: { actorId: { in: actorIds } },
  });
  await db().supplierPayment.deleteMany({
    where: { purchaseId: { in: purchaseIds } },
  });
  await db().purchaseReceipt.deleteMany({
    where: { actorId: { in: actorIds } },
  });
  await db().purchaseLine.deleteMany({
    where: { purchaseId: { in: purchaseIds } },
  });
  await db().purchase.deleteMany({ where: { id: { in: purchaseIds } } });
  await db().saleLine.deleteMany({ where: { saleId: { in: sales } } });
  await db().sale.deleteMany({ where: { id: { in: sales } } });
  await db().timeEntry.deleteMany({ where: { memberId: { in: actorIds } } });
  await db().taskAssignment.deleteMany({
    where: { memberId: { in: actorIds } },
  });
  await db().task.deleteMany({ where: { orderId: { in: orders } } });
  await db().orderAsset.deleteMany({ where: { orderId: { in: orders } } });
  await db().assetOwnership.deleteMany({
    where: { actorId: { in: actorIds } },
  });
  await db().asset.deleteMany({ where: { customerId } });
  await db().stockMovement.deleteMany({ where: { actorId: { in: actorIds } } });
  await db().stockBalance.deleteMany({
    where: { locationId: { in: [loc, dest] } },
  });
  await db().workOrder.deleteMany({ where: { id: { in: orders } } });
  await db().cashEntry.deleteMany({ where: { actorId: { in: actorIds } } });
  await db().auditEvent.deleteMany({ where: { actorId: { in: actorIds } } });
  await db().commandReceipt.deleteMany({
    where: { actorId: { in: actorIds } },
  });
  await db().catalogItem.deleteMany({
    where: { id: { in: [itemId, serviceId] } },
  });
  await db().supplier.delete({ where: { id: supplierId } });
  await db().customer.delete({ where: { id: customerId } });
  await db().location.deleteMany({ where: { id: { in: [loc, dest] } } });
  await db().moneyAccount.delete({ where: { id: account } });
  await cleanupActivity(
    (await db().member.findMany({ where: { id: { in: actorIds } } })).map(
      (m) => m.id,
    ),
  );
  await db().member.deleteMany({ where: { id: { in: actorIds } } });
  await db().$disconnect();
});
it("receives partial purchases once, limits payments to receipts, and handles supplier credits", async () => {
  const p = await createPurchase(office, {
    requestId: uuid(),
    supplierId,
    locationId: loc,
    orderedOn: "2026-09-11",
    dueOn: "2026-09-30",
    note: reason,
    lines: [{ itemId, condition: "NEW", quantity: "10", unitCost: "10000" }],
  });
  const line = await db().purchaseLine.findFirstOrThrow({
    where: { purchaseId: p.id },
  });
  const receiptInput = {
    requestId: uuid(),
    lineId: line.id,
    quantity: "4",
    occurredOn: "2026-09-11",
    reason,
  };
  const receipt = await receivePurchase(office, receiptInput);
  expect(await receivePurchase(office, receiptInput)).toEqual(receipt);
  expect((await stock()).quantity.toString()).toBe("4");
  const purchaseNumber = (
    await db().purchase.findUniqueOrThrow({ where: { id: p.id } })
  ).number;
  const pendingPurchases = () =>
    hubPage(
      office,
      new URLSearchParams({
        resource: "purchases",
        q: `Compra ${purchaseNumber}`,
        outstanding: "true",
      }),
    );
  expect(
    (await pendingPurchases()).rows.some(
      (row) => row.id === p.id && Number(row.amount) === 40000,
    ),
  ).toBe(true);
  await expect(
    paySupplier(office, {
      requestId: uuid(),
      purchaseId: p.id,
      accountId: account,
      amount: "50000",
      occurredOn: "2026-09-11",
      reason,
    }),
  ).rejects.toThrow("supera");
  await paySupplier(office, {
    requestId: uuid(),
    purchaseId: p.id,
    accountId: account,
    amount: "40000",
    occurredOn: "2026-09-11",
    reason,
  });
  expect((await pendingPurchases()).rows.some((row) => row.id === p.id)).toBe(
    false,
  );
  await returnPurchase(admin, {
    requestId: uuid(),
    receiptId: receipt.id,
    quantity: "1",
    occurredOn: "2026-09-11",
    reason,
  });
  await paySupplier(admin, {
    requestId: uuid(),
    purchaseId: p.id,
    accountId: account,
    amount: "10000",
    refund: true,
    occurredOn: "2026-09-11",
    reason,
  });
  expect((await stock()).quantity.toString()).toBe("3");
  expect((await stock()).materialCost.toString()).toBe("30000");
  await receivePurchase(office, {
    requestId: uuid(),
    lineId: line.id,
    quantity: "6",
    occurredOn: "2026-09-11",
    reason,
  });
  await expect(
    receivePurchase(office, {
      requestId: uuid(),
      lineId: line.id,
      quantity: "1",
      occurredOn: "2026-09-11",
      reason,
    }),
  ).rejects.toThrow("supera");
});
it("reserves available stock, transfers original value, and consumes a reservation once", async () => {
  const r = await reserveStock(office, {
    requestId: uuid(),
    itemId,
    locationId: loc,
    condition: "NEW",
    orderId,
    quantity: "7",
  });
  await expect(
    transferStock(office, {
      requestId: uuid(),
      itemId,
      sourceId: loc,
      destinationId: dest,
      condition: "NEW",
      quantity: "3",
      reason,
    }),
  ).rejects.toThrow("existencias");
  await transferStock(office, {
    requestId: uuid(),
    itemId,
    sourceId: loc,
    destinationId: dest,
    condition: "NEW",
    quantity: "2",
    reason,
  });
  expect((await stock()).quantity.toString()).toBe("7");
  const payload = {
    requestId: uuid(),
    reservationId: r.id,
    action: "CONSUME",
    reason,
  };
  await finishReservation(office, payload);
  await finishReservation(office, payload);
  expect((await stock()).quantity.toString()).toBe("0");
  expect((await stock()).reserved.toString()).toBe("0");
});
it("previews counts, rejects duplicate references and later movements, and records valuation", async () => {
  const item = await db().catalogItem.findUniqueOrThrow({
    where: { id: itemId },
  });
  const row = {
    code: item.code,
    name: item.name,
    reference: "",
    condition: "NEW",
    quantity: "5",
    unitCost: "12000",
  };
  await expect(
    previewCount(admin, {
      requestId: uuid(),
      locationId: loc,
      note: reason,
      rows: [row, row],
    }),
  ).rejects.toThrow("repetidos");
  const preview = await previewCount(admin, {
    requestId: uuid(),
    locationId: loc,
    note: reason,
    rows: [row],
  });
  await applyCount(admin, { requestId: uuid(), countId: preview.id });
  expect((await stock()).materialCost.toString()).toBe("60000");
  const old = await previewCount(admin, {
    requestId: uuid(),
    locationId: loc,
    note: reason,
    rows: [row],
  });
  await transferStock(office, {
    requestId: uuid(),
    itemId,
    sourceId: loc,
    destinationId: dest,
    condition: "NEW",
    quantity: "1",
    reason,
  });
  await expect(
    applyCount(admin, { requestId: uuid(), countId: old.id }),
  ).rejects.toThrow("movimientos");
  const valuation = await previewCount(admin, {
    requestId: uuid(),
    locationId: loc,
    note: reason,
    rows: [{ ...row, quantity: "4", unitCost: "15000" }],
  });
  await applyCount(admin, { requestId: uuid(), countId: valuation.id });
  expect((await stock()).materialCost.toString()).toBe("60000");
});
it("closes cash with a difference and rejects backdated writes until reopened", async () => {
  const c = await closeCash(office, {
    requestId: uuid(),
    accountId: account,
    throughOn: "2026-09-10",
    counted: "999000",
    note: reason,
  });
  const closure = await db().cashClosure.findUniqueOrThrow({
    where: { id: c.id },
  });
  expect(closure.difference.toString()).toBe("-1000");
  const cash = {
    requestId: uuid(),
    accountId: account,
    kind: "CUSTOMER_ADVANCE",
    amount: "5000",
    counterparty: "Cliente de prueba",
    reference: "",
    note: reason,
    occurredOn: "2026-09-10",
  };
  await expect(recordCash(office, cash)).rejects.toThrow("cierre");
  await expect(
    reopenCash(office, { requestId: uuid(), closureId: c.id, reason }),
  ).rejects.toThrow("permiso");
  await reopenCash(admin, { requestId: uuid(), closureId: c.id, reason });
  await recordCash(office, cash);
});
it("generates monthly obligations without duplicates and respects payroll visibility", async () => {
  const t = await saveRecurring(admin, {
    requestId: uuid(),
    title: "Prestaciones de prueba",
    category: "PAYROLL",
    amount: "100000",
    dueDay: 31,
  });
  await generateMonth(admin, {
    requestId: uuid(),
    period: "2098-02",
    recurringIds: [t.id],
  });
  await generateMonth(admin, {
    requestId: uuid(),
    period: "2098-02",
    recurringIds: [t.id],
  });
  const o = await db().obligation.findMany({ where: { recurringId: t.id } });
  expect(o).toHaveLength(1);
  expect(o[0].dueOn.toISOString().slice(0, 10)).toBe("2098-02-28");
  expect(
    (
      await hubPage(
        office,
        new URLSearchParams({
          resource: "recurring",
          q: "Prestaciones de prueba",
        }),
      )
    ).rows,
  ).toHaveLength(1);
  await confirmMonth(admin, {
    requestId: uuid(),
    period: "2098-02",
    note: reason,
  });
  expect(
    (
      await db().monthCoverage.findUniqueOrThrow({
        where: { period: "2098-02" },
      })
    ).confirmed,
  ).toBe(true);
});
it("requires passing technical checks and delivery acceptance to close a repair", async () => {
  await db().workOrder.update({
    where: { id: orderId },
    data: { status: "QUALITY_REVIEW" },
  });
  const transition = (status: string, version = 0) => ({
    requestId: uuid(),
    orderId,
    status,
    version,
    reason,
  });
  await expect(transitionOrder(office, transition("READY"))).rejects.toThrow(
    "pruebas",
  );
  await recordCheck(office, {
    requestId: uuid(),
    orderId,
    name: "Prueba de caudal",
    result: "FAIL",
    readings: "Caudal bajo: 30 ml en lugar de 50 ml",
  });
  await expect(transitionOrder(office, transition("READY"))).rejects.toThrow(
    "pruebas",
  );
  await recordCheck(office, {
    requestId: uuid(),
    orderId,
    name: "Prueba de caudal",
    result: "PASS",
    readings: "Caudal corregido a 50 ml, tolerancia de 2 ml",
  });
  await transitionOrder(office, transition("READY"));
  await expect(
    transitionOrder(office, transition("CLOSED", 1)),
  ).rejects.toThrow("constancia");
  await handoverOrder(office, {
    requestId: uuid(),
    orderId,
    kind: "DELIVERY",
    condition: "Sin fugas y con caudal ajustado",
    inventory: "Bomba completa y empaques reemplazados",
    acceptedBy: "Carlos de prueba",
    note: reason,
  });
  await transitionOrder(office, transition("CLOSED", 1));
});
it("costs labor by effective date, flags missing rates, and links warranty to the original sale", async () => {
  const task = await db().task.create({
    data: { orderId, title: "Calibración de prueba" },
  });
  await db().timeEntry.create({
    data: {
      taskId: task.id,
      memberId: mechanic.id,
      minutes: 90,
      workedOn: new Date("2026-09-11"),
      note: reason,
      idempotencyKey: uuid(),
    },
  });
  expect(
    (await db().$transaction((tx) => orderCost(tx, orderId))).missingMinutes,
  ).toBe(90);
  await saveLaborRate(admin, {
    requestId: uuid(),
    memberId: mechanic.id,
    effectiveOn: "2026-09-01",
    hourlyCost: "20000",
    note: reason,
  });
  expect(
    (await db().$transaction((tx) => orderCost(tx, orderId))).labor.toString(),
  ).toBe("30000");
  const sale = await issueSale(office, {
    requestId: uuid(),
    customerId,
    orderId,
    locationId: loc,
    title: "Trabajo original",
    terms: "Prueba incluida",
    issuedOn: "2026-09-11",
    dueOn: "2026-09-30",
    lines: [
      {
        itemId: serviceId,
        description: "Calibración",
        quantity: "1",
        unitPrice: "300000",
        condition: "NEW",
        discount: "0",
      },
    ],
  });
  const w = await openWarranty(office, {
    requestId: uuid(),
    saleId: sale.id,
    locationId: loc,
    symptom: "Caudal inestable después de la entrega",
  });
  await reviewWarranty(office, {
    requestId: uuid(),
    warrantyId: w.id,
    diagnosis: "Se encontró un empaque defectuoso",
    decision: "ACCEPTED",
    cause: "PART",
  });
  expect(
    (await db().warrantyCase.findUniqueOrThrow({ where: { id: w.id } }))
      .originalOrderId,
  ).toBe(orderId);
});
it("normalizes plates, reuses assets, and prevents changing ownership during open work", async () => {
  const input = {
    requestId: uuid(),
    customerId,
    locationId: loc,
    title: "Vehículo de prueba",
    reference: "abc-123",
    kind: "VEHICLE",
    problem: reason,
  };
  const first = await receiveOrder(office, input),
    second = await receiveOrder(office, {
      ...input,
      requestId: uuid(),
      reference: "ABC 123",
    });
  const a = await db().orderAsset.findFirstOrThrow({
      where: { orderId: first.id },
    }),
    b = await db().orderAsset.findFirstOrThrow({
      where: { orderId: second.id },
    });
  expect(a.assetId).toBe(b.assetId);
  await expect(
    hubPage(mechanic, new URLSearchParams({ resource: "margins" })),
  ).rejects.toThrow("permiso");
});

it("tracks a rebuilt unit through sale and full return without fractional or duplicate sale", async () => {
  const own = await db().workOrder.create({
    data: {
      customerId,
      purpose: "OWN_REBUILD",
      title: "Unidad de prueba",
      reportedProblem: reason,
      locationId: loc,
      status: "CLOSED",
    },
  });
  const unit = await registerUnit(office, {
    requestId: uuid(),
    itemId,
    locationId: loc,
    code: uuid(),
    serial: "SERIE-PRUEBA",
    orderId: own.id,
    coreCost: "150000",
  });
  await finishUnit(admin, { requestId: uuid(), unitId: unit.id });
  const input = {
    requestId: uuid(),
    unitId: unit.id,
    customerId,
    price: "400000",
    issuedOn: "2026-09-11",
    dueOn: "2026-09-30",
    terms: reason,
  };
  const sale = await sellUnit(office, input);
  expect(await sellUnit(office, input)).toEqual(sale);
  await expect(
    sellUnit(office, { ...input, requestId: uuid() }),
  ).rejects.toThrow("disponible");
  const line = await db().saleLine.findFirstOrThrow({
    where: { saleId: sale.id },
  });
  expect(line.materialCost?.toString()).toBe("150000");
  const ret = {
    requestId: uuid(),
    saleId: sale.id,
    saleLineId: line.id,
    quantity: "0.5",
    reason,
    occurredOn: "2026-09-11",
  };
  await expect(returnSale(admin, ret)).rejects.toThrow("completa");
  await returnSale(admin, { ...ret, requestId: uuid(), quantity: "1" });
  expect(
    (await db().serializedUnit.findUniqueOrThrow({ where: { id: unit.id } }))
      .status,
  ).toBe("AVAILABLE");
});

it("paginates database records and computes reports independently of page selection", async () => {
  const first = await recordsPage(
    admin,
    new URLSearchParams({ table: "orders", size: "10", orderBy: "number" }),
  );
  const second = await recordsPage(
    admin,
    new URLSearchParams({
      table: "orders",
      size: "10",
      page: "2",
      orderBy: "number",
    }),
  );
  expect(first.rows.length).toBeLessThanOrEqual(10);
  expect(second.total).toBe(first.total);
  expect(
    first.rows
      .map((r) => (r as { id: string }).id)
      .some((id) => second.rows.some((r) => (r as { id: string }).id === id)),
  ).toBe(false);
  await expect(
    recordsPage(mechanic, new URLSearchParams({ table: "cashEntries" })),
  ).rejects.toThrow();
  const report = await managementReport(
    admin,
    new URLSearchParams({ from: "2026-09-01", to: "2026-09-30" }),
  );
  const groups = report.groups as {
    type: string;
    sales: number;
    affected: number;
  }[];
  expect(groups.length).toBeGreaterThan(0);
  expect(groups.every((g) => g.affected <= g.sales)).toBe(true);
  await expect(managementReport(office, new URLSearchParams())).rejects.toThrow(
    "permiso",
  );
});

it("stores a task time estimate and rejects invalid planned minutes", async () => {
  const own = await db().workOrder.create({
    data: {
      customerId,
      purpose: "CUSTOMER_REPAIR",
      title: "Trabajo con estimación",
      reportedProblem: reason,
      locationId: loc,
    },
  });
  const task = await assignTask(office, {
    requestId: uuid(),
    orderId: own.id,
    title: "Prueba de retorno",
    memberIds: [mechanic.id],
    plannedMinutes: 90,
  });
  expect(
    (await db().task.findUniqueOrThrow({ where: { id: task.id } }))
      .plannedMinutes,
  ).toBe(90);
  await expect(
    assignTask(office, {
      requestId: uuid(),
      orderId: own.id,
      title: "Prueba de retorno",
      memberIds: [mechanic.id],
      plannedMinutes: 0,
    }),
  ).rejects.toThrow();
});
