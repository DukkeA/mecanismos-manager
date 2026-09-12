import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { db } from "@/server/db";
import { saveQuote, decideQuote } from "@/server/quote-service";
import { issueSale, returnSale, voidSale } from "@/server/sales-service";
import {
  receivePayment,
  applyPayment,
  refundPayment,
} from "@/server/payment-service";
import { reverseCash, recordCash } from "@/server/cash-service";
import { productResults } from "@/server/product-results";
import { commercialPage } from "@/server/commercial-query";
const admin = { id: uuid(), role: "ADMIN" as const },
  office = { id: uuid(), role: "OFFICE" as const },
  mechanic = { id: uuid(), role: "MECHANIC" as const },
  actors = [admin, office, mechanic];
const customerId = uuid(),
  locationId = uuid(),
  itemId = uuid(),
  serviceId = uuid(),
  accountId = uuid();
const base = () => ({
  requestId: uuid(),
  customerId,
  locationId,
  title: "Reparación de bomba diésel",
  terms: "Prueba en banco incluida",
  issuedOn: "2026-09-11",
  dueOn: "2026-09-30",
  lines: [
    {
      itemId: serviceId,
      description: "Reparación y calibración",
      quantity: "1",
      unitPrice: "1000000",
      discount: "0",
      condition: "NEW",
    },
  ],
});
const page = (resource: string) =>
  commercialPage(admin, new URLSearchParams({ resource, customerId }));
beforeAll(async () => {
  await db().member.createMany({
    data: actors.map((a) => ({
      ...a,
      name: "Prueba comercio",
      email: `${a.id}@example.invalid`,
    })),
  });
  await db().customer.create({
    data: { id: customerId, name: `Prueba comercio ${customerId}` },
  });
  await db().location.create({
    data: {
      id: locationId,
      code: uuid().slice(0, 20),
      name: "Almacén de prueba",
    },
  });
  await db().catalogItem.createMany({
    data: [
      { id: itemId, code: uuid(), name: "Tobera de prueba", kind: "PART" },
      {
        id: serviceId,
        code: uuid(),
        name: "Calibración de prueba",
        kind: "SERVICE",
      },
    ],
  });
  await db().stockBalance.create({
    data: {
      itemId,
      locationId,
      condition: "NEW",
      quantity: "10",
      materialCost: "333333.33",
    },
  });
  await db().moneyAccount.create({
    data: { id: accountId, name: uuid(), openingBalance: "0", balance: "0" },
  });
});
afterAll(async () => {
  const ids = actors.map((a) => a.id),
    saleIds = (
      await db().sale.findMany({ where: { customerId }, select: { id: true } })
    ).map((s) => s.id);
  await db().paymentAllocation.deleteMany({
    where: { saleId: { in: saleIds } },
  });
  await db().saleReturnLine.deleteMany({
    where: { document: { saleId: { in: saleIds } } },
  });
  await db().saleReturn.deleteMany({ where: { saleId: { in: saleIds } } });
  await db().saleLine.deleteMany({ where: { saleId: { in: saleIds } } });
  await db().sale.deleteMany({ where: { customerId } });
  await db().quoteLine.deleteMany({ where: { quote: { customerId } } });
  await db().quote.deleteMany({ where: { customerId } });
  await db().customerPayment.deleteMany({ where: { customerId } });
  await db().cashEntry.deleteMany({ where: { actorId: { in: ids } } });
  await db().stockMovement.deleteMany({ where: { actorId: { in: ids } } });
  await db().stockBalance.deleteMany({ where: { locationId } });
  await db().auditEvent.deleteMany({ where: { actorId: { in: ids } } });
  await db().commandReceipt.deleteMany({ where: { actorId: { in: ids } } });
  await db().catalogItem.deleteMany({
    where: { id: { in: [itemId, serviceId] } },
  });
  await db().location.delete({ where: { id: locationId } });
  await db().moneyAccount.delete({ where: { id: accountId } });
  await db().customer.delete({ where: { id: customerId } });
  await db().member.deleteMany({ where: { id: { in: ids } } });
  await db().$disconnect();
});
it("retains revisions and uses approved prices despite a changed catalog or submitted price", async () => {
  const first = await saveQuote(office, {
    ...base(),
    validUntil: "2026-09-30",
  });
  const second = await saveQuote(office, {
    ...base(),
    previousId: first.id,
    validUntil: "2026-09-30",
    title: "Revisión de alcance aprobada",
  });
  await expect(
    decideQuote(office, {
      requestId: uuid(),
      quoteId: first.id,
      decision: "APPROVED",
      approvedBy: "María Pérez",
      note: "Confirmado por teléfono",
    }),
  ).rejects.toThrow("última");
  await decideQuote(office, {
    requestId: uuid(),
    quoteId: second.id,
    decision: "APPROVED",
    approvedBy: "María Pérez",
    note: "Confirmado por teléfono",
  });
  const sale = await issueSale(office, {
    ...base(),
    quoteId: second.id,
    lines: [{ ...base().lines[0], unitPrice: "1" }],
  });
  expect(
    (
      await db().sale.findUniqueOrThrow({ where: { id: sale.id } })
    ).total.toString(),
  ).toBe("1000000");
  expect(await db().quote.count({ where: { customerId } })).toBe(2);
  expect(await db().stockMovement.count({ where: { itemId: serviceId } })).toBe(
    0,
  );
});
it("applies 300k advance plus 200k payment and reversal without duplicate money", async () => {
  const sale = await issueSale(office, base());
  const advance = await receivePayment(office, {
    requestId: uuid(),
    customerId,
    accountId,
    amount: "300000",
    occurredOn: "2026-09-11",
    note: "Anticipo por calibración",
  });
  const apply = {
    requestId: uuid(),
    paymentId: advance.id,
    saleId: sale.id,
    amount: "300000",
    note: "Aplicar anticipo recibido",
  };
  const attempts = await Promise.allSettled([
    applyPayment(office, apply),
    applyPayment(office, apply),
  ]);
  expect(attempts.every((a) => a.status === "fulfilled")).toBe(true);
  const payment = await receivePayment(office, {
    requestId: uuid(),
    customerId,
    accountId,
    saleId: sale.id,
    amount: "200000",
    occurredOn: "2026-09-11",
    note: "Abono en oficina",
  });
  expect(
    (await page("sales")).rows.find((r) => r.id === sale.id)?.balance,
  ).toBe("500000.00");
  const receipt = await db().customerPayment.findUniqueOrThrow({
    where: { id: payment.id },
  });
  await reverseCash(admin, {
    requestId: uuid(),
    entryId: receipt.entryId,
    reason: "Abono registrado por error",
    occurredOn: "2026-09-11",
  });
  const detail = (await page("sales")).rows.find((r) => r.id === sale.id)!;
  expect(detail.balance).toBe("700000.00");
  expect(detail.paymentHistory).toHaveLength(3);
  expect(
    detail.paymentHistory?.reduce((sum, p) => sum + Number(p.amount), 0),
  ).toBe(300000);
  expect(detail.paymentHistory?.filter((p) => p.reversal)).toHaveLength(1);
  expect(
    detail.paymentHistory?.every((p) => p.account && p.receivedOn && p.date),
  ).toBe(true);
  expect(
    (
      await db().moneyAccount.findUniqueOrThrow({ where: { id: accountId } })
    ).balance.toString(),
  ).toBe("300000");
});
it("restores partial returns and void stock at original cost, leaving credit available", async () => {
  const payload = {
    ...base(),
    lines: [{ ...base().lines[0], itemId, quantity: "3", unitPrice: "100000" }],
  };
  const issued = await Promise.allSettled([
    issueSale(office, payload),
    issueSale(office, payload),
  ]);
  expect(issued.every((a) => a.status === "fulfilled")).toBe(true);
  const sale =
    issued[0].status === "fulfilled"
      ? issued[0].value
      : (() => {
          throw Error("issue failed");
        })();
  const line = await db().saleLine.findFirstOrThrow({
    where: { saleId: sale.id },
  });
  const p = await receivePayment(office, {
    requestId: uuid(),
    customerId,
    accountId,
    saleId: sale.id,
    amount: "300000",
    occurredOn: "2026-09-11",
    note: "Pago completo de toberas",
  });
  await returnSale(admin, {
    requestId: uuid(),
    saleId: sale.id,
    saleLineId: line.id,
    quantity: "1",
    occurredOn: "2026-09-11",
    reason: "Referencia no corresponde al motor",
  });
  expect(
    (await page("payments")).rows.find((r) => r.id === p.id)?.available,
  ).toBe("100000.00");
  await voidSale(admin, {
    requestId: uuid(),
    saleId: sale.id,
    reason: "Se cancela el pedido completo",
  });
  const stock = await db().stockBalance.findUniqueOrThrow({
    where: {
      itemId_locationId_condition: { itemId, locationId, condition: "NEW" },
    },
  });
  expect(stock.quantity.toString()).toBe("10");
  expect(stock.materialCost.toString()).toBe("333333.33");
  expect(
    (await page("payments")).rows.find((r) => r.id === p.id)?.available,
  ).toBe("300000.00");
  await refundPayment(admin, {
    requestId: uuid(),
    paymentId: p.id,
    accountId,
    amount: "300000",
    occurredOn: "2026-09-11",
    reason: "Devolución del pago al cliente",
  });
  expect(
    (await page("payments")).rows.find((r) => r.id === p.id)?.available,
  ).toBe("0.00");
  await expect(
    reverseCash(admin, {
      requestId: uuid(),
      entryId: (
        await db().customerPayment.findUniqueOrThrow({ where: { id: p.id } })
      ).entryId,
      reason: "Intentar reversión posterior",
      occurredOn: "2026-09-11",
    }),
  ).rejects.toThrow("devoluciones");
});
it("prevents two competing allocations from spending the same advance", async () => {
  const [s1, s2] = await Promise.all([
    issueSale(office, base()),
    issueSale(office, base()),
  ]);
  const p = await receivePayment(office, {
    requestId: uuid(),
    customerId,
    accountId,
    amount: "100000",
    occurredOn: "2026-09-11",
    note: "Anticipo para dos trabajos",
  });
  const results = await Promise.allSettled(
    [s1, s2].map((s) =>
      applyPayment(office, {
        requestId: uuid(),
        paymentId: p.id,
        saleId: s.id,
        amount: "75000",
        note: "Aplicar a este trabajo",
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    (await page("payments")).rows.find((r) => r.id === p.id)?.available,
  ).toBe("25000.00");
});
it("enforces roles and stable summary across pages", async () => {
  await expect(issueSale(mechanic, base())).rejects.toThrow("permiso");
  await expect(commercialPage(mechanic, new URLSearchParams())).rejects.toThrow(
    "permiso",
  );
  const sale = await issueSale(office, base());
  await expect(
    voidSale(office, {
      requestId: uuid(),
      saleId: sale.id,
      reason: "No autorizado",
    }),
  ).rejects.toThrow("permiso");
  const a = await commercialPage(
      admin,
      new URLSearchParams({ resource: "sales", page: "1" }),
    ),
    b = await commercialPage(
      admin,
      new URLSearchParams({ resource: "sales", page: "2" }),
    );
  expect(a.summary).toEqual(b.summary);
});

it("links a historical cash receipt without posting money twice", async () => {
  const cash = await recordCash(office, {
    requestId: uuid(),
    accountId,
    kind: "CUSTOMER_ADVANCE",
    amount: "12500",
    counterparty: "Cliente de prueba",
    occurredOn: "2026-09-11",
    note: "Anticipo anterior a cartera",
    reference: "ANT-PRUEBA",
  });
  const before = await db().moneyAccount.findUniqueOrThrow({
    where: { id: accountId },
  });
  const input = {
    requestId: uuid(),
    customerId,
    existingEntryId: cash.id,
    amount: "12500",
    occurredOn: "2026-09-11",
    note: "Identificación de cliente del anticipo",
  };
  const receipt = await receivePayment(office, input);
  expect(await receivePayment(office, input)).toEqual(receipt);
  expect(
    (
      await db().moneyAccount.findUniqueOrThrow({ where: { id: accountId } })
    ).balance.toString(),
  ).toBe(before.balance.toString());
  await expect(
    receivePayment(office, { ...input, requestId: uuid() }),
  ).rejects.toThrow("vinculado");
});

it("ranks net item revenue after returns, keeps service costs unknown and enforces report access", async () => {
  const sale = await issueSale(office, {
    ...base(),
    lines: [{ ...base().lines[0], itemId, quantity: "2", unitPrice: "100000" }],
  });
  const line = await db().saleLine.findFirstOrThrow({
    where: { saleId: sale.id },
  });
  await returnSale(admin, {
    requestId: uuid(),
    saleId: sale.id,
    saleLineId: line.id,
    quantity: "1",
    occurredOn: "2026-09-11",
    reason: "Devolución de una unidad de prueba",
  });
  const report = await productResults(
    admin,
    new URLSearchParams({
      q: "Tobera de prueba",
      from: "2026-09-11",
      to: "2026-09-11",
      orderBy: "margin",
    }),
  );
  const row = report.rows.find((r) => r.id === itemId)!;
  expect(Number(row.revenue)).toBe(100000);
  expect(Number(row.quantity)).toBe(1);
  expect(Number(row.cost)).toBe(
    Number((Number(line.materialCost) / 2).toFixed(2)),
  );
  expect(Number(row.margin) + Number(row.cost)).toBe(100000);
  const services = await productResults(
    admin,
    new URLSearchParams({ category: "SERVICE", q: "Calibración de prueba" }),
  );
  expect(services.rows.find((r) => r.id === serviceId)?.margin).toBeNull();
  await expect(productResults(office, new URLSearchParams())).rejects.toThrow(
    "permiso",
  );
  await expect(
    productResults(admin, new URLSearchParams({ orderBy: "revenue;DROP" })),
  ).rejects.toThrow();
});
