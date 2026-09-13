import "server-only";
import { z } from "zod";
import Decimal from "decimal.js";
import { once, type Actor } from "./commands";
import { requirePermission } from "@/domain/permissions";
import { DomainError } from "@/domain/errors";
import { quantity, money } from "@/domain/commercial";
import { postStock } from "./commercial-ledger";
const condition = z.enum(["NEW", "USED", "REBUILT"]),
  reason = z.string().trim().min(5).max(2000);
export async function reserveStock(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "inventory:write");
  const input = z
    .object({
      requestId: z.uuid(),
      itemId: z.uuid(),
      locationId: z.uuid(),
      condition,
      orderId: z.uuid(),
      quantity,
    })
    .parse(raw);
  return once(actor, input.requestId, "STOCK_RESERVED", input, async (tx) => {
    const order = await tx.workOrder.findUniqueOrThrow({
      where: { id: input.orderId },
    });
    if (["CLOSED", "CANCELLED"].includes(order.status))
      throw new DomainError("La orden no admite reservas.");
    const key = {
        itemId: input.itemId,
        locationId: input.locationId,
        condition: input.condition,
      },
      stock = await tx.stockBalance.findUniqueOrThrow({
        where: { itemId_locationId_condition: key },
      });
    if (
      new Decimal(stock.quantity.toString())
        .minus(stock.reserved.toString())
        .lt(input.quantity)
    )
      throw new DomainError("No hay existencias disponibles suficientes.");
    const result = await tx.stockReservation.create({
      data: {
        ...key,
        orderId: input.orderId,
        quantity: input.quantity,
        actorId: actor.id,
      },
    });
    await tx.stockBalance.update({
      where: { itemId_locationId_condition: key },
      data: { reserved: { increment: input.quantity } },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: input.orderId,
        action: "STOCK_RESERVED",
        details: input,
      },
    });
    return { id: result.id };
  });
}
export async function finishReservation(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "inventory:write");
  const input = z
    .object({
      requestId: z.uuid(),
      reservationId: z.uuid(),
      action: z.enum(["RELEASE", "CONSUME"]),
      reason,
    })
    .parse(raw);
  return once(
    actor,
    input.requestId,
    "RESERVATION_FINISHED",
    input,
    async (tx) => {
      const r = await tx.stockReservation.findUniqueOrThrow({
        where: { id: input.reservationId },
      });
      if (r.status !== "ACTIVE")
        throw new DomainError("La reserva ya fue consumida o liberada.");
      const order = await tx.workOrder.findUniqueOrThrow({
        where: { id: r.orderId },
      });
      if (
        input.action === "CONSUME" &&
        ["CLOSED", "CANCELLED"].includes(order.status)
      )
        throw new DomainError("No puedes consumir en una orden cerrada.");
      await tx.stockBalance.update({
        where: {
          itemId_locationId_condition: {
            itemId: r.itemId,
            locationId: r.locationId,
            condition: r.condition,
          },
        },
        data: { reserved: { decrement: r.quantity } },
      });
      const movement =
        input.action === "CONSUME"
          ? await postStock(tx, actor, {
              itemId: r.itemId,
              locationId: r.locationId,
              condition: r.condition,
              orderId: r.orderId,
              quantity: new Decimal(r.quantity.toString()).negated().toString(),
              kind: "CONSUMPTION",
              reason: input.reason,
            })
          : null;
      await tx.stockReservation.update({
        where: { id: r.id },
        data: {
          status: input.action === "CONSUME" ? "CONSUMED" : "RELEASED",
          movementId: movement?.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: r.orderId,
          action: "RESERVATION_FINISHED",
          details: input,
        },
      });
      return { id: r.id };
    },
  );
}
export async function transferStock(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "inventory:write");
  const input = z
    .object({
      requestId: z.uuid(),
      itemId: z.uuid(),
      sourceId: z.uuid(),
      destinationId: z.uuid(),
      condition,
      quantity,
      reason,
    })
    .parse(raw);
  if (input.sourceId === input.destinationId)
    throw new DomainError("Selecciona una sede diferente.");
  return once(
    actor,
    input.requestId,
    "STOCK_TRANSFERRED",
    input,
    async (tx) => {
      const out = await postStock(tx, actor, {
        itemId: input.itemId,
        locationId: input.sourceId,
        condition: input.condition,
        quantity: new Decimal(input.quantity).negated().toString(),
        kind: "TRANSFER_OUT",
        reason: input.reason,
      });
      const into = await postStock(tx, actor, {
        itemId: input.itemId,
        locationId: input.destinationId,
        condition: input.condition,
        quantity: input.quantity,
        materialAmount: new Decimal(out.materialAmount.toString())
          .negated()
          .toFixed(2),
        costKnown: out.costKnown,
        kind: "TRANSFER_IN",
        reason: input.reason,
      });
      const result = await tx.stockTransfer.create({
        data: { outboundId: out.id, inboundId: into.id, actorId: actor.id },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: result.id,
          action: "STOCK_TRANSFERRED",
          details: input,
        },
      });
      return { id: result.id };
    },
  );
}
export const countRow = z.object({
  categoryName: z.string().trim().max(100).optional(),
  businessCategoryId: z.uuid().optional(),
  code: z.string().trim().min(1).max(80),
  reference: z.string().trim().max(200).default(""),
  name: z.string().trim().min(3).max(200),
  condition,
  quantity: z.string().regex(/^\d{1,10}(\.\d{1,3})?$/),
  unitCost: money.optional(),
});
export async function previewCount(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const input = z
    .object({
      requestId: z.uuid(),
      locationId: z.uuid(),
      note: reason,
      rows: z.array(countRow).min(1).max(2000),
    })
    .parse(raw);
  return once(actor, input.requestId, "COUNT_PREVIEWED", input, async (tx) => {
    const errors: string[] = [];
    const seen = new Set<string>(),
      refs = new Map<string, string>();
    for (const [i, r] of input.rows.entries()) {
      const key = `${r.code.toUpperCase()}-${r.condition}`,
        ref = r.reference.toUpperCase();
      if (seen.has(key))
        errors.push(`Fila ${i + 1}: código y condición repetidos.`);
      seen.add(key);
      if (ref && refs.has(ref) && refs.get(ref) !== r.code.toUpperCase())
        errors.push(`Fila ${i + 1}: referencia asociada a dos códigos.`);
      if (ref) refs.set(ref, r.code.toUpperCase());
      const item = await tx.catalogItem.findFirst({
        where: { code: { equals: r.code, mode: "insensitive" } },
      });
      if (item) r.code = item.code;
      if (r.categoryName) {
        const category = await tx.businessCategory.findFirst({
          where: {
            name: { equals: r.categoryName, mode: "insensitive" },
            active: true,
          },
        });
        if (!category)
          errors.push(
            `Fila ${i + 1}: crea o activa la categoría "${r.categoryName}" en Configuración.`,
          );
        else r.businessCategoryId = category.id;
      }
      if (r.businessCategoryId) {
        const category = await tx.businessCategory.findUnique({
          where: { id: r.businessCategoryId },
        });
        if (!category?.active)
          errors.push(`Fila ${i + 1}: la categoría no está activa.`);
        if (item && item.businessCategoryId !== r.businessCategoryId)
          errors.push(
            `Fila ${i + 1}: la categoría no coincide con el catálogo. Edita el repuesto antes de contar.`,
          );
      }
      if (item && (item.kind !== "PART" || item.serialized))
        errors.push(
          `Fila ${i + 1}: el código pertenece a un servicio o unidad serializada.`,
        );
      if (
        ref &&
        (await tx.catalogItem.findFirst({
          where: {
            reference: { equals: r.reference, mode: "insensitive" },
            code: { not: r.code },
          },
        }))
      )
        errors.push(`Fila ${i + 1}: esa referencia ya existe con otro código.`);
    }
    if (errors.length) throw new DomainError(errors.slice(0, 20).join("\n"));
    const count = await tx.inventoryCount.create({
      data: {
        locationId: input.locationId,
        rows: input.rows,
        note: input.note,
        actorId: actor.id,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: count.id,
        action: "COUNT_PREVIEWED",
        details: { rows: input.rows.length },
      },
    });
    return { id: count.id };
  });
}
export async function applyCount(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const input = z.object({ requestId: z.uuid(), countId: z.uuid() }).parse(raw);
  return once(actor, input.requestId, "COUNT_APPLIED", input, async (tx) => {
    const count = await tx.inventoryCount.findUniqueOrThrow({
      where: { id: input.countId },
    });
    if (count.status !== "DRAFT")
      throw new DomainError("El conteo ya fue aplicado.");
    const rows = z.array(countRow).parse(count.rows);
    for (const row of rows) {
      if (
        row.businessCategoryId &&
        !(await tx.businessCategory.findFirst({
          where: { id: row.businessCategoryId, active: true },
        }))
      )
        throw new DomainError(
          "Una categoría cambió. Prepara una vista previa nueva.",
        );
      const item = await tx.catalogItem.upsert({
        where: { code: row.code },
        create: {
          code: row.code,
          name: row.name,
          reference: row.reference,
          businessCategoryId: row.businessCategoryId,
          kind: "PART",
          unit: "unidad",
        },
        update: {},
      });
      if (
        row.businessCategoryId &&
        item.businessCategoryId !== row.businessCategoryId
      )
        throw new DomainError(
          "La categoría del repuesto cambió. Prepara una vista previa nueva.",
        );
      if (item.kind !== "PART" || item.serialized)
        throw new DomainError(
          "El catálogo cambió. Prepara una vista previa nueva.",
        );
      if (
        await tx.stockMovement.findFirst({
          where: {
            itemId: item.id,
            locationId: count.locationId,
            createdAt: { gte: count.cutoffAt },
          },
        })
      )
        throw new DomainError(
          `Hubo movimientos de ${row.code} después de la vista previa. Repite el conteo.`,
        );
      const key = {
        itemId: item.id,
        locationId: count.locationId,
        condition: row.condition,
      };
      const stock = await tx.stockBalance.upsert({
        where: { itemId_locationId_condition: key },
        create: key,
        update: {},
      });
      const qty = new Decimal(row.quantity),
        delta = qty.minus(stock.quantity.toString());
      if (qty.lt(stock.reserved.toString()))
        throw new DomainError(
          `${row.code}: el conteo es menor que las reservas activas.`,
        );
      const amount =
        row.unitCost !== undefined
          ? qty
              .mul(row.unitCost)
              .toDecimalPlaces(2)
              .minus(stock.materialCost.toString())
          : delta.isNegative()
            ? new Decimal(stock.materialCost.toString())
                .mul(delta)
                .div(stock.quantity.toString())
                .toDecimalPlaces(2)
            : new Decimal(0);
      const costKnown =
        row.unitCost !== undefined || (delta.lte(0) && stock.costKnown);
      // A value-only adjustment still needs a ledger entry, even when quantity is unchanged.
      if (!delta.isZero() || !amount.isZero()) {
        await tx.stockMovement.create({
          data: {
            ...key,
            costKnown,
            quantity: delta.toString(),
            materialAmount: amount.toFixed(2),
            kind: "COUNT",
            reason: count.note,
            actorId: actor.id,
          },
        });
        await tx.stockBalance.update({
          where: { itemId_locationId_condition: key },
          data: {
            costKnown,
            quantity: qty.toString(),
            materialCost: new Decimal(stock.materialCost.toString())
              .plus(amount)
              .toFixed(2),
          },
        });
      } else if (stock.costKnown !== costKnown)
        await tx.stockBalance.update({
          where: { itemId_locationId_condition: key },
          data: { costKnown },
        });
    }
    await tx.inventoryCount.update({
      where: { id: count.id },
      data: { status: "APPLIED", appliedAt: new Date() },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: count.id,
        action: "COUNT_APPLIED",
        details: { rows: rows.length },
      },
    });
    return { id: count.id };
  });
}
