import "server-only";
import { z } from "zod";
import Decimal from "decimal.js";
import { once, type Actor, type Tx } from "./commands";
import { requirePermission } from "@/domain/permissions";
import { DomainError } from "@/domain/errors";
import { positiveMoney } from "@/domain/commercial";
import { postMoney } from "./commercial-ledger";
import { validateCustomerOrder } from "./quote-service";

export async function paymentState(tx: Tx, id: string) {
  const payment = await tx.customerPayment.findUniqueOrThrow({
    where: { id },
    include: {
      entry: { include: { reversal: true } },
      allocations: true,
      refunds: { include: { entry: { include: { reversal: true } } } },
    },
  });
  const used = payment.allocations.reduce(
    (s, a) => s.plus(a.amount.toString()),
    new Decimal(0),
  );
  const refunded = payment.refunds
    .filter((r) => !r.entry.reversal)
    .reduce((s, r) => s.plus(r.entry.amount.toString()), new Decimal(0));
  const available =
    payment.entry.reversal || payment.entry.direction !== "IN"
      ? new Decimal(0)
      : new Decimal(payment.entry.amount.toString())
          .minus(used)
          .minus(refunded);
  return { payment, available };
}
export async function allocate(
  tx: Tx,
  actor: Actor,
  paymentId: string,
  saleId: string,
  amount: string,
  note: string,
) {
  const { payment, available } = await paymentState(tx, paymentId);
  const sale = await tx.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: { allocations: true, returns: true },
  });
  if (sale.customerId !== payment.customerId || sale.status !== "ISSUED")
    throw new DomainError("Selecciona una venta vigente del mismo cliente.");
  const paid = sale.allocations.reduce(
    (s, a) => s.plus(a.amount.toString()),
    new Decimal(0),
  );
  const credit = sale.returns.reduce(
    (s, r) => s.plus(r.amount.toString()),
    new Decimal(0),
  );
  const pending = new Decimal(sale.total.toString()).minus(credit).minus(paid);
  if (!new Decimal(amount).gt(0) || available.lt(amount) || pending.lt(amount))
    throw new DomainError(
      "El importe supera el anticipo disponible o el saldo de la venta.",
    );
  return tx.paymentAllocation.create({
    data: { paymentId, saleId, amount, actorId: actor.id, note },
  });
}
export async function receivePayment(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "finance:write");
  const input = z
    .object({
      requestId: z.uuid(),
      customerId: z.uuid(),
      accountId: z.uuid().optional(),
      existingEntryId: z.uuid().optional(),
      saleId: z.uuid().optional(),
      amount: positiveMoney,
      occurredOn: z.iso.date(),
      reference: z.string().trim().max(200).default(""),
      note: z.string().trim().min(3).max(1000),
    })
    .parse(raw);
  return once(actor, input.requestId, "PAYMENT_RECEIVED", input, async (tx) => {
    const customer = await validateCustomerOrder(tx, input.customerId);
    const existing = input.existingEntryId
      ? await tx.cashEntry.findUniqueOrThrow({
          where: { id: input.existingEntryId },
          include: { reversal: true, customerPayment: true },
        })
      : null;
    if (
      existing &&
      (existing.direction !== "IN" ||
        !["CUSTOMER_PAYMENT", "CUSTOMER_ADVANCE"].includes(existing.kind) ||
        existing.reversal ||
        existing.reversalOfId ||
        existing.customerPayment ||
        !new Decimal(existing.amount.toString()).eq(input.amount))
    )
      throw new DomainError(
        "El movimiento ya fue vinculado, revertido o no corresponde a un cobro de ese importe.",
      );
    if (!existing && !input.accountId)
      throw new DomainError("Selecciona la cuenta que recibió el dinero.");
    const entry =
      existing ??
      (await postMoney(tx, actor, {
        accountId: input.accountId!,
        amount: input.amount,
        direction: "IN",
        kind: input.saleId ? "CUSTOMER_PAYMENT" : "CUSTOMER_ADVANCE",
        counterparty: customer.name,
        note: input.note,
        reference: input.reference,
        occurredOn: input.occurredOn,
      }));
    const payment = await tx.customerPayment.create({
      data: { customerId: customer.id, entryId: entry.id },
    });
    if (input.saleId)
      await allocate(
        tx,
        actor,
        payment.id,
        input.saleId,
        input.amount,
        input.note,
      );
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: payment.id,
        action: "PAYMENT_RECEIVED",
        details: { ...input, entryId: entry.id, linkedExisting: !!existing },
      },
    });
    return { id: payment.id };
  });
}
export async function applyPayment(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "finance:write");
  const input = z
    .object({
      requestId: z.uuid(),
      paymentId: z.uuid(),
      saleId: z.uuid(),
      amount: positiveMoney,
      note: z.string().trim().min(3).max(1000),
    })
    .parse(raw);
  return once(actor, input.requestId, "PAYMENT_APPLIED", input, async (tx) => {
    const allocation = await allocate(
      tx,
      actor,
      input.paymentId,
      input.saleId,
      input.amount,
      input.note,
    );
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: input.saleId,
        action: "PAYMENT_APPLIED",
        details: input,
      },
    });
    return { id: allocation.id };
  });
}
export async function unapplyPayment(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const input = z
    .object({
      requestId: z.uuid(),
      allocationId: z.uuid(),
      reason: z.string().trim().min(5).max(1000),
    })
    .parse(raw);
  return once(
    actor,
    input.requestId,
    "PAYMENT_UNAPPLIED",
    input,
    async (tx) => {
      const original = await tx.paymentAllocation.findUniqueOrThrow({
        where: { id: input.allocationId },
        include: { reversal: true },
      });
      if (original.reversal || original.reversalOfId)
        throw new DomainError("Esta aplicación ya fue revertida.");
      const entry = await tx.paymentAllocation.create({
        data: {
          paymentId: original.paymentId,
          saleId: original.saleId,
          amount: new Decimal(original.amount.toString()).negated().toFixed(2),
          actorId: actor.id,
          reversalOfId: original.id,
          note: input.reason,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: original.saleId,
          action: "PAYMENT_UNAPPLIED",
          details: input,
        },
      });
      return { id: entry.id };
    },
  );
}
export async function refundPayment(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const input = z
    .object({
      requestId: z.uuid(),
      paymentId: z.uuid(),
      accountId: z.uuid(),
      amount: positiveMoney,
      occurredOn: z.iso.date(),
      reason: z.string().trim().min(5).max(1000),
    })
    .parse(raw);
  return once(actor, input.requestId, "PAYMENT_REFUNDED", input, async (tx) => {
    const { payment, available } = await paymentState(tx, input.paymentId);
    if (available.lt(input.amount))
      throw new DomainError("No hay saldo a favor suficiente para devolver.");
    const customer = await tx.customer.findUniqueOrThrow({
      where: { id: payment.customerId },
    });
    const entry = await postMoney(tx, actor, {
      accountId: input.accountId,
      amount: input.amount,
      direction: "OUT",
      kind: "CUSTOMER_REFUND",
      counterparty: customer.name,
      note: input.reason,
      occurredOn: input.occurredOn,
    });
    const refund = await tx.customerPayment.create({
      data: {
        customerId: customer.id,
        entryId: entry.id,
        refundOfId: payment.id,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: payment.id,
        action: "PAYMENT_REFUNDED",
        details: input,
      },
    });
    return { id: refund.id };
  });
}
