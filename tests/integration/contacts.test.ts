import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { saveCustomer, receiveOrder } from "@/server/operations-service";
import { saveSupplier, saveOffer } from "@/server/inventory-service";
import { deleteContact } from "@/server/contact-service";
import { getOperations } from "@/server/operations-query";
const admin = { id: randomUUID(), role: "ADMIN" as const },
  office = { id: randomUUID(), role: "OFFICE" as const },
  mechanic = { id: randomUUID(), role: "MECHANIC" as const };
const actors = [admin, office, mechanic],
  ids = actors.map((a) => a.id);
let customerId: string,
  supplierId: string,
  orderId: string,
  locationId: string,
  itemId: string;
beforeAll(async () => {
  await db().member.createMany({
    data: actors.map((a) => ({
      ...a,
      name: "Prueba contactos",
      email: `${a.id}@example.invalid`,
    })),
  });
  customerId = (
    await saveCustomer(office, {
      name: "Cliente de integración",
      phone: "6015550100",
    })
  ).id;
  supplierId = (
    await saveSupplier(office, {
      name: "Proveedor de integración",
      phone: "6015550101",
      email: "ventas@example.invalid",
      address: "Calle 10 # 20-30",
    })
  ).id;
  locationId = (
    await db().location.create({
      data: { code: randomUUID().slice(0, 15), name: "Sede de integración" },
    })
  ).id;
  orderId = (
    await db().workOrder.create({
      data: {
        purpose: "CUSTOMER_REPAIR",
        title: "Revisión de bomba",
        reportedProblem: "Fuga de combustible",
        locationId,
        customerId,
      },
    })
  ).id;
  itemId = (
    await db().catalogItem.create({
      data: {
        code: randomUUID(),
        name: "Repuesto integración",
        kind: "PART",
        unit: "unidad",
      },
    })
  ).id;
  await saveOffer(office, {
    supplierId,
    itemId,
    condition: "NEW",
    unitCost: "1500",
    reportedStock: "Dos unidades",
    observedAt: "2026-09-10",
    evidence: "Consulta de integración",
  });
});
afterAll(async () => {
  await db().auditEvent.deleteMany({ where: { actorId: { in: ids } } });
  await db().commandReceipt.deleteMany({ where: { actorId: { in: ids } } });
  if (orderId) await db().workOrder.delete({ where: { id: orderId } });
  if (customerId) await db().customer.delete({ where: { id: customerId } });
  if (supplierId) {
    await db().supplierOffer.deleteMany({ where: { supplierId } });
    await db().supplier.delete({ where: { id: supplierId } });
  }
  if (itemId) await db().catalogItem.delete({ where: { id: itemId } });
  if (locationId) await db().location.delete({ where: { id: locationId } });
  await db().member.deleteMany({ where: { id: { in: ids } } });
  await db().$disconnect();
});
it("edits supplier contact fields without creating another supplier", async () => {
  const input = {
    id: supplierId,
    name: "Proveedor actualizado",
    phone: "6015550102",
    email: "oficina@example.invalid",
    address: "Carrera 15 # 22-10",
  };
  expect((await saveSupplier(office, input)).id).toBe(supplierId);
  expect(
    (await getOperations(admin)).suppliers.find((s) => s.id === supplierId),
  ).toMatchObject(input);
  await expect(
    saveSupplier(office, { ...input, email: "no-es-correo" }),
  ).rejects.toThrow();
  await expect(saveSupplier(mechanic, input)).rejects.toThrow("permiso");
});
it("deletes a supplier once, retains historical prices and rejects new prices", async () => {
  const input = {
    id: supplierId,
    requestId: randomUUID(),
    reason: "Proveedor duplicado",
  };
  await expect(deleteContact(office, "supplier", input)).rejects.toThrow(
    "permiso",
  );
  expect(await deleteContact(admin, "supplier", input)).toEqual(
    await deleteContact(admin, "supplier", input),
  );
  expect(await db().supplierOffer.count({ where: { supplierId } })).toBe(1);
  expect(
    (await getOperations(admin)).suppliers.find((s) => s.id === supplierId)
      ?.deletedAt,
  ).toBeTruthy();
  await expect(
    saveOffer(office, {
      supplierId,
      itemId,
      condition: "NEW",
      unitCost: "1700",
      reportedStock: "Dos",
      observedAt: "2026-09-10",
      evidence: "Consulta nueva",
    }),
  ).rejects.toThrow("eliminado");
  await expect(
    saveSupplier(office, {
      id: supplierId,
      name: "Intento de edición",
      phone: "",
    }),
  ).rejects.toThrow();
});
it("retains a deleted customer's orders and rejects stale selection", async () => {
  const input = {
    id: customerId,
    requestId: randomUUID(),
    reason: "Cliente duplicado",
  };
  await expect(deleteContact(mechanic, "customer", input)).rejects.toThrow(
    "permiso",
  );
  await deleteContact(admin, "customer", input);
  expect(
    (
      await db().workOrder.findUniqueOrThrow({
        where: { id: orderId },
        include: { customer: true },
      })
    ).customer?.name,
  ).toBe("Cliente de integración");
  await expect(
    saveCustomer(office, { id: customerId, name: "Otro nombre" }),
  ).rejects.toThrow();
  await expect(
    receiveOrder(office, {
      requestId: randomUUID(),
      customerId,
      locationId,
      kind: "COMPONENT",
      reference: "BOM-01",
      title: "Revisión de bomba",
      problem: "Fuga de combustible",
    }),
  ).rejects.toThrow("eliminado");
});
