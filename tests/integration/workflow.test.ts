import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { db } from "@/server/db";
import { saveCustomer, receiveOrder } from "@/server/operations-service";
import { saveQuote, decideQuote } from "@/server/quote-service";
import { issueSale } from "@/server/sales-service";
import { receivePayment } from "@/server/payment-service";
import { commercialPage } from "@/server/commercial-query";

const actor = { id: uuid(), role: "OFFICE" as const };
const locationId = uuid(),
  accountId = uuid(),
  itemId = uuid(),
  customers: string[] = [];
const today = "2026-09-11";
async function customer() {
  const result = await saveCustomer(actor, {
    requestId: uuid(),
    name: "Cliente de prueba de recorridos",
    phone: "3001234567",
  });
  customers.push(result.id);
  return result.id;
}
const saleInput = (customerId: string) => ({
  requestId: uuid(),
  customerId,
  locationId,
  title: "Toberas de inyección",
  terms: "Repuestos nuevos",
  issuedOn: today,
  dueOn: "2026-09-30",
  lines: [
    {
      itemId,
      description: "Tobera diésel",
      quantity: "1",
      unitPrice: "100000",
      discount: "0",
      condition: "NEW",
    },
  ],
});
const reception = (customerId: string) => ({
  requestId: uuid(),
  customerId,
  locationId,
  title: "Bomba de inyección",
  reference: uuid(),
  kind: "COMPONENT",
  purpose: "CUSTOMER_REPAIR",
  problem: "Pérdida de presión en caliente",
  authorization: "Autoriza diagnóstico",
});
beforeAll(async () => {
  await db().member.create({
    data: {
      ...actor,
      name: "Oficina de prueba de recorridos",
      email: `${actor.id}@example.invalid`,
    },
  });
  await db().location.create({
    data: {
      id: locationId,
      code: uuid().slice(0, 20),
      name: "Bodega de prueba de recorridos",
    },
  });
  await db().moneyAccount.create({
    data: { id: accountId, name: uuid(), openingBalance: "0", balance: "0" },
  });
  await db().catalogItem.create({
    data: {
      id: itemId,
      code: uuid(),
      name: "Tobera de prueba de recorridos",
      kind: "PART",
    },
  });
  await db().stockBalance.create({
    data: {
      itemId,
      locationId,
      condition: "NEW",
      quantity: "20",
      materialCost: "1000000",
    },
  });
});
afterAll(async () => {
  const customerId = { in: customers };
  await db().paymentAllocation.deleteMany({ where: { actorId: actor.id } });
  await db().saleLine.deleteMany({ where: { sale: { customerId } } });
  await db().sale.deleteMany({ where: { customerId } });
  await db().customerPayment.deleteMany({ where: { customerId } });
  await db().cashEntry.deleteMany({ where: { actorId: actor.id } });
  await db().quoteLine.deleteMany({ where: { quote: { customerId } } });
  await db().quote.deleteMany({ where: { customerId } });
  await db().orderAsset.deleteMany({ where: { order: { customerId } } });
  await db().stockMovement.deleteMany({ where: { actorId: actor.id } });
  await db().workOrder.deleteMany({ where: { customerId } });
  await db().asset.deleteMany({ where: { customerId } });
  await db().stockBalance.deleteMany({ where: { locationId } });
  await db().auditEvent.deleteMany({ where: { actorId: actor.id } });
  await db().commandReceipt.deleteMany({ where: { actorId: actor.id } });
  await db().customer.deleteMany({ where: { id: customerId } });
  await db().catalogItem.delete({ where: { id: itemId } });
  await db().location.delete({ where: { id: locationId } });
  await db().moneyAccount.delete({ where: { id: accountId } });
  await db().member.delete({ where: { id: actor.id } });
  await db().$disconnect();
});
it("creates an inline customer once when a saved request is retried", async () => {
  const input = {
    requestId: uuid(),
    name: "Marta Salazar",
    phone: "3002345678",
    email: "marta@example.invalid",
    document: "52123456",
  };
  const first = await saveCustomer(actor, input);
  customers.push(first.id);
  expect(await saveCustomer(actor, input)).toEqual(first);
  const saved = await db().customer.findUniqueOrThrow({
    where: { id: first.id },
  });
  expect(saved.phone).toBe(input.phone);
  expect(saved.email).toBe(input.email);
});
it("posts a cash sale, stock and payment exactly once even with two submissions", async () => {
  const customerId = await customer();
  const input = {
    ...saleInput(customerId),
    payment: { accountId, amount: "100000" },
  };
  const before = await db().moneyAccount.findUniqueOrThrow({
    where: { id: accountId },
  });
  const [first, second] = await Promise.all([
    issueSale(actor, input),
    issueSale(actor, input),
  ]);
  expect(first).toEqual(second);
  expect(await db().sale.count({ where: { customerId } })).toBe(1);
  expect(await db().customerPayment.count({ where: { customerId } })).toBe(1);
  expect(
    (
      await db().moneyAccount.findUniqueOrThrow({ where: { id: accountId } })
    ).balance
      .minus(before.balance)
      .toString(),
  ).toBe("100000");
  const page = await commercialPage(
    actor,
    new URLSearchParams({ resource: "sales", customerId }),
  );
  expect(page.rows[0].balance).toBe("0.00");
  const pending = await commercialPage(
    actor,
    new URLSearchParams({ resource: "sales", customerId, outstanding: "true" }),
  );
  expect(pending.total).toBe(0);
  expect(pending.rows).toEqual([]);
});
it("uses the selected customer credit plus a partial payment and keeps the remainder collectible", async () => {
  const customerId = await customer(),
    other = await customer();
  await receivePayment(actor, {
    requestId: uuid(),
    customerId,
    accountId,
    amount: "30000",
    occurredOn: today,
    note: "Anticipo de repuestos",
  });
  await receivePayment(actor, {
    requestId: uuid(),
    customerId: other,
    accountId,
    amount: "90000",
    occurredOn: today,
    note: "Anticipo de otro cliente",
  });
  const result = await issueSale(actor, {
    ...saleInput(customerId),
    applyCredit: true,
    payment: { accountId, amount: "20000" },
  });
  const page = await commercialPage(
    actor,
    new URLSearchParams({
      resource: "sales",
      customerId,
      outstanding: "true",
      recordId: result.id,
    }),
  );
  expect(page.total).toBe(1);
  expect(page.rows[0].paid).toBe("50000.00");
  expect(page.rows[0].balance).toBe("50000.00");
  const credit = await commercialPage(
    actor,
    new URLSearchParams({ resource: "payments", customerId: other }),
  );
  expect(credit.summary.advances).toBe("90000.00");
  await receivePayment(actor, {
    requestId: uuid(),
    customerId,
    accountId,
    saleId: result.id,
    amount: "50000",
    occurredOn: today,
    note: "Pago del saldo restante",
  });
  expect(
    (
      await commercialPage(
        actor,
        new URLSearchParams({
          resource: "sales",
          customerId,
          outstanding: "true",
        }),
      )
    ).total,
  ).toBe(0);
});
it("does not silently leave a debt when credit used for a full checkout is no longer available", async () => {
  const customerId = await customer();
  await receivePayment(actor, {
    requestId: uuid(),
    customerId,
    accountId,
    amount: "30000",
    occurredOn: today,
    note: "Anticipo compartido entre compras",
  });
  await issueSale(actor, { ...saleInput(customerId), applyCredit: true });
  const balance = (
    await db().moneyAccount.findUniqueOrThrow({ where: { id: accountId } })
  ).balance.toString();
  await expect(
    issueSale(actor, {
      ...saleInput(customerId),
      applyCredit: true,
      settleInFull: true,
      payment: { accountId, amount: "70000" },
    }),
  ).rejects.toThrow("saldo a favor cambió");
  expect(await db().sale.count({ where: { customerId } })).toBe(1);
  expect(
    (
      await db().moneyAccount.findUniqueOrThrow({ where: { id: accountId } })
    ).balance.toString(),
  ).toBe(balance);
});

it("rolls stock, sale and credit back if the checkout payment exceeds the debt", async () => {
  const customerId = await customer();
  await receivePayment(actor, {
    requestId: uuid(),
    customerId,
    accountId,
    amount: "30000",
    occurredOn: today,
    note: "Anticipo de compra",
  });
  const stock = await db().stockBalance.findFirstOrThrow({
    where: { itemId, locationId },
  });
  const money = await db().moneyAccount.findUniqueOrThrow({
    where: { id: accountId },
  });
  await expect(
    issueSale(actor, {
      ...saleInput(customerId),
      applyCredit: true,
      payment: { accountId, amount: "100000" },
    }),
  ).rejects.toThrow("supera");
  expect(await db().sale.count({ where: { customerId } })).toBe(0);
  expect(
    (
      await db().stockBalance.findFirstOrThrow({
        where: { itemId, locationId },
      })
    ).quantity.toString(),
  ).toBe(stock.quantity.toString());
  expect(
    (
      await db().moneyAccount.findUniqueOrThrow({ where: { id: accountId } })
    ).balance.toString(),
  ).toBe(money.balance.toString());
  expect(
    (
      await commercialPage(
        actor,
        new URLSearchParams({ resource: "payments", customerId }),
      )
    ).summary.advances,
  ).toBe("30000.00");
});
it("receives an approved quotation and links every revision without creating a sale or duplicate order", async () => {
  const customerId = await customer();
  const first = await saveQuote(actor, {
    ...saleInput(customerId),
    validUntil: "2026-09-30",
  });
  const quote = await saveQuote(actor, {
    ...saleInput(customerId),
    previousId: first.id,
    validUntil: "2026-09-30",
  });
  await expect(
    receiveOrder(actor, { ...reception(customerId), quoteId: quote.id }),
  ).rejects.toThrow("aprobada");
  await decideQuote(actor, {
    requestId: uuid(),
    quoteId: quote.id,
    decision: "APPROVED",
    approvedBy: "Marta Salazar",
    note: "Confirmó por teléfono",
  });
  const other = await customer();
  await expect(
    receiveOrder(actor, { ...reception(other), quoteId: quote.id }),
  ).rejects.toThrow("cliente");
  const input = { ...reception(customerId), quoteId: quote.id };
  const order = await receiveOrder(actor, input);
  expect(await receiveOrder(actor, input)).toEqual(order);
  expect(
    await db().quote.count({
      where: {
        groupId: (
          await db().quote.findUniqueOrThrow({ where: { id: quote.id } })
        ).groupId,
        orderId: order.id,
      },
    }),
  ).toBe(2);
  expect(await db().sale.count({ where: { customerId } })).toBe(0);
  await expect(
    receiveOrder(actor, { ...input, requestId: uuid() }),
  ).rejects.toThrow("sin venta ni orden");
});
it("supports reception before quotation, then approval and a credit sale for the same job", async () => {
  const customerId = await customer();
  const order = await receiveOrder(actor, reception(customerId));
  const quote = await saveQuote(actor, {
    ...saleInput(customerId),
    orderId: order.id,
    validUntil: "2026-09-30",
  });
  await decideQuote(actor, {
    requestId: uuid(),
    quoteId: quote.id,
    decision: "APPROVED",
    approvedBy: "Marta Salazar",
    note: "Autoriza reparación completa",
  });
  const sale = await issueSale(actor, {
    ...saleInput(customerId),
    quoteId: quote.id,
    orderId: order.id,
  });
  expect(
    (
      await commercialPage(
        actor,
        new URLSearchParams({ resource: "sales", recordId: sale.id }),
      )
    ).rows[0].balance,
  ).toBe("100000.00");
  expect(await db().customerPayment.count({ where: { customerId } })).toBe(0);
  expect(
    await db().stockMovement.count({
      where: { orderId: order.id, kind: "SALE" },
    }),
  ).toBe(0);
  await expect(
    issueSale(actor, { ...saleInput(customerId), orderId: order.id }),
  ).rejects.toThrow("ya tiene una venta");
});
