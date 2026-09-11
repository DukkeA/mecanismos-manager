import "server-only";
import { z } from "zod";
import Decimal from "decimal.js";
import { once, type Actor } from "./commands";
import { requirePermission } from "@/domain/permissions";
import { DomainError } from "@/domain/errors";
import { quantity, money, positiveMoney } from "@/domain/commercial";
import { day, postStock, postMoney } from "./commercial-ledger";
const reason = z.string().trim().min(5).max(2000);
const condition = z.enum(["NEW", "USED", "REBUILT"]);
export async function createPurchase(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "inventory:write");
  const input = z
    .object({
      requestId: z.uuid(),
      supplierId: z.uuid(),
      locationId: z.uuid(),
      orderedOn: z.iso.date(),
      dueOn: z.iso.date(),
      reference: z.string().trim().max(200).default(""),
      note: reason,
      lines: z
        .array(
          z.object({ itemId: z.uuid(), quantity, unitCost: money, condition }),
        )
        .min(1)
        .max(100),
    })
    .parse(raw);
  if (input.dueOn < input.orderedOn)
    throw new DomainError("Revisa la fecha de vencimiento.");
  return once(actor, input.requestId, "PURCHASE_CREATED", input, async (tx) => {
    if (
      !(await tx.supplier.findFirst({
        where: { id: input.supplierId, deletedAt: null },
      }))
    )
      throw new DomainError("Selecciona un proveedor activo.");
    const lines = [];
    for (const l of input.lines) {
      const item = await tx.catalogItem.findUniqueOrThrow({
        where: { id: l.itemId },
      });
      if (item.kind !== "PART" || item.serialized)
        throw new DomainError(
          "La compra por cantidad solo admite repuestos sin serie.",
        );
      lines.push({ ...l, description: item.name });
    }
    const purchase = await tx.purchase.create({
      data: {
        supplierId: input.supplierId,
        locationId: input.locationId,
        orderedOn: day(input.orderedOn),
        dueOn: day(input.dueOn),
        reference: input.reference,
        note: input.note,
        actorId: actor.id,
        lines: { create: lines },
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: purchase.id,
        action: "PURCHASE_CREATED",
        details: { number: purchase.number },
      },
    });
    return { id: purchase.id };
  });
}
export async function receivePurchase(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "inventory:write");
  const input = z
    .object({
      requestId: z.uuid(),
      lineId: z.uuid(),
      quantity,
      occurredOn: z.iso.date(),
      reason,
    })
    .parse(raw);
  return once(
    actor,
    input.requestId,
    "PURCHASE_RECEIVED",
    input,
    async (tx) => {
      const line = await tx.purchaseLine.findUniqueOrThrow({
        where: { id: input.lineId },
        include: { purchase: true, receipts: true },
      });
      const received = line.receipts
        .filter((r) => !r.originalId)
        .reduce((s, r) => s.plus(r.quantity.toString()), new Decimal(0));
      if (
        line.purchase.status !== "OPEN" ||
        received.plus(input.quantity).gt(line.quantity.toString())
      )
        throw new DomainError(
          "La recepción supera el pedido pendiente o la compra está cerrada.",
        );
      const value = new Decimal(line.unitCost.toString())
        .mul(input.quantity)
        .toDecimalPlaces(2);
      const movement = await postStock(tx, actor, {
        itemId: line.itemId,
        locationId: line.purchase.locationId,
        condition: line.condition,
        quantity: input.quantity,
        materialAmount: value.toFixed(2),
        kind: "PURCHASE_RECEIPT",
        reason: input.reason,
      });
      const receipt = await tx.purchaseReceipt.create({
        data: {
          lineId: line.id,
          movementId: movement.id,
          quantity: input.quantity,
          amount: value.toFixed(2),
          occurredOn: day(input.occurredOn),
          reason: input.reason,
          actorId: actor.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: line.purchaseId,
          action: "PURCHASE_RECEIVED",
          details: input,
        },
      });
      return { id: receipt.id };
    },
  );
}
export async function returnPurchase(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const input = z
    .object({
      requestId: z.uuid(),
      receiptId: z.uuid(),
      quantity,
      occurredOn: z.iso.date(),
      reason,
    })
    .parse(raw);
  return once(
    actor,
    input.requestId,
    "PURCHASE_RETURNED",
    input,
    async (tx) => {
      const receipt = await tx.purchaseReceipt.findUniqueOrThrow({
        where: { id: input.receiptId },
        include: { line: { include: { purchase: true } } },
      });
      if (receipt.originalId)
        throw new DomainError("Selecciona una recepción original.");
      const returns = await tx.purchaseReceipt.findMany({
          where: { originalId: receipt.id },
        }),
        qty = new Decimal(input.quantity);
      const remaining = new Decimal(receipt.quantity.toString()).plus(
        returns.reduce((s, r) => s.plus(r.quantity.toString()), new Decimal(0)),
      );
      if (qty.gt(remaining))
        throw new DomainError(
          "La cantidad supera lo recibido que falta por devolver.",
        );
      const value = qty.eq(remaining)
        ? new Decimal(receipt.amount.toString()).plus(
            returns.reduce(
              (s, r) => s.plus(r.amount.toString()),
              new Decimal(0),
            ),
          )
        : new Decimal(receipt.amount.toString())
            .mul(qty)
            .div(receipt.quantity.toString())
            .toDecimalPlaces(2);
      const movement = await postStock(tx, actor, {
        itemId: receipt.line.itemId,
        locationId: receipt.line.purchase.locationId,
        condition: receipt.line.condition,
        quantity: qty.negated().toString(),
        materialAmount: value.negated().toFixed(2),
        kind: "PURCHASE_RETURN",
        reason: input.reason,
      });
      const result = await tx.purchaseReceipt.create({
        data: {
          lineId: receipt.lineId,
          originalId: receipt.id,
          movementId: movement.id,
          quantity: qty.negated().toString(),
          amount: value.negated().toFixed(2),
          reason: input.reason,
          occurredOn: day(input.occurredOn),
          actorId: actor.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: receipt.line.purchaseId,
          action: "PURCHASE_RETURNED",
          details: input,
        },
      });
      return { id: result.id };
    },
  );
}
export async function paySupplier(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "finance:write");
  const input = z
    .object({
      requestId: z.uuid(),
      purchaseId: z.uuid(),
      accountId: z.uuid(),
      amount: positiveMoney,
      occurredOn: z.iso.date(),
      refund: z.boolean().default(false),
      reason,
    })
    .parse(raw);
  if (input.refund) requirePermission(actor.role, "members:write");
  return once(actor, input.requestId, "SUPPLIER_PAID", input, async (tx) => {
    const purchase = await tx.purchase.findUniqueOrThrow({
      where: { id: input.purchaseId },
      include: { lines: { include: { receipts: true } }, payments: true },
    });
    const entries = await tx.cashEntry.findMany({
      where: { id: { in: purchase.payments.map((p) => p.entryId) } },
      include: { reversal: true },
    });
    const received = purchase.lines
      .flatMap((l) => l.receipts)
      .reduce((s, r) => s.plus(r.amount.toString()), new Decimal(0));
    const paid = entries
      .filter((e) => !e.reversal)
      .reduce(
        (s, e) =>
          s.plus(
            e.direction === "OUT"
              ? e.amount.toString()
              : new Decimal(e.amount.toString()).negated(),
          ),
        new Decimal(0),
      );
    const available = input.refund
      ? paid.minus(received)
      : received.minus(paid);
    if (available.lt(input.amount))
      throw new DomainError("El importe supera el saldo de la compra.");
    const supplier = await tx.supplier.findUniqueOrThrow({
      where: { id: purchase.supplierId },
    });
    const entry = await postMoney(tx, actor, {
      accountId: input.accountId,
      amount: input.amount,
      direction: input.refund ? "IN" : "OUT",
      kind: input.refund ? "SUPPLIER_REFUND" : "SUPPLIER_PAYMENT",
      counterparty: supplier.name,
      note: input.reason,
      occurredOn: input.occurredOn,
      reference: purchase.reference,
    });
    const result = await tx.supplierPayment.create({
      data: { purchaseId: purchase.id, entryId: entry.id },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: purchase.id,
        action: "SUPPLIER_PAID",
        details: input,
      },
    });
    return { id: result.id };
  });
}
export async function closePurchase(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "inventory:write");
  const input = z
    .object({ requestId: z.uuid(), purchaseId: z.uuid(), reason })
    .parse(raw);
  return once(actor, input.requestId, "PURCHASE_CLOSED", input, async (tx) => {
    const p = await tx.purchase.findUniqueOrThrow({
      where: { id: input.purchaseId },
    });
    if (p.status !== "OPEN")
      throw new DomainError("El pedido ya está cerrado.");
    await tx.purchase.update({
      where: { id: p.id },
      data: { status: "CLOSED" },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: p.id,
        action: "PURCHASE_CLOSED",
        details: input,
      },
    });
    return { id: p.id };
  });
}
