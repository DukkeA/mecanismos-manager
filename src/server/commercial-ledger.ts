import "server-only";
import { assertOpenCash } from "./financial-control";
import Decimal from "decimal.js";
import type { Actor, Tx } from "./commands";
import { DomainError } from "@/domain/errors";
import type { PartCondition } from "@/generated/prisma/client";

export const moneyTotal = (values: { amount: Decimal.Value }[]) =>
  values.reduce((sum, v) => sum.plus(v.amount), new Decimal(0));
export const day = (value: string) => new Date(`${value}T00:00:00Z`);

export async function postStock(
  tx: Tx,
  actor: Actor,
  input: {
    itemId: string;
    locationId: string;
    condition: PartCondition;
    quantity: string;
    kind: string;
    reason: string;
    orderId?: string;
    materialAmount?: string;
    costKnown?: boolean;
  },
) {
  const key = {
    itemId: input.itemId,
    locationId: input.locationId,
    condition: input.condition,
  };
  const item = await tx.catalogItem.findUniqueOrThrow({
    where: { id: input.itemId },
  });
  if (item.kind !== "PART" || item.serialized)
    throw new DomainError("Selecciona un repuesto de inventario por cantidad.");
  const balance = await tx.stockBalance.upsert({
    where: { itemId_locationId_condition: key },
    create: key,
    update: {},
  });
  const qty = new Decimal(input.quantity),
    current = new Decimal(balance.quantity.toString()),
    cost = new Decimal(balance.materialCost.toString());
  if (qty.isZero() || current.plus(qty).lt(balance.reserved.toString()))
    throw new DomainError("No hay existencias disponibles suficientes.");
  const amount =
    input.materialAmount !== undefined
      ? new Decimal(input.materialAmount)
      : qty.isNegative()
        ? qty.abs().eq(current)
          ? cost.negated()
          : cost.mul(qty).div(current).toDecimalPlaces(2)
        : new Decimal(0);
  if (cost.plus(amount).lt(0))
    throw new DomainError(
      "El movimiento dejaría un costo de inventario negativo.",
    );
  const known = qty.isNegative()
    ? balance.costKnown
    : (input.costKnown ?? input.materialAmount !== undefined);
  const nextKnown =
    current.plus(qty).isZero() ||
    (qty.isNegative()
      ? balance.costKnown
      : known && (current.isZero() || balance.costKnown));
  const movement = await tx.stockMovement.create({
    data: {
      ...key,
      costKnown: known,
      quantity: qty.toString(),
      materialAmount: amount.toFixed(2),
      kind: input.kind,
      reason: input.reason,
      orderId: input.orderId,
      actorId: actor.id,
    },
  });
  await tx.stockBalance.update({
    where: { itemId_locationId_condition: key },
    data: {
      costKnown: nextKnown,
      quantity: current.plus(qty).toString(),
      materialCost: cost.plus(amount).toFixed(2),
    },
  });
  return movement;
}

export async function postMoney(
  tx: Tx,
  actor: Actor,
  input: {
    accountId: string;
    amount: string;
    direction: "IN" | "OUT";
    kind: string;
    counterparty: string;
    note: string;
    occurredOn: string;
    reference?: string;
    obligationId?: string;
  },
) {
  await assertOpenCash(tx, input.accountId, input.occurredOn);
  const account = await tx.moneyAccount.findUniqueOrThrow({
    where: { id: input.accountId },
  });
  const amount = new Decimal(input.amount);
  if (!amount.gt(0))
    throw new DomainError("El importe debe ser mayor que cero.");
  const next = new Decimal(account.balance.toString()).plus(
    input.direction === "IN" ? amount : amount.negated(),
  );
  if (next.lt(0)) throw new DomainError("La cuenta no tiene saldo suficiente.");
  const entry = await tx.cashEntry.create({
    data: {
      ...input,
      reference: input.reference ?? "",
      occurredOn: day(input.occurredOn),
      actorId: actor.id,
    },
  });
  await tx.moneyAccount.update({
    where: { id: account.id },
    data: { balance: next.toFixed(2) },
  });
  return entry;
}

export async function releaseAllocations(
  tx: Tx,
  actor: Actor,
  where: { paymentId?: string; saleId?: string },
  note: string,
) {
  const allocations = await tx.paymentAllocation.findMany({
    where: { ...where, reversalOfId: null, reversal: null },
  });
  for (const allocation of allocations)
    await tx.paymentAllocation.create({
      data: {
        paymentId: allocation.paymentId,
        saleId: allocation.saleId,
        actorId: actor.id,
        amount: new Decimal(allocation.amount.toString()).negated().toFixed(2),
        reversalOfId: allocation.id,
        note,
      },
    });
}
