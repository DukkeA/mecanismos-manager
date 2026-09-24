import { assertCategory } from "./category-service";
import { DomainError } from "@/domain/errors";
import "server-only";
import { z } from "zod";
import Decimal from "decimal.js";
import { db } from "./db";
import { once, type Actor } from "./commands";
import { requirePermission } from "@/domain/permissions";
import { catalogLabelKey, cleanCatalogLabel } from "@/domain/catalog-label";
import { serializable } from "./commands";

const quantity = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,3})?$/)
  .refine((v) => new Decimal(v).gt(0), "La cantidad debe ser positiva.");
const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
const optionalPrice = z
  .union([money, z.literal(""), z.null()])
  .optional()
  .transform((value) => (value === "" || value === undefined ? null : value));
export async function saveItem(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "inventory:write");
  const input = z
    .object({
      id: z.uuid().optional(),
      businessCategoryId: z.uuid().nullable().optional(),
      code: z.string().trim().min(1).max(80),
      name: z.string().trim().min(3).max(200),
      brand: z.string().trim().max(100).default(""),
      kind: z.enum(["PART", "SERVICE"]),
      unit: z.string().trim().min(1).max(30).default("servicio"),
      reference: z.string().trim().max(200).default(""),
      purchasePrice: optionalPrice,
      salePrice: optionalPrice,
      notes: z.string().trim().max(5000).default(""),
    })
    .parse(raw);
  if (input.kind === "SERVICE") {
    input.name = cleanCatalogLabel(input.name);
    input.purchasePrice = null;
  }
  return serializable(async (tx) => {
    if (input.kind === "SERVICE") {
      const duplicate = await tx.$queryRaw<{ id: string; name: string }[]>`
        SELECT id, name FROM workshop."CatalogItem"
        WHERE kind = 'SERVICE' AND workshop.catalog_label_key(name) = ${catalogLabelKey(input.name)}
          AND id <> ${input.id ?? "00000000-0000-0000-0000-000000000000"}::uuid LIMIT 1`;
      if (duplicate.length)
        throw new DomainError(
          `Ya existe el servicio «${duplicate[0].name}». Puedes editarlo desde Servicios.`,
        );
    }
    if (input.id) {
      const current = await tx.catalogItem.findUniqueOrThrow({
        where: { id: input.id },
      });
      if (current.kind !== input.kind)
        throw new DomainError(
          "No se puede convertir un repuesto en servicio ni un servicio en repuesto.",
        );
    }
    await assertCategory(
      tx,
      input.businessCategoryId,
      input.id
        ? (await tx.catalogItem.findUniqueOrThrow({ where: { id: input.id } }))
            .businessCategoryId
        : null,
    );
    const item = input.id
      ? await tx.catalogItem.update({ where: { id: input.id }, data: input })
      : await tx.catalogItem.create({ data: input });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: item.id,
        action: input.id ? "ITEM_UPDATED" : "ITEM_CREATED",
        details: {
          code: item.code,
          reference: item.reference,
          purchasePrice: item.purchasePrice?.toFixed(2) ?? null,
          salePrice: item.salePrice?.toFixed(2) ?? null,
          kind: item.kind,
          businessCategoryId: item.businessCategoryId,
        },
      },
    });
    return { id: item.id };
  });
}

export async function saveSupplier(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "inventory:write");
  const input = z
    .object({
      id: z.uuid().optional(),
      categoryIds: z.array(z.uuid()).max(50).optional(),
      email: z.union([z.email(), z.literal("")]).default(""),
      address: z.string().trim().max(300).default(""),
      name: z.string().trim().min(2).max(180),
      phone: z.string().trim().max(40),
    })
    .parse(raw);
  return db().$transaction(async (tx) => {
    const { categoryIds, ...data } = input;
    const previous = input.id
      ? await tx.supplierCategory.findMany({ where: { supplierId: input.id } })
      : [];
    for (const categoryId of categoryIds ?? [])
      await assertCategory(
        tx,
        categoryId,
        previous.some((c) => c.categoryId === categoryId) ? categoryId : null,
      );
    const supplier = input.id
      ? await tx.supplier.update({
          where: { id: input.id, deletedAt: null },
          data,
        })
      : await tx.supplier.create({ data });
    if (categoryIds) {
      await tx.supplierCategory.deleteMany({
        where: { supplierId: supplier.id },
      });
      await tx.supplierCategory.createMany({
        data: [...new Set(categoryIds)].map((categoryId) => ({
          supplierId: supplier.id,
          categoryId,
        })),
      });
    }
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: supplier.id,
        action: input.id ? "SUPPLIER_UPDATED" : "SUPPLIER_CREATED",
        details: {
          name: supplier.name,
          categoryIds: categoryIds ?? previous.map((c) => c.categoryId),
        },
      },
    });
    return { id: supplier.id };
  });
}

export async function saveOffer(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "inventory:write");
  const input = z
    .object({
      itemId: z.uuid(),
      supplierId: z.uuid(),
      condition: z.enum(["NEW", "USED", "REBUILT"]),
      unitCost: money,
      reportedStock: z.string().trim().max(120),
      observedAt: z.iso.date(),
      evidence: z.string().trim().min(3).max(1000),
    })
    .parse(raw);
  return db().$transaction(async (tx) => {
    if (
      !(await tx.supplier.findFirst({
        where: { id: input.supplierId, deletedAt: null },
      }))
    )
      throw new DomainError(
        "El proveedor fue eliminado. Selecciona otro proveedor.",
      );
    const offer = await tx.supplierOffer.create({
      data: { ...input, observedAt: new Date(input.observedAt + "T12:00:00Z") },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: offer.id,
        action: "OFFER_RECORDED",
        details: { itemId: input.itemId, supplierId: input.supplierId },
      },
    });
    return { id: offer.id };
  });
}

export async function moveStock(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "inventory:write");
  const input = z
    .object({
      requestId: z.uuid(),
      itemId: z.uuid(),
      locationId: z.uuid(),
      condition: z.enum(["NEW", "USED", "REBUILT"]),
      quantity,
      unitCost: money.default("0"),
      kind: z.enum([
        "RECEIPT",
        "CONSUMPTION",
        "ADJUSTMENT_IN",
        "ADJUSTMENT_OUT",
      ]),
      orderId: z.uuid().optional(),
      reason: z.string().trim().min(3).max(1000),
    })
    .parse(raw);
  if (input.kind.startsWith("ADJUSTMENT") && actor.role !== "ADMIN")
    throw new DomainError("Solo administración puede ajustar existencias.");
  if (input.kind === "CONSUMPTION" && !input.orderId)
    throw new DomainError("El consumo requiere una orden.");
  return once(actor, input.requestId, "STOCK_MOVED", input, async (tx) => {
    const item = await tx.catalogItem.findUniqueOrThrow({
      where: { id: input.itemId },
    });
    if (item.kind !== "PART" || item.serialized)
      throw new DomainError(
        "Este movimiento solo admite repuestos de inventario por cantidad.",
      );
    await tx.location.findUniqueOrThrow({ where: { id: input.locationId } });
    if (input.orderId) {
      const order = await tx.workOrder.findUniqueOrThrow({
        where: { id: input.orderId },
      });
      if (["CLOSED", "CANCELLED"].includes(order.status))
        throw new DomainError("No puedes consumir en una orden cerrada.");
    }
    const key = {
      itemId: input.itemId,
      locationId: input.locationId,
      condition: input.condition,
    };
    const balance = await tx.stockBalance.upsert({
      where: { itemId_locationId_condition: key },
      create: key,
      update: {},
    });
    const incoming = ["RECEIPT", "ADJUSTMENT_IN"].includes(input.kind);
    const qty = new Decimal(input.quantity);
    const currentQty = new Decimal(balance.quantity.toString());
    const value = new Decimal(balance.materialCost.toString());
    if (!incoming && currentQty.minus(balance.reserved.toString()).lt(qty))
      throw new DomainError("No hay existencias disponibles suficientes.");
    const amount = incoming
      ? qty.mul(input.unitCost).toDecimalPlaces(2)
      : qty.eq(currentQty)
        ? value
        : value.mul(qty).div(currentQty).toDecimalPlaces(2);
    const signedQty = incoming ? qty : qty.negated();
    const signedValue = incoming ? amount : amount.negated();
    const movement = await tx.stockMovement.create({
      data: {
        ...key,
        costKnown: incoming ? true : balance.costKnown,
        quantity: signedQty.toString(),
        materialAmount: signedValue.toFixed(2),
        kind: input.kind,
        reason: input.reason,
        actorId: actor.id,
        orderId: input.orderId,
      },
    });
    await tx.stockBalance.update({
      where: { itemId_locationId_condition: key },
      data: {
        costKnown: currentQty.isZero() ? true : balance.costKnown,
        quantity: currentQty.plus(signedQty).toString(),
        materialCost: value.plus(signedValue).toFixed(2),
      },
    });
    if (input.kind === "RECEIPT" && new Decimal(input.unitCost).gt(0)) {
      await tx.catalogItem.update({
        where: { id: item.id },
        data: { purchasePrice: input.unitCost },
      });
    }
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: movement.id,
        action: "STOCK_MOVED",
        details: {
          itemId: item.id,
          costKnown: incoming ? true : balance.costKnown,
          quantity: signedQty.toString(),
          kind: input.kind,
          purchasePriceUpdated:
            input.kind === "RECEIPT" && new Decimal(input.unitCost).gt(0),
        },
      },
    });
    return { id: movement.id };
  });
}

export async function reverseMovement(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const input = z
    .object({
      requestId: z.uuid(),
      movementId: z.uuid(),
      reason: z.string().trim().min(5).max(1000),
    })
    .parse(raw);
  return once(actor, input.requestId, "STOCK_REVERSED", input, async (tx) => {
    const original = await tx.stockMovement.findUniqueOrThrow({
      where: { id: input.movementId },
    });
    if (
      original.reversalOfId ||
      (await tx.stockMovement.findUnique({
        where: { reversalOfId: original.id },
      }))
    )
      throw new DomainError(
        "Ese movimiento ya fue revertido o es una reversión.",
      );
    if (
      !["RECEIPT", "CONSUMPTION", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"].includes(
        original.kind,
      )
    )
      throw new DomainError(
        "Corrige este movimiento desde el documento de venta, compra, traslado o conteo que lo generó.",
      );
    if (original.orderId) {
      const order = await tx.workOrder.findUniqueOrThrow({
        where: { id: original.orderId },
      });
      if (["CLOSED", "CANCELLED"].includes(order.status))
        throw new DomainError(
          "La orden está cerrada; requiere un ajuste de período revisado.",
        );
    }
    const key = {
      itemId: original.itemId,
      locationId: original.locationId,
      condition: original.condition,
    };
    const balance = await tx.stockBalance.findUniqueOrThrow({
      where: { itemId_locationId_condition: key },
    });
    const nextQty = new Decimal(balance.quantity.toString()).minus(
      original.quantity.toString(),
    );
    const nextValue = new Decimal(balance.materialCost.toString()).minus(
      original.materialAmount.toString(),
    );
    if (
      nextQty.lt(balance.reserved.toString()) ||
      nextValue.lt(0) ||
      (nextQty.eq(0) && !nextValue.eq(0))
    )
      throw new DomainError(
        "No es posible revertir después de los movimientos posteriores. Revisa un ajuste.",
      );
    const movement = await tx.stockMovement.create({
      data: {
        ...key,
        quantity: new Decimal(original.quantity.toString())
          .negated()
          .toString(),
        materialAmount: new Decimal(original.materialAmount.toString())
          .negated()
          .toString(),
        costKnown: original.costKnown,
        kind: "REVERSAL",
        reason: input.reason,
        actorId: actor.id,
        orderId: original.orderId,
        reversalOfId: original.id,
      },
    });
    await tx.stockBalance.update({
      where: { itemId_locationId_condition: key },
      data: {
        quantity: nextQty.toString(),
        materialCost: nextValue.toFixed(2),
        costKnown: nextQty.eq(0) || (balance.costKnown && original.costKnown),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: movement.id,
        action: "STOCK_REVERSED",
        details: { originalId: original.id },
      },
    });
    return { id: movement.id };
  });
}
