import { it, expect } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { db } from "@/server/db";
import { setActor, type Tx } from "@/server/commands";
import { issueSale, returnSale, voidSale } from "@/server/sales-service";
import {
  profitabilityDetail,
  profitabilityOverview,
} from "@/server/profitability-query";
import { productResults } from "@/server/product-results";
import {
  openWarranty,
  reviewWarranty,
  orderCost,
  registerUnit,
  finishUnit,
  sellUnit,
} from "@/server/job-service";
import { moveStock, reverseMovement } from "@/server/inventory-service";
import { reserveStock } from "@/server/stock-workflows";
import {
  createObligation,
  recordCash,
  reverseCash,
} from "@/server/cash-service";
import { recordTaskTime } from "@/server/task-service";
import { DomainError } from "@/domain/errors";
import {
  connectSaleWork,
  completeRepairParts,
} from "@/server/profitability-service";

const date = "2025-01-15",
  note = "Escenario aislado de rentabilidad";
async function scenario(
  run: (tx: Tx, f: Awaited<ReturnType<typeof fixture>>) => Promise<void>,
) {
  const root = db(),
    cache = globalThis as unknown as { workshopDb: ReturnType<typeof db> };
  const rollback = new Error("rollback verification");
  try {
    await root.$transaction(
      async (tx) => {
        cache.workshopDb = new Proxy(tx, {
          get(target, key) {
            if (key === "$transaction")
              return (operation: unknown) =>
                typeof operation === "function"
                  ? operation(tx)
                  : Promise.all(operation as Promise<unknown>[]);
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          },
        }) as unknown as ReturnType<typeof db>;
        const f = await fixture(tx);
        await setActor(tx, f.admin);
        await run(tx, f);
        throw rollback;
      },
      { timeout: 60000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    cache.workshopDb = root;
  }
}
async function fixture(tx: Tx) {
  const admin = { id: uuid(), role: "ADMIN" as const },
    mechanic = { id: uuid(), role: "MECHANIC" as const };
  for (const actor of [admin, mechanic])
    await tx.member.create({
      data: { ...actor, name: note, email: `${actor.id}@example.invalid` },
    });
  const location = await tx.location.create({
    data: { code: uuid().slice(0, 20), name: note },
  });
  const customer = await tx.customer.create({ data: { name: note } });
  const category = await tx.businessCategory.create({
    data: { name: `Rentabilidad ${uuid()}` },
  });
  const part = await tx.catalogItem.create({
    data: {
      code: uuid(),
      name: `${note} repuesto`,
      kind: "PART",
      businessCategoryId: category.id,
    },
  });
  const service = await tx.catalogItem.create({
    data: {
      code: uuid(),
      name: `${note} servicio`,
      kind: "SERVICE",
      businessCategoryId: category.id,
    },
  });
  await tx.stockBalance.create({
    data: {
      itemId: part.id,
      locationId: location.id,
      condition: "NEW",
      quantity: 10,
      materialCost: 1000,
    },
  });
  await tx.laborRate.create({
    data: {
      memberId: mechanic.id,
      effectiveOn: new Date("2025-01-01"),
      hourlyCost: 60,
      monthlySalary: 6000,
      monthlyEmployerCost: 600,
      monthlyHours: 110,
      note,
      actorId: admin.id,
    },
  });
  const account = await tx.moneyAccount.create({
    data: { name: uuid(), openingBalance: 10000, balance: 10000 },
  });
  const base = {
    customerId: customer.id,
    locationId: location.id,
    title: note,
    terms: note,
    issuedOn: date,
    dueOn: date,
  };
  const line = (
    kind: "PART" | "SERVICE",
    quantity = "1",
    unitPrice = "200",
  ) => ({
    itemId: kind === "PART" ? part.id : service.id,
    kind,
    quantity,
    unitPrice,
    discount: "0",
    condition: "NEW",
    description: note,
    ...(kind === "SERVICE" ? { assignedMemberId: mechanic.id } : {}),
  });
  return {
    admin,
    mechanic,
    location,
    customer,
    part,
    service,
    account,
    category,
    base,
    line,
  };
}
const detail = (actor: { id: string; role: "ADMIN" }, saleId: string) =>
  profitabilityDetail(actor, new URLSearchParams({ saleId }));
const month = (actor: { id: string; role: "ADMIN" }, period: string) =>
  profitabilityOverview(actor, new URLSearchParams({ period }));

it("does not certify a historical month after an unpaid employee was deactivated", () =>
  scenario(async (tx, f) => {
    await tx.member.update({
      where: { id: f.mechanic.id },
      data: { active: false },
    });
    const result = await month(f.admin, "2025-01");
    expect(result.result).toBeNull();
    expect(
      result.pending.some((p) => p.label.includes("personal inactivo")),
    ).toBe(true);
  }));

it("creates service work, consumes each part once across repeated checkout and reconciles all reports", () =>
  scenario(async (tx, f) => {
    const before = await month(f.admin, "2025-01");
    const input = {
      ...f.base,
      requestId: uuid(),
      lines: [f.line("PART"), f.line("SERVICE")],
    };
    const sale = await issueSale(f.admin, input);
    expect(await issueSale(f.admin, input)).toEqual(sale);
    const sold = await tx.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { order: { include: { tasks: true } } },
    });
    expect(sold.kind).toBe("REPAIR");
    expect(sold.order?.tasks).toHaveLength(1);
    expect((await detail(f.admin, sale.id))?.margin).toBeNull();
    expect(
      (
        await tx.stockBalance.findFirstOrThrow({ where: { itemId: f.part.id } })
      ).quantity.toString(),
    ).toBe("9");
    await recordTaskTime(f.admin, {
      taskId: sold.order!.tasks[0].id,
      memberId: f.mechanic.id,
      idempotencyKey: uuid(),
      workedOn: date,
      minutes: 60,
      note,
    });
    await tx.workOrder.update({
      where: { id: sold.orderId! },
      data: { status: "CLOSED" },
    });
    const result = await detail(f.admin, sale.id);
    expect(result).toMatchObject({
      revenue: "400.00",
      material: "100.00",
      labor: "60.00",
      margin: "240.00",
    });
    const products = await productResults(
      f.admin,
      new URLSearchParams({ businessCategoryId: f.category.id }),
    );
    expect(products.businessCategories[0]).toMatchObject({
      cost: "160.00",
      margin: "240.00",
    });
    const after = await month(f.admin, "2025-01");
    expect(Number(after.revenue) - Number(before.revenue)).toBe(400);
    expect(Number(after.materials) - Number(before.materials)).toBe(100);
    expect(Number(after.payroll) - Number(before.payroll)).toBe(0);
    expect(Number(after.knownResult) - Number(before.knownResult)).toBe(300); // Labor is already in monthly salaries.
    for (const line of await tx.saleLine.findMany({
      where: { saleId: sale.id },
    }))
      await returnSale(f.admin, {
        requestId: uuid(),
        saleId: sale.id,
        saleLineId: line.id,
        quantity: "1",
        occurredOn: "2025-02-10",
        reason: note,
      });
    expect((await detail(f.admin, sale.id))?.margin).toBe("-160.00"); // Refunding does not recover installed parts or time.
    expect(
      (
        await productResults(
          f.admin,
          new URLSearchParams({ businessCategoryId: f.category.id }),
        )
      ).businessCategories[0].margin,
    ).toBe("-160.00");
  }));

it("reuses consumption and splits an owned reservation without stealing stock from another job", () =>
  scenario(async (tx, f) => {
    const order = await tx.workOrder.create({
      data: {
        customerId: f.customer.id,
        locationId: f.location.id,
        purpose: "CUSTOMER_REPAIR",
        title: note,
        reportedProblem: note,
      },
    });
    await moveStock(f.admin, {
      requestId: uuid(),
      itemId: f.part.id,
      locationId: f.location.id,
      orderId: order.id,
      condition: "NEW",
      kind: "CONSUMPTION",
      quantity: "1",
      reason: note,
    });
    await reserveStock(f.admin, {
      requestId: uuid(),
      itemId: f.part.id,
      locationId: f.location.id,
      orderId: order.id,
      condition: "NEW",
      quantity: "3",
    });
    await issueSale(f.admin, {
      ...f.base,
      requestId: uuid(),
      orderId: order.id,
      lines: [f.line("PART"), f.line("PART")],
    });
    const stock = await tx.stockBalance.findFirstOrThrow({
      where: { itemId: f.part.id },
    });
    expect(stock.quantity.toString()).toBe("8");
    expect(stock.reserved.toString()).toBe("2");
    expect((await orderCost(tx, order.id)).material.toString()).toBe("200");
    expect(
      await tx.stockReservation.count({
        where: { orderId: order.id, status: "ACTIVE" },
      }),
    ).toBe(1);
  }));

it("reports insufficient stock when a service sale includes unavailable parts", async () => {
  // A real service transaction (not the rollback proxy) is exercised by the existing commerce suite.
  await scenario(async (tx, f) => {
    // Check the precondition and surface the actionable inventory error within this isolated transaction.
    await expect(
      issueSale(f.admin, {
        ...f.base,
        requestId: uuid(),
        lines: [f.line("PART", "11"), f.line("SERVICE")],
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

it("attributes warranty and direct expenses to the original sale exactly once and respects rejected paid work", () =>
  scenario(async (tx, f) => {
    const sale = await issueSale(f.admin, {
      ...f.base,
      requestId: uuid(),
      lines: [f.line("PART")],
    });
    const warranty = await openWarranty(f.admin, {
      requestId: uuid(),
      saleId: sale.id,
      locationId: f.location.id,
      symptom: note,
    });
    const w = await tx.warrantyCase.findUniqueOrThrow({
      where: { id: warranty.id },
    });
    const task = await tx.task.create({
      data: {
        orderId: w.repairOrderId,
        title: note,
        assignments: { create: { memberId: f.mechanic.id } },
      },
    });
    await recordTaskTime(f.admin, {
      taskId: task.id,
      memberId: f.mechanic.id,
      idempotencyKey: uuid(),
      workedOn: date,
      minutes: 60,
      note,
    });
    const expense = await createObligation(f.admin, {
      requestId: uuid(),
      orderId: w.repairOrderId,
      title: note,
      category: "OTHER",
      period: "2025-01",
      amount: "20",
      dueOn: date,
    });
    await recordCash(f.admin, {
      requestId: uuid(),
      accountId: f.account.id,
      obligationId: expense.id,
      kind: "EXPENSE_PAYMENT",
      amount: "20",
      counterparty: note,
      reference: "",
      note,
      occurredOn: date,
    });
    await expect(
      issueSale(f.admin, {
        ...f.base,
        requestId: uuid(),
        orderId: w.repairOrderId,
        lines: [f.line("SERVICE")],
      }),
    ).rejects.toThrow("garantía");
    expect((await detail(f.admin, sale.id))?.margin).toBeNull();
    await reviewWarranty(f.admin, {
      requestId: uuid(),
      warrantyId: warranty.id,
      diagnosis: note,
      cause: "PART",
      decision: "ACCEPTED",
    });
    await tx.workOrder.update({
      where: { id: w.repairOrderId },
      data: { status: "CLOSED" },
    });
    const result = await detail(f.admin, sale.id);
    expect(result).toMatchObject({
      cost: "180.00",
      warrantyCost: "80.00",
      margin: "20.00",
    });
    const products = await productResults(
      f.admin,
      new URLSearchParams({ businessCategoryId: f.category.id }),
    );
    expect(products.businessCategories[0]).toMatchObject({
      cost: "180.00",
      margin: "20.00",
    });
    // A rejected diagnosis can instead be charged as its own job; costs are transferred, not duplicated.
    await tx.warrantyCase.update({
      where: { id: warranty.id },
      data: { decision: "REJECTED" },
    });
    const bill = await issueSale(f.admin, {
      ...f.base,
      requestId: uuid(),
      orderId: w.repairOrderId,
      lines: [f.line("SERVICE")],
    });
    expect((await detail(f.admin, sale.id))?.margin).toBe("100.00");
    expect((await detail(f.admin, bill.id))?.margin).toBe("120.00");
  }));

it("uses return dates for monthly results and excludes supplier payments, debt and advances from profit", () =>
  scenario(async (tx, f) => {
    const beforeJan = await month(f.admin, "2025-01"),
      beforeFeb = await month(f.admin, "2025-02");
    const sale = await issueSale(f.admin, {
      ...f.base,
      requestId: uuid(),
      lines: [f.line("PART")],
    });
    const soldLine = await tx.saleLine.findFirstOrThrow({
      where: { saleId: sale.id },
    });
    await returnSale(f.admin, {
      requestId: uuid(),
      saleId: sale.id,
      saleLineId: soldLine.id,
      quantity: "1",
      occurredOn: "2025-02-10",
      reason: note,
    });
    await recordCash(f.admin, {
      requestId: uuid(),
      accountId: f.account.id,
      kind: "LOAN_RECEIVED",
      amount: "1000",
      counterparty: note,
      reference: "",
      note,
      occurredOn: date,
    });
    await recordCash(f.admin, {
      requestId: uuid(),
      accountId: f.account.id,
      kind: "SUPPLIER_PAYMENT",
      amount: "500",
      counterparty: note,
      reference: "",
      note,
      occurredOn: date,
    });
    const jan = await month(f.admin, "2025-01"),
      feb = await month(f.admin, "2025-02");
    expect(Number(jan.revenue) - Number(beforeJan.revenue)).toBe(200);
    expect(Number(jan.materials) - Number(beforeJan.materials)).toBe(100);
    expect(Number(jan.knownResult) - Number(beforeJan.knownResult)).toBe(100);
    expect(Number(feb.revenue) - Number(beforeFeb.revenue)).toBe(-200);
    expect(Number(feb.materials) - Number(beforeFeb.materials)).toBe(-100);
    expect((await detail(f.admin, sale.id))?.margin).toBe("0.00");
  }));

it("counts obligations once regardless of payment and reverses standalone expenses in the reversal month", () =>
  scenario(async (tx, f) => {
    const beforeJan = await month(f.admin, "2025-01"),
      beforeFeb = await month(f.admin, "2025-02");
    const obligation = await createObligation(f.admin, {
      requestId: uuid(),
      title: note,
      category: "OTHER",
      period: "2025-01",
      amount: "100",
      dueOn: date,
    });
    await recordCash(f.admin, {
      requestId: uuid(),
      accountId: f.account.id,
      obligationId: obligation.id,
      kind: "EXPENSE_PAYMENT",
      amount: "100",
      counterparty: note,
      reference: "",
      note,
      occurredOn: "2025-02-05",
    });
    const standalone = await recordCash(f.admin, {
      requestId: uuid(),
      accountId: f.account.id,
      kind: "EXPENSE_PAYMENT",
      amount: "25",
      counterparty: note,
      reference: "",
      note,
      occurredOn: date,
    });
    await reverseCash(f.admin, {
      requestId: uuid(),
      entryId: standalone.id,
      reason: note,
      occurredOn: "2025-02-06",
    });
    const jan = await month(f.admin, "2025-01"),
      feb = await month(f.admin, "2025-02");
    expect(Number(jan.expenses) - Number(beforeJan.expenses)).toBe(125);
    expect(Number(feb.expenses) - Number(beforeFeb.expenses)).toBe(-25);
  }));

it("does not retain a missing cost after reversing an unknown consumption, and protects financial access", () =>
  scenario(async (tx, f) => {
    const order = await tx.workOrder.create({
      data: {
        customerId: f.customer.id,
        locationId: f.location.id,
        purpose: "CUSTOMER_REPAIR",
        title: note,
        reportedProblem: note,
      },
    });
    await tx.stockBalance.updateMany({
      where: { itemId: f.part.id },
      data: { costKnown: false },
    });
    const movement = await moveStock(f.admin, {
      requestId: uuid(),
      itemId: f.part.id,
      locationId: f.location.id,
      orderId: order.id,
      condition: "NEW",
      kind: "CONSUMPTION",
      quantity: "1",
      reason: note,
    });
    expect((await orderCost(tx, order.id)).missingMaterials).toBe(true);
    await reverseMovement(f.admin, {
      requestId: uuid(),
      movementId: movement.id,
      reason: note,
    });
    expect((await orderCost(tx, order.id)).missingMaterials).toBe(false);
    expect((await orderCost(tx, order.id)).material.toString()).toBe("0");
    await expect(
      profitabilityOverview(
        { ...f.admin, role: "OFFICE" },
        new URLSearchParams({ period: "2025-01" }),
      ),
    ).rejects.toThrow("permiso");
    await expect(
      profitabilityDetail(
        f.mechanic,
        new URLSearchParams({ orderId: order.id }),
      ),
    ).rejects.toThrow("permiso");
  }));

it("connects an old mixed service sale without consuming or paying for its parts again", () =>
  scenario(async (tx, f) => {
    // Construct the historical shape that existed before services created work automatically.
    const sale = await issueSale(f.admin, {
      ...f.base,
      requestId: uuid(),
      lines: [f.line("PART")],
    });
    await tx.saleLine.create({
      data: {
        saleId: sale.id,
        itemId: f.service.id,
        kind: "SERVICE",
        assignedMemberId: f.mechanic.id,
        description: note,
        reference: "",
        quantity: 1,
        unitPrice: 200,
        total: 200,
        condition: "NEW",
        materialCost: 0,
        businessCategoryId: f.category.id,
      },
    });
    await tx.sale.update({ where: { id: sale.id }, data: { total: 400 } });
    expect((await detail(f.admin, sale.id))?.margin).toBeNull();
    const input = { requestId: uuid(), saleId: sale.id, note };
    await connectSaleWork(f.admin, input);
    expect(await connectSaleWork(f.admin, input)).toEqual({ id: sale.id });
    const connected = await tx.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { order: { include: { tasks: true } } },
    });
    await recordTaskTime(f.admin, {
      taskId: connected.order!.tasks[0].id,
      memberId: f.mechanic.id,
      minutes: 60,
      workedOn: date,
      note,
      idempotencyKey: uuid(),
    });
    await tx.workOrder.update({
      where: { id: connected.orderId! },
      data: { status: "CLOSED" },
    });
    expect((await detail(f.admin, sale.id))?.margin).toBe("240.00");
    expect(
      (
        await tx.stockBalance.findFirstOrThrow({ where: { itemId: f.part.id } })
      ).quantity.toString(),
    ).toBe("9");
    await completeRepairParts(f.admin, {
      requestId: uuid(),
      saleId: sale.id,
      note,
    });
    expect((await orderCost(tx, connected.orderId!)).material.toString()).toBe(
      "100",
    );
    await expect(
      connectSaleWork(f.admin, { ...input, requestId: uuid() }),
    ).rejects.toThrow("Solo");
  }));

it("allows an audited historical time completion by admin while keeping closed work locked for a mechanic", () =>
  scenario(async (tx, f) => {
    const sale = await issueSale(f.admin, {
      ...f.base,
      requestId: uuid(),
      lines: [f.line("SERVICE")],
    });
    const task = await tx.task.findFirstOrThrow({
      where: { order: { sales: { some: { id: sale.id } } } },
    });
    await tx.workOrder.update({
      where: { id: task.orderId! },
      data: { status: "CLOSED" },
    });
    const input = {
      taskId: task.id,
      memberId: f.mechanic.id,
      minutes: 60,
      workedOn: date,
      note,
      idempotencyKey: uuid(),
    };
    await expect(recordTaskTime(f.mechanic, input)).rejects.toThrow("cerrada");
    await recordTaskTime(f.admin, input);
    expect((await detail(f.admin, sale.id))?.margin).toBe("140.00");
    expect(
      await tx.auditEvent.count({
        where: {
          action: "TASK_TIME_RECORDED",
          actorId: f.admin.id,
          details: { path: ["historical"], equals: true },
        },
      }),
    ).toBe(1);
  }));

it("voiding and reissuing a repair does not duplicate parts or erase the work already performed", () =>
  scenario(async (tx, f) => {
    const sale = await issueSale(f.admin, {
      ...f.base,
      requestId: uuid(),
      lines: [f.line("PART"), f.line("SERVICE")],
    });
    const sold = await tx.sale.findUniqueOrThrow({ where: { id: sale.id } });
    await voidSale(f.admin, {
      requestId: uuid(),
      saleId: sale.id,
      reason: note,
    });
    expect(await detail(f.admin, sale.id)).toBeNull();
    await issueSale(f.admin, {
      ...f.base,
      requestId: uuid(),
      orderId: sold.orderId!,
      lines: [f.line("PART"), f.line("SERVICE")],
    });
    expect(
      (
        await tx.stockBalance.findFirstOrThrow({ where: { itemId: f.part.id } })
      ).quantity.toString(),
    ).toBe("9");
    expect((await orderCost(tx, sold.orderId!)).material.toString()).toBe(
      "100",
    );
  }));

it("keeps reconstruction investment and its frozen split through sale, return and resale", () =>
  scenario(async (tx, f) => {
    const before = await month(f.admin, "2025-01");
    const order = await tx.workOrder.create({
      data: {
        title: note,
        reportedProblem: note,
        purpose: "OWN_REBUILD",
        locationId: f.location.id,
        receivedAt: new Date(date),
      },
    });
    const task = await tx.task.create({
      data: {
        orderId: order.id,
        title: note,
        assignments: { create: { memberId: f.mechanic.id } },
      },
    });
    const unit = await registerUnit(f.admin, {
      requestId: uuid(),
      itemId: f.part.id,
      locationId: f.location.id,
      orderId: order.id,
      code: uuid(),
      serial: "",
      coreCost: "50",
    });
    await moveStock(f.admin, {
      requestId: uuid(),
      orderId: order.id,
      itemId: f.part.id,
      locationId: f.location.id,
      condition: "NEW",
      kind: "CONSUMPTION",
      quantity: "0.2",
      reason: note,
    });
    await recordTaskTime(f.admin, {
      taskId: task.id,
      memberId: f.mechanic.id,
      workedOn: date,
      minutes: 60,
      note,
      idempotencyKey: uuid(),
    });
    await createObligation(f.admin, {
      requestId: uuid(),
      orderId: order.id,
      category: "OTHER",
      title: note,
      amount: "20",
      period: "2025-01",
      dueOn: date,
    });
    expect(
      (
        await profitabilityDetail(
          f.admin,
          new URLSearchParams({ orderId: order.id }),
        )
      )?.cost,
    ).toBe("150.00");
    await tx.workOrder.update({
      where: { id: order.id },
      data: { status: "CLOSED" },
    });
    await finishUnit(f.admin, { requestId: uuid(), unitId: unit.id });
    const input = {
      requestId: uuid(),
      unitId: unit.id,
      customerId: f.customer.id,
      price: "200",
      issuedOn: date,
      dueOn: date,
      terms: note,
    };
    const sale = await sellUnit(f.admin, input);
    expect(
      await profitabilityDetail(
        f.admin,
        new URLSearchParams({ orderId: order.id }),
      ),
    ).toMatchObject({
      saleId: sale.id,
      material: "70.00",
      labor: "60.00",
      expenses: "20.00",
      margin: "50.00",
    });
    const after = await month(f.admin, "2025-01");
    expect(Number(after.materials) - Number(before.materials)).toBe(70);
    expect(Number(after.expenses) - Number(before.expenses)).toBe(20);
    await expect(
      recordTaskTime(f.admin, {
        taskId: task.id,
        memberId: f.mechanic.id,
        workedOn: date,
        minutes: 1,
        note,
        idempotencyKey: uuid(),
      }),
    ).rejects.toThrow("valorada");
    await expect(
      createObligation(f.admin, {
        requestId: uuid(),
        orderId: order.id,
        category: "OTHER",
        title: note,
        amount: "1",
        period: "2025-01",
        dueOn: date,
      }),
    ).rejects.toThrow("valorada");
    const line = await tx.saleLine.findFirstOrThrow({
      where: { saleId: sale.id },
    });
    await returnSale(f.admin, {
      requestId: uuid(),
      saleId: sale.id,
      saleLineId: line.id,
      quantity: "1",
      occurredOn: "2025-02-10",
      reason: note,
    });
    expect((await detail(f.admin, sale.id))?.margin).toBe("0.00");
    expect(
      (
        await profitabilityDetail(
          f.admin,
          new URLSearchParams({ orderId: order.id }),
        )
      )?.cost,
    ).toBe("150.00");
    const next = await sellUnit(f.admin, {
      ...input,
      requestId: uuid(),
      issuedOn: "2025-02-11",
      dueOn: "2025-02-11",
    });
    expect((await detail(f.admin, next.id))?.margin).toBe("50.00");
  }));
