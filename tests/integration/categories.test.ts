import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { db } from "@/server/db";
import { saveCategory, assignOrderCategory } from "@/server/category-service";
import { saveItem, saveSupplier } from "@/server/inventory-service";
import { saveQuote, decideQuote } from "@/server/quote-service";
import { issueSale } from "@/server/sales-service";
import { receiveOrder } from "@/server/operations-service";
import { recordsPage } from "@/server/records-query";
import { productResults } from "@/server/product-results";
import { previewCount, applyCount } from "@/server/stock-workflows";
import { cleanupActivity } from "./activity-cleanup";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";
const admin = { id: uuid(), role: "ADMIN" as const },
  office = { id: uuid(), role: "OFFICE" as const },
  mechanic = { id: uuid(), role: "MECHANIC" as const };
const actors = [admin, office, mechanic],
  prefix = `Categorías ${uuid()}`,
  customerId = uuid(),
  locationId = uuid(),
  catA = uuid(),
  catB = uuid(),
  catC = uuid(),
  serviceId = uuid(),
  partId = uuid(),
  supplierId = uuid();
beforeAll(async () => {
  await db().member.createMany({
    data: actors.map((a) => ({
      ...a,
      name: prefix,
      email: `${a.id}@example.invalid`,
    })),
  });
  await db().customer.create({ data: { id: customerId, name: prefix } });
  await db().location.create({
    data: { id: locationId, name: prefix, code: uuid().slice(0, 20) },
  });
  await db().businessCategory.createMany({
    data: [catA, catB, catC].map((id, i) => ({ id, name: `${prefix} ${i}` })),
  });
  await db().catalogItem.createMany({
    data: [
      {
        id: serviceId,
        code: serviceId,
        name: `${prefix} reparación`,
        kind: "SERVICE",
        businessCategoryId: catA,
      },
      {
        id: partId,
        code: partId,
        name: `${prefix} tobera`,
        kind: "PART",
        businessCategoryId: catB,
      },
    ],
  });
  await db().supplier.create({ data: { id: supplierId, name: prefix } });
});
afterAll(async () => {
  const itemIds = (
    await db().catalogItem.findMany({
      where: { name: { startsWith: prefix } },
      select: { id: true },
    })
  ).map((i) => i.id);
  await db().stockMovement.deleteMany({
    where: { actorId: { in: actors.map((a) => a.id) } },
  });
  await db().inventoryCount.deleteMany({ where: { actorId: admin.id } });
  const sales = await db().sale.findMany({
      where: { customerId },
      select: { id: true },
    }),
    saleIds = sales.map((s) => s.id);
  const returns = await db().saleReturn.findMany({
    where: { saleId: { in: saleIds } },
    select: { id: true },
  });
  await db().saleReturnLine.deleteMany({
    where: { returnId: { in: returns.map((r) => r.id) } },
  });
  await db().saleReturn.deleteMany({ where: { saleId: { in: saleIds } } });
  await db().saleLine.deleteMany({ where: { saleId: { in: saleIds } } });
  await db().sale.deleteMany({ where: { customerId } });
  await db().quoteLine.deleteMany({ where: { quote: { customerId } } });
  await db().quote.deleteMany({ where: { customerId } });
  await db().timeEntry.deleteMany({
    where: { memberId: { in: actors.map((a) => a.id) } },
  });
  await db().task.deleteMany({ where: { order: { customerId } } });
  await db().orderAsset.deleteMany({ where: { order: { customerId } } });
  await db().workOrder.deleteMany({ where: { customerId } });
  await db().asset.deleteMany({ where: { customerId } });
  await db().stockBalance.deleteMany({ where: { itemId: { in: itemIds } } });
  await db().supplierOffer.deleteMany({ where: { supplierId } });
  await db().supplierCategory.deleteMany({ where: { supplierId } });
  await db().supplier.delete({ where: { id: supplierId } });
  await db().catalogItem.deleteMany({ where: { id: { in: itemIds } } });
  await db().businessCategory.deleteMany({
    where: { name: { startsWith: prefix } },
  });
  await db().laborRate.deleteMany({ where: { memberId: admin.id } });
  await db().auditEvent.deleteMany({
    where: { actorId: { in: actors.map((a) => a.id) } },
  });
  await db().commandReceipt.deleteMany({
    where: { actorId: { in: actors.map((a) => a.id) } },
  });
  await cleanupActivity(actors.map((a) => a.id));
  await db().customer.delete({ where: { id: customerId } });
  await db().location.delete({ where: { id: locationId } });
  await db().member.deleteMany({
    where: { id: { in: actors.map((a) => a.id) } },
  });
});
it("limits category administration, rejects duplicate names and protects concurrent edits", async () => {
  const input = { requestId: uuid(), name: `${prefix} extra`, active: true };
  await expect(saveCategory(office, input)).rejects.toThrow("permiso");
  await expect(saveCategory(mechanic, input)).rejects.toThrow("permiso");
  const category = await saveCategory(admin, input);
  expect(await saveCategory(admin, input)).toEqual(category);
  await expect(
    saveCategory(admin, {
      ...input,
      requestId: uuid(),
      name: input.name.toUpperCase(),
    }),
  ).rejects.toThrow("Ya existe");
  await saveCategory(admin, {
    ...input,
    requestId: uuid(),
    id: category.id,
    version: 0,
    active: false,
  });
  await expect(
    saveCategory(admin, {
      ...input,
      requestId: uuid(),
      id: category.id,
      version: 0,
    }),
  ).rejects.toThrow("cambió");
});
it("lets office classify items and multiple supplier specialties, without assigning inactive categories", async () => {
  const item = {
    id: partId,
    code: partId,
    name: `${prefix} tobera`,
    kind: "PART",
    businessCategoryId: catB,
  };
  await saveItem(office, item);
  await saveSupplier(office, {
    id: supplierId,
    name: prefix,
    phone: "6012345678",
    categoryIds: [catA, catB, catB],
  });
  expect(await db().supplierCategory.count({ where: { supplierId } })).toBe(2);
  await saveCategory(admin, {
    requestId: uuid(),
    id: catB,
    version: 0,
    name: `${prefix} 1`,
    active: false,
  });
  await saveItem(office, item); // Existing assignments remain valid.
  await expect(
    saveItem(office, { ...item, businessCategoryId: uuid() }),
  ).rejects.toThrow("activa");
  await expect(
    saveItem(office, {
      id: serviceId,
      code: serviceId,
      name: `${prefix} reparación`,
      kind: "SERVICE",
      businessCategoryId: catB,
    }),
  ).rejects.toThrow("activa");
  await saveCategory(admin, {
    requestId: uuid(),
    id: catB,
    version: 1,
    name: `${prefix} 1`,
    active: true,
  });
});
it("filters categories and supplier specialties on the server before pagination", async () => {
  const params = new URLSearchParams({
    table: "suppliers",
    businessCategoryId: catB,
    q: prefix,
    orderBy: "businessCategory",
    direction: "asc",
  });
  expect((await recordsPage(office, params)).total).toBe(1);
  params.set("businessCategoryId", catC);
  expect((await recordsPage(office, params)).total).toBe(0);
  await db().stockBalance.create({
    data: {
      itemId: partId,
      locationId,
      condition: "NEW",
      quantity: 2,
      materialCost: 20,
      costKnown: true,
    },
  });
  await db().supplierOffer.create({
    data: {
      itemId: partId,
      supplierId,
      condition: "NEW",
      unitCost: 20,
      observedAt: new Date(),
      evidence: prefix,
    },
  });
  for (const table of ["items", "balances", "offers"]) {
    const page = await recordsPage(
      office,
      new URLSearchParams({ table, businessCategoryId: catB, q: prefix }),
    );
    expect(page.total).toBe(1);
  }
});
it("preserves quote and counter-sale category snapshots when the catalog changes", async () => {
  const doc = {
    requestId: uuid(),
    customerId,
    title: prefix,
    terms: prefix,
    validUntil: "2099-12-31",
    lines: [
      {
        itemId: serviceId,
        description: prefix,
        quantity: "1",
        unitPrice: "200000",
        discount: "0",
        condition: "NEW",
      },
    ],
  };
  const quote = await saveQuote(office, doc);
  await decideQuote(office, {
    requestId: uuid(),
    quoteId: quote.id,
    decision: "APPROVED",
    approvedBy: prefix,
    note: prefix,
  });
  await saveItem(office, {
    id: serviceId,
    code: serviceId,
    name: `${prefix} reparación`,
    kind: "SERVICE",
    businessCategoryId: catC,
  });
  const sale = await issueSale(office, {
    ...doc,
    requestId: uuid(),
    quoteId: quote.id,
    locationId,
    issuedOn: "2026-09-12",
    dueOn: "2026-09-30",
  });
  expect(
    (await db().saleLine.findFirstOrThrow({ where: { saleId: sale.id } }))
      .businessCategoryId,
  ).toBe(catA);
});
it("attributes a repair to its work category and freezes it when a sale is issued", async () => {
  const order = await receiveOrder(office, {
    requestId: uuid(),
    customerId,
    locationId,
    title: prefix,
    reference: "",
    kind: "COMPONENT",
    problem: prefix,
    businessCategoryId: catA,
  });
  await assignOrderCategory(office, {
    requestId: uuid(),
    orderId: order.id,
    version: 0,
    businessCategoryId: catB,
  });
  await expect(
    assignOrderCategory(mechanic, {
      requestId: uuid(),
      orderId: order.id,
      version: 1,
      businessCategoryId: catA,
    }),
  ).rejects.toThrow("permiso");
  const sale = await issueSale(office, {
    requestId: uuid(),
    customerId,
    locationId,
    orderId: order.id,
    title: prefix,
    terms: prefix,
    issuedOn: "2026-09-12",
    dueOn: "2026-09-30",
    lines: [
      {
        itemId: serviceId,
        description: prefix,
        quantity: "1",
        unitPrice: "100000",
        discount: "0",
        condition: "NEW",
      },
    ],
  });
  expect(
    (await db().saleLine.findFirstOrThrow({ where: { saleId: sale.id } }))
      .businessCategoryId,
  ).toBe(catB);
  await expect(
    assignOrderCategory(office, {
      requestId: uuid(),
      orderId: order.id,
      version: 1,
      businessCategoryId: catC,
    }),
  ).rejects.toThrow("fija");
  expect(
    (
      await recordsPage(
        office,
        new URLSearchParams({
          table: "orders",
          businessCategoryId: catB,
          q: prefix,
        }),
      )
    ).total,
  ).toBe(1);
});
it("reports losses, unknown costs and category totals without multiplying repair costs", async () => {
  const date = new Date("2026-08-06"),
    common = {
      customerId,
      locationId,
      actorId: admin.id,
      title: prefix,
      terms: prefix,
      issuedOn: date,
      dueOn: date,
    };
  await db().laborRate.create({
    data: {
      memberId: admin.id,
      actorId: admin.id,
      effectiveOn: new Date("2026-08-01"),
      hourlyCost: 60000,
      note: prefix,
    },
  });
  const order = await db().workOrder.create({
    data: {
      customerId,
      locationId,
      purpose: "CUSTOMER_REPAIR",
      title: prefix,
      reportedProblem: prefix,
      status: "CLOSED",
      businessCategoryId: catA,
    },
  });
  const task = await db().task.create({
    data: { title: prefix, orderId: order.id },
  });
  await db().timeEntry.create({
    data: {
      taskId: task.id,
      memberId: admin.id,
      minutes: 120,
      workedOn: date,
      idempotencyKey: uuid(),
      note: prefix,
    },
  });
  const line = {
    itemId: serviceId,
    businessCategoryId: catA,
    description: prefix,
    reference: "",
    kind: "SERVICE" as const,
    condition: "NEW" as const,
    quantity: 1,
    unitPrice: 40000,
    total: 40000,
  };
  await db().sale.create({
    data: {
      ...common,
      orderId: order.id,
      kind: "REPAIR",
      total: 80000,
      lines: { create: [line, line] },
    },
  });
  await db().sale.create({
    data: {
      ...common,
      kind: "COUNTER",
      total: 50000,
      lines: {
        create: {
          ...line,
          businessCategoryId: catC,
          total: 50000,
          unitPrice: 50000,
        },
      },
    },
  });
  const report = await productResults(
    admin,
    new URLSearchParams({
      from: "2026-08-01",
      to: "2026-08-31",
      q: prefix,
      businessOrderBy: "margin",
      businessDirection: "asc",
    }),
  );
  const pumps = report.businessCategories.find((r) => r.id === catA)!;
  expect(Number(pumps.cost)).toBe(120000);
  expect(Number(pumps.margin)).toBe(-40000);
  expect(Number(pumps.marginPercent)).toBe(-50);
  expect(
    report.businessCategories.find((r) => r.id === catC)?.margin,
  ).toBeNull();
  const filtered = await productResults(
    admin,
    new URLSearchParams({
      q: prefix,
      businessCategoryId: catA,
      from: "2026-08-01",
      to: "2026-08-31",
    }),
  );
  expect(filtered.businessCategories).toHaveLength(1);
  expect(Number(filtered.categories[0].revenue)).toBe(80000);
  await expect(productResults(office, new URLSearchParams())).rejects.toThrow(
    "permiso",
  );
});
it("allows the restricted application role to read and write categories while keeping them outside the public API", async () => {
  const env = readFileSync(".env.local", "utf8"),
    url = env.match(/^DATABASE_URL=["']?([^\r\n"']+)/m)![1];
  const runtime = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    expect(await runtime.businessCategory.count()).toBeGreaterThan(0);
    const category = await runtime.businessCategory.create({
      data: { name: `${prefix} runtime` },
    });
    await runtime.businessCategory.update({
      where: { id: category.id },
      data: { active: false },
    });
    const result = await db().$queryRaw<
      { readable: boolean; rls: boolean }[]
    >`SELECT has_table_privilege('authenticated','workshop."BusinessCategory"','SELECT') readable, relrowsecurity rls FROM pg_class WHERE oid='workshop."BusinessCategory"'::regclass`;
    expect(result[0]).toEqual({ readable: false, rls: true });
  } finally {
    await runtime.$disconnect();
  }
});

it("imports a category by name and rejects unknown names without reclassifying existing stock", async () => {
  const base = {
    requestId: uuid(),
    locationId,
    note: prefix,
    rows: [
      {
        code: uuid(),
        name: `${prefix} importado`,
        quantity: "2",
        condition: "NEW",
        unitCost: "200",
        categoryName: `${prefix} 0`,
      },
    ],
  };
  await expect(
    previewCount(admin, {
      ...base,
      rows: [{ ...base.rows[0], categoryName: "No existe " + prefix }],
    }),
  ).rejects.toThrow("crea o activa");
  const count = await previewCount(admin, base);
  await applyCount(admin, { requestId: uuid(), countId: count.id });
  expect(
    (
      await db().catalogItem.findUniqueOrThrow({
        where: { code: base.rows[0].code },
      })
    ).businessCategoryId,
  ).toBe(catA);
  await expect(
    previewCount(admin, {
      ...base,
      requestId: uuid(),
      rows: [{ ...base.rows[0], categoryName: `${prefix} 2` }],
    }),
  ).rejects.toThrow("no coincide");
});
it("keeps returned revenue and inventory cost in the original business category", async () => {
  const date = new Date("2026-07-01"),
    sale = await db().sale.create({
      data: {
        customerId,
        locationId,
        actorId: admin.id,
        title: prefix,
        terms: prefix,
        issuedOn: date,
        dueOn: date,
        kind: "COUNTER",
        total: 100,
        lines: {
          create: {
            itemId: partId,
            businessCategoryId: catA,
            description: prefix,
            reference: "",
            kind: "PART",
            condition: "USED",
            quantity: 2,
            unitPrice: 50,
            total: 100,
            materialCost: 60,
          },
        },
      },
      include: { lines: true },
    });
  await db().saleReturn.create({
    data: {
      saleId: sale.id,
      actorId: admin.id,
      amount: 50,
      reason: prefix,
      occurredOn: date,
      lines: {
        create: { saleLineId: sale.lines[0].id, quantity: 1, amount: 50 },
      },
    },
  });
  const result = await productResults(
    admin,
    new URLSearchParams({
      from: "2026-07-01",
      to: "2026-07-31",
      businessCategoryId: catA,
      category: "USED",
      q: prefix,
    }),
  );
  expect(Number(result.businessCategories[0].revenue)).toBe(50);
  expect(Number(result.businessCategories[0].cost)).toBe(30);
  expect(Number(result.businessCategories[0].margin)).toBe(20);
});
