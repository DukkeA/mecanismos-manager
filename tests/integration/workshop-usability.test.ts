import { randomUUID as uuid } from "node:crypto";
import { expect, it } from "vitest";
import { db } from "@/server/db";
import type { Tx } from "@/server/commands";
import {
  saveMember,
  receiveOrder,
  assignTask,
  setOrderCoordinator,
  transitionOrder,
} from "@/server/operations-service";
import { saveItem, moveStock } from "@/server/inventory-service";
import { recordTaskTime } from "@/server/task-service";
import { getOperations } from "@/server/operations-query";
import {
  createQuickPurchase,
  quickPurchases,
} from "@/server/quick-purchase-service";
import { recordCash } from "@/server/cash-service";
import { getOrders } from "@/server/workshop-query";
import { recordsPage } from "@/server/records-query";
import { issueSale, voidSale } from "@/server/sales-service";
import {
  createPurchase,
  receivePurchase,
  returnPurchase,
} from "@/server/purchase-service";
import { inventoryPriceHistory } from "@/server/inventory-history";
import { commercialPage } from "@/server/commercial-query";
import { saveQuote } from "@/server/quote-service";
import { previewCount, applyCount } from "@/server/stock-workflows";

// Exercise the real services and database without leaving test data in the workshop.
async function rollback(run: (tx: Tx) => Promise<void>) {
  const root = db();
  const cache = globalThis as unknown as { workshopDb?: ReturnType<typeof db> };
  const previous = cache.workshopDb;
  const done = new Error("rollback usability fixtures");
  try {
    await root.$transaction(
      async (tx) => {
        cache.workshopDb = new Proxy(tx, {
          get(target, key) {
            if (key === "$transaction")
              return (callback: (tx: Tx) => unknown) => callback(tx);
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          },
        }) as unknown as ReturnType<typeof db>;
        await run(tx);
        throw done;
      },
      { timeout: 60000 },
    );
  } catch (error) {
    if (error !== done) throw error;
  } finally {
    cache.workshopDb = previous;
  }
}

async function fixture(tx: Tx) {
  const office = { id: uuid(), role: "OFFICE" as const };
  const admin = { id: uuid(), role: "ADMIN" as const };
  const first = { id: uuid(), role: "MECHANIC" as const };
  const second = { id: uuid(), role: "MECHANIC" as const };
  for (const actor of [office, admin, first, second])
    await tx.member.create({
      data: { ...actor, name: actor.id, email: `${actor.id}@example.invalid` },
    });
  const location = await tx.location.create({
    data: { code: uuid().slice(0, 20), name: `QA ${uuid()}` },
  });
  return { office, admin, first, second, location };
}

it("office creates office users and edits office/mechanic identities without escalating admin access", () =>
  rollback(async (tx) => {
    const { office, admin, first } = await fixture(tx);
    const email = `${uuid()}@example.invalid`;
    const created = await saveMember(office, {
      name: "Nueva oficina",
      email,
      role: "OFFICE",
      active: true,
    });
    expect(
      (await tx.member.findUniqueOrThrow({ where: { id: created.id } })).role,
    ).toBe("OFFICE");
    await tx.member.update({
      where: { id: first.id },
      data: { authSubject: uuid() },
    });
    const changed = {
      id: first.id,
      name: "Mecánica actualizada",
      email: `${uuid()}@example.invalid`,
      role: "OFFICE",
      active: true,
    };
    await saveMember(office, changed);
    expect(
      await tx.member.findUniqueOrThrow({ where: { id: first.id } }),
    ).toMatchObject({ ...changed, authSubject: null });
    await saveMember(office, { ...changed, role: "MECHANIC" });
    await expect(
      saveMember(office, { ...changed, role: "ADMIN" }),
    ).rejects.toThrow("administración");
    await expect(
      saveMember(office, { ...changed, id: admin.id }),
    ).rejects.toThrow("administración");
    await expect(saveMember(office, { ...changed, email })).rejects.toThrow(
      "correo",
    );
    await expect(saveMember(first, changed)).rejects.toThrow("permiso");
  }));

it("creates initial stock atomically once and shows both available and zero-stock parts in the inventory table", () =>
  rollback(async (tx) => {
    const { office, location } = await fixture(tx);
    const code = uuid();
    const input = {
      requestId: uuid(),
      code,
      name: "Repuesto con saldo inicial",
      kind: "PART",
      unit: "unidad",
      initialQuantity: "3.5",
      locationId: location.id,
      condition: "USED",
      purchasePrice: "2000",
      salePrice: "4000",
    };
    const item = await saveItem(office, input);
    expect(await saveItem(office, input)).toEqual(item);
    const stock = await tx.stockBalance.findFirstOrThrow({
      where: { itemId: item.id },
    });
    expect(stock.quantity.toString()).toBe("3.5");
    expect(stock.materialCost.toString()).toBe("7000");
    expect(await tx.stockMovement.count({ where: { itemId: item.id } })).toBe(
      1,
    );
    const page = await recordsPage(
      office,
      new URLSearchParams({ table: "balances", q: code }),
    );
    expect(page.rows).toEqual([
      expect.objectContaining({ itemId: item.id, quantity: "3.5" }),
    ]);
    const zero = await saveItem(office, {
      ...input,
      name: `Repuesto sin saldo ${uuid()}`,
      requestId: uuid(),
      code: uuid(),
      initialQuantity: "0",
    });
    expect(
      (
        await tx.stockBalance.findFirstOrThrow({ where: { itemId: zero.id } })
      ).quantity.toString(),
    ).toBe("0");
    const unknown = await saveItem(office, {
      ...input,
      name: `Repuesto sin costo ${uuid()}`,
      requestId: uuid(),
      code: uuid(),
      purchasePrice: "",
    });
    expect(
      (
        await tx.stockBalance.findFirstOrThrow({
          where: { itemId: unknown.id },
        })
      ).costKnown,
    ).toBe(false);
    await expect(
      saveItem(office, { ...input, initialQuantity: "-1" }),
    ).rejects.toThrow();
    await expect(
      saveItem(office, { ...input, requestId: uuid(), id: item.id }),
    ).rejects.toThrow("movimiento");
  }));

it("records quick purchases and payments once as expenses without changing catalog or stock", () =>
  rollback(async (tx) => {
    const { office } = await fixture(tx);
    const counts = [
      await tx.catalogItem.count(),
      await tx.stockMovement.count(),
      await tx.stockBalance.count(),
    ];
    const account = await tx.moneyAccount.create({
      data: {
        name: `QA ${uuid()}`,
        openingBalance: "100000",
        balance: "100000",
      },
    });
    const title = `Aceite de uso diario ${uuid()}`;
    const input = {
      requestId: uuid(),
      title,
      amount: "12000",
      occurredOn: "2026-10-21",
      dueOn: "2026-10-22",
      supplier: "Papelería de prueba",
      note: "",
    };
    const pending = await createQuickPurchase(office, input);
    expect(await createQuickPurchase(office, input)).toEqual(pending);
    expect(
      (await tx.obligation.findUniqueOrThrow({ where: { id: pending.id } }))
        .category,
    ).toBe("OTHER");
    const paid = await createQuickPurchase(office, {
      ...input,
      requestId: uuid(),
      title: "Insumos ya pagados",
      accountId: account.id,
    });
    expect(await tx.cashEntry.count({ where: { obligationId: paid.id } })).toBe(
      1,
    );
    expect(
      (
        await tx.moneyAccount.findUniqueOrThrow({ where: { id: account.id } })
      ).balance.toString(),
    ).toBe("88000");
    await recordCash(office, {
      requestId: uuid(),
      accountId: account.id,
      obligationId: pending.id,
      kind: "EXPENSE_PAYMENT",
      amount: "2000",
      counterparty: "Papelería",
      reference: "",
      occurredOn: "2026-10-21",
      note: "",
    });
    expect(
      (await quickPurchases(office, new URLSearchParams({ q: title }))).rows[0],
    ).toMatchObject({ pending: "10000", paid: "2000" });
    expect([
      await tx.catalogItem.count(),
      await tx.stockMovement.count(),
      await tx.stockBalance.count(),
    ]).toEqual(counts);
  }));

it("unifies the coordinator and task team for visibility and permits status changes without a reason", () =>
  rollback(async (tx) => {
    const { office, first, second, location } = await fixture(tx);
    const created = await receiveOrder(office, {
      requestId: uuid(),
      purpose: "OWN_REBUILD",
      title: "Reparación con varios mecánicos",
      reference: "",
      kind: "COMPONENT",
      problem: "Prueba de asignaciones compartidas",
      locationId: location.id,
      responsibleId: first.id,
    });
    await assignTask(office, {
      requestId: uuid(),
      orderId: created.id,
      title: "Revisión por segundo mecánico",
      memberIds: [second.id],
    });
    const order = (await getOrders(second, [created.id]))[0];
    expect(order.memberIds).toEqual(
      expect.arrayContaining([first.id, second.id]),
    );
    expect(order.responsible).toContain(first.id);
    expect(order.responsible).toContain(second.id);
    await transitionOrder(office, {
      requestId: uuid(),
      orderId: created.id,
      version: 0,
      status: "DIAGNOSING",
    });
    await setOrderCoordinator(office, {
      requestId: uuid(),
      orderId: created.id,
      version: 1,
      responsibleId: null,
    });
    expect((await getOrders(second, [created.id]))[0].memberIds).toEqual([
      second.id,
    ]);
    expect(await getOrders(first, [created.id])).toHaveLength(0);
    await expect(
      setOrderCoordinator(office, {
        requestId: uuid(),
        orderId: created.id,
        version: 0,
        responsibleId: first.id,
      }),
    ).rejects.toThrow("cambió");
  }));

it("supports parts and labor from the same workflow in customer and own repairs", () =>
  rollback(async (tx) => {
    const { office, first, second, location } = await fixture(tx);
    const customer = await tx.customer.create({
      data: { name: "Cliente del trabajo" },
    });
    const part = await saveItem(office, {
      requestId: uuid(),
      code: uuid(),
      name: "Repuesto para ambos trabajos",
      kind: "PART",
      initialQuantity: "4",
      locationId: location.id,
      purchasePrice: "1000",
    });
    for (const purpose of ["OWN_REBUILD", "CUSTOMER_REPAIR"]) {
      const order = await receiveOrder(office, {
        requestId: uuid(),
        purpose,
        customerId: purpose === "CUSTOMER_REPAIR" ? customer.id : undefined,
        title: "Trabajo compartido",
        reference: "",
        kind: "COMPONENT",
        problem: "Reconstrucción y pruebas en banco",
        locationId: location.id,
      });
      const consumption = await moveStock(office, {
        requestId: uuid(),
        itemId: part.id,
        orderId: order.id,
        locationId: location.id,
        condition: "NEW",
        kind: "CONSUMPTION",
        quantity: "1",
        unitCost: "0",
        reason: `Repuesto utilizado en OT-${order.number}`,
      });
      const task = await assignTask(office, {
        requestId: uuid(),
        orderId: order.id,
        title: "Pruebas por dos mecánicos",
        memberIds: [first.id, second.id],
      });
      for (const mechanic of [first, second])
        await recordTaskTime(mechanic, {
          taskId: task.id,
          idempotencyKey: uuid(),
          workedOn: "2026-10-21",
          minutes: 20,
          note: "Prueba de funcionamiento",
        });
      const visible = (await getOrders(second, [order.id]))[0];
      expect(visible.tasks[0].minutes).toBe(40);
      expect(visible.memberIds).toEqual(
        expect.arrayContaining([first.id, second.id]),
      );
      const movement = (await getOperations(office)).movements.find(
        (row) => row.id === consumption.id,
      );
      expect(movement).toMatchObject({
        orderId: order.id,
        quantity: "-1",
        materialAmount: "-1000.00",
      });
    }
    expect(
      (
        await tx.stockBalance.findFirstOrThrow({ where: { itemId: part.id } })
      ).quantity.toString(),
    ).toBe("2");
  }));

it("accepts reference-free parts without a code and prevents equivalent names on create and edit", () =>
  rollback(async (tx) => {
    const { office, admin, location } = await fixture(tx);
    const name = `Arandelas de presión ${uuid()}`;
    const part = await saveItem(office, {
      name,
      kind: "PART",
      initialQuantity: "2",
      locationId: location.id,
    });
    const saved = await tx.catalogItem.findUniqueOrThrow({
      where: { id: part.id },
    });
    expect(saved.reference).toBe("");
    expect(saved.code).toBeTruthy();
    await expect(
      saveItem(office, {
        name: `  ${name.toUpperCase().replace("PRESIÓN", "PRESION")}  `,
        kind: "PART",
      }),
    ).rejects.toThrow("Ya existe el repuesto");
    const otherName = `Otra arandela ${uuid()}`;
    const other = await saveItem(office, {
      name: otherName,
      kind: "PART",
      locationId: location.id,
    });
    await expect(
      saveItem(office, { id: other.id, name, kind: "PART" }),
    ).rejects.toThrow("Ya existe el repuesto");
    const count = await previewCount(admin, {
      requestId: uuid(),
      locationId: location.id,
      note: "Conteo sin códigos",
      rows: [
        {
          name: otherName.toUpperCase(),
          condition: "NEW",
          quantity: "3",
          unitCost: "100",
        },
      ],
    });
    await applyCount(admin, { requestId: uuid(), countId: count.id });
    expect(
      await tx.catalogItem.count({
        where: { name: { equals: name, mode: "insensitive" } },
      }),
    ).toBe(1);
    expect(
      (
        await tx.stockBalance.findFirstOrThrow({ where: { itemId: other.id } })
      ).quantity.toString(),
    ).toBe("3");
  }));

it("keeps receipt and sale prices per transaction, optional descriptions and exact customer sales links", () =>
  rollback(async (tx) => {
    const { office, location } = await fixture(tx);
    const name = `Bomba Dmax ${uuid()}`;
    const part = await saveItem(office, {
      name,
      kind: "PART",
      initialQuantity: "1",
      purchasePrice: "1000000",
      locationId: location.id,
    });
    await moveStock(office, {
      requestId: uuid(),
      itemId: part.id,
      locationId: location.id,
      condition: "NEW",
      quantity: "2",
      unitCost: "1300000",
      kind: "RECEIPT",
      reason: "Segunda compra a precio diferente",
    });
    const customer = await tx.customer.create({
      data: { name: `Cliente ${uuid()}` },
    });
    const sameName = await tx.customer.create({
      data: { name: customer.name },
    });
    for (const [unitPrice, discount] of [
      ["1500000", "0"],
      ["1700000", "100000"],
    ]) {
      await issueSale(office, {
        requestId: uuid(),
        kind: "COUNTER",
        customerId: customer.id,
        locationId: location.id,
        issuedOn: "2026-10-28",
        dueOn: "2026-10-28",
        lines: [
          {
            itemId: part.id,
            description: name,
            quantity: "1",
            unitPrice,
            discount,
          },
        ],
      });
    }
    const purchases = await inventoryPriceHistory(
      office,
      new URLSearchParams({ itemId: part.id, kind: "PURCHASE" }),
    );
    expect(purchases.rows.map((r) => r.unitPrice).sort()).toEqual([
      "1000000.00",
      "1300000.00",
    ]);
    const sales = await inventoryPriceHistory(
      office,
      new URLSearchParams({ itemId: part.id, kind: "SALE" }),
    );
    expect(sales.rows.map((r) => r.unitPrice).sort()).toEqual(
      ["1500000", "1700000"].map((v) => `${v}.00`),
    );
    expect(sales.rows.map((r) => r.netUnitPrice).sort()).toEqual([
      "1500000.00",
      "1600000.00",
    ]);
    expect(
      (
        await commercialPage(
          office,
          new URLSearchParams({ resource: "sales", customerId: customer.id }),
        )
      ).rows,
    ).toHaveLength(2);
    expect(
      (
        await commercialPage(
          office,
          new URLSearchParams({ resource: "sales", customerId: sameName.id }),
        )
      ).total,
    ).toBe(0);
    const customers = await recordsPage(
      office,
      new URLSearchParams({ table: "customers", q: customer.name }),
    );
    expect(
      customers.rows.find((row) => (row as { id: string }).id === customer.id),
    ).toMatchObject({ sales: 2 });
    expect(
      (await tx.sale.findFirstOrThrow({ where: { customerId: customer.id } }))
        .title,
    ).toBe(name);
    const order = await receiveOrder(office, {
      requestId: uuid(),
      title: name,
      kind: "COMPONENT",
      purpose: "CUSTOMER_REPAIR",
      customerId: customer.id,
      locationId: location.id,
      reference: "",
    });
    expect(
      (await tx.workOrder.findUniqueOrThrow({ where: { id: order.id } }))
        .reportedProblem,
    ).toBe("");
    expect(
      (
        await recordsPage(
          office,
          new URLSearchParams({ table: "orders", customerId: sameName.id }),
        )
      ).total,
    ).toBe(0);
    const quote = await saveQuote(office, {
      requestId: uuid(),
      customerId: customer.id,
      validUntil: "2099-01-01",
      lines: [
        {
          itemId: part.id,
          description: name,
          quantity: "1",
          unitPrice: "1700000",
        },
      ],
    });
    expect(
      (await tx.quote.findUniqueOrThrow({ where: { id: quote.id } })).title,
    ).toBe(name);
  }));

it("shows received supplier prices, marks returns and void sales, and denies mechanics access to prices", () =>
  rollback(async (tx) => {
    const { office, admin, first, location } = await fixture(tx);
    const part = await saveItem(office, {
      name: `Repuesto de historial ${uuid()}`,
      kind: "PART",
      locationId: location.id,
    });
    const supplier = await tx.supplier.create({
      data: { name: "Proveedor de historial", phone: "" },
    });
    const purchase = await createPurchase(office, {
      requestId: uuid(),
      supplierId: supplier.id,
      locationId: location.id,
      orderedOn: "2026-10-01",
      dueOn: "2026-10-28",
      lines: [
        {
          itemId: part.id,
          quantity: "3",
          unitCost: "1300000",
          condition: "USED",
        },
      ],
    });
    const line = await tx.purchaseLine.findFirstOrThrow({
      where: { purchaseId: purchase.id },
    });
    const receipt = await receivePurchase(office, {
      requestId: uuid(),
      lineId: line.id,
      quantity: "3",
      occurredOn: "2026-10-02",
      reason: "Recibido para historial",
    });
    await returnPurchase(admin, {
      requestId: uuid(),
      receiptId: receipt.id,
      quantity: "1",
      occurredOn: "2026-10-03",
      reason: "Devolución de una unidad",
    });
    const history = await inventoryPriceHistory(
      office,
      new URLSearchParams({ itemId: part.id, kind: "PURCHASE" }),
    );
    expect(history.rows).toEqual([
      expect.objectContaining({
        date: "2026-10-02",
        counterparty: supplier.name,
        unitPrice: "1300000.00",
        status: "PARTIAL_RETURN",
        condition: "USED",
      }),
    ]);
    const customer = await tx.customer.create({
      data: { name: "Cliente del historial" },
    });
    const sale = await issueSale(office, {
      requestId: uuid(),
      customerId: customer.id,
      locationId: location.id,
      issuedOn: "2026-10-28",
      dueOn: "2026-10-28",
      lines: [
        {
          itemId: part.id,
          description: "Venta de prueba",
          quantity: "1",
          unitPrice: "1700000",
          condition: "USED",
        },
      ],
    });
    await voidSale(admin, {
      requestId: uuid(),
      saleId: sale.id,
      reason: "Anulación de la prueba",
    });
    expect(
      (
        await inventoryPriceHistory(
          office,
          new URLSearchParams({ itemId: part.id, kind: "SALE" }),
        )
      ).rows[0],
    ).toMatchObject({ unitPrice: "1700000.00", status: "VOID" });
    await expect(
      inventoryPriceHistory(
        first,
        new URLSearchParams({ itemId: part.id, kind: "SALE" }),
      ),
    ).rejects.toThrow("permiso");
  }));

it("rejects labor in counter sales while allowing it in customer repairs", () =>
  rollback(async (tx) => {
    const { office, location } = await fixture(tx);
    const service = await tx.catalogItem.create({
      data: {
        code: uuid(),
        name: `Prueba de mano de obra ${uuid()}`,
        kind: "SERVICE",
      },
    });
    const customer = await tx.customer.create({
      data: { name: "Cliente de prueba" },
    });
    const input = {
      requestId: uuid(),
      kind: "COUNTER",
      customerId: customer.id,
      locationId: location.id,
      title: "Venta con servicio",
      issuedOn: "2026-10-21",
      dueOn: "2026-10-21",
      lines: [
        {
          itemId: service.id,
          description: "Prueba en banco",
          quantity: "1",
          unitPrice: "10000",
          discount: "0",
          condition: "NEW",
        },
      ],
    };
    await expect(issueSale(office, input)).rejects.toThrow("mostrador");
    const repair = await issueSale(office, {
      ...input,
      requestId: uuid(),
      kind: "REPAIR",
    });
    expect(
      await tx.sale.findUniqueOrThrow({ where: { id: repair.id } }),
    ).toMatchObject({ kind: "REPAIR", orderId: expect.any(String) });
  }));
