import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import Decimal from "decimal.js";
import { once, type Actor, type Tx } from "./commands";
import { requirePermission } from "@/domain/permissions";
import { DomainError } from "@/domain/errors";

export async function transferCash(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "finance:write");
  const input = z
    .object({
      requestId: z.uuid(),
      sourceAccountId: z.uuid(),
      destinationAccountId: z.uuid(),
      amount: z
        .string()
        .regex(/^\d{1,12}(\.\d{1,2})?$/)
        .refine((v) => new Decimal(v).gt(0)),
      occurredOn: z.iso.date(),
      reference: z.string().trim().max(200).default(""),
      note: z.string().trim().min(3).max(1000),
    })
    .parse(raw);
  if (input.sourceAccountId === input.destinationAccountId)
    throw new DomainError(
      "Selecciona una cuenta de destino diferente al origen.",
    );
  return once(actor, input.requestId, "CASH_TRANSFERRED", input, async (tx) => {
    const source = await tx.moneyAccount.findUniqueOrThrow({
      where: { id: input.sourceAccountId },
    });
    const destination = await tx.moneyAccount.findUniqueOrThrow({
      where: { id: input.destinationAccountId },
    });
    const debit = new Decimal(source.balance.toString()).minus(input.amount);
    if (debit.lt(0))
      throw new DomainError("La cuenta de origen no tiene saldo suficiente.");
    const balances = [
      { id: source.id, balance: debit.toFixed(2) },
      {
        id: destination.id,
        balance: new Decimal(destination.balance.toString())
          .plus(input.amount)
          .toFixed(2),
      },
    ];
    for (const account of balances.sort((a, b) => a.id.localeCompare(b.id)))
      await tx.moneyAccount.update({
        where: { id: account.id },
        data: { balance: account.balance },
      });
    const transferId = randomUUID();
    for (const [account, other, direction] of [
      [source, destination, "OUT"],
      [destination, source, "IN"],
    ] as const) {
      await tx.cashEntry.create({
        data: {
          transferId,
          accountId: account.id,
          kind: "TRANSFER",
          direction,
          amount: input.amount,
          counterparty: other.name,
          reference: input.reference,
          note: input.note,
          occurredOn: new Date(input.occurredOn + "T00:00:00Z"),
          actorId: actor.id,
        },
      });
    }
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: transferId,
        action: "CASH_TRANSFERRED",
        details: input,
      },
    });
    return { id: transferId };
  });
}

// Called within reverseCash's serializable, idempotent transaction.
export async function reverseTransfer(
  tx: Tx,
  actor: Actor,
  transferId: string,
  input: { reason: string; occurredOn: string },
) {
  const pair = await tx.cashEntry.findMany({
    where: { transferId, kind: "TRANSFER" },
    include: { reversal: true },
  });
  if (pair.length !== 2 || pair.some((e) => e.reversal))
    throw new DomainError(
      "Esta transferencia ya fue revertida o está incompleta.",
    );
  const balances = [];
  for (const entry of pair) {
    const account = await tx.moneyAccount.findUniqueOrThrow({
      where: { id: entry.accountId },
    });
    const next = new Decimal(account.balance.toString()).plus(
      entry.direction === "OUT"
        ? entry.amount.toString()
        : new Decimal(entry.amount.toString()).negated(),
    );
    if (next.lt(0))
      throw new DomainError(
        "La cuenta de destino ya no tiene saldo suficiente para devolver el dinero.",
      );
    balances.push({ id: account.id, balance: next.toFixed(2) });
  }
  for (const account of balances.sort((a, b) => a.id.localeCompare(b.id)))
    await tx.moneyAccount.update({
      where: { id: account.id },
      data: { balance: account.balance },
    });
  for (const entry of pair)
    await tx.cashEntry.create({
      data: {
        transferId,
        accountId: entry.accountId,
        direction: entry.direction === "IN" ? "OUT" : "IN",
        kind: "REVERSAL",
        amount: entry.amount,
        counterparty: entry.counterparty,
        reference: entry.reference,
        note: input.reason,
        occurredOn: new Date(input.occurredOn + "T00:00:00Z"),
        actorId: actor.id,
        reversalOfId: entry.id,
      },
    });
  await tx.auditEvent.create({
    data: {
      actorId: actor.id,
      entityId: transferId,
      action: "TRANSFER_REVERSED",
      details: input,
    },
  });
  return { id: transferId };
}
