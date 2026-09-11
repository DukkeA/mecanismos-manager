import "server-only";
import { z } from "zod";
import Decimal from "decimal.js";
import { randomUUID } from "node:crypto";
import { once, type Actor, type Tx } from "./commands";
import { requirePermission } from "@/domain/permissions";
import { DomainError } from "@/domain/errors";
import {
  documentInput,
  lineTotal,
  type DocumentLineInput,
} from "@/domain/commercial";
import { day } from "./commercial-ledger";

export async function validateCustomerOrder(
  tx: Tx,
  customerId: string,
  orderId?: string,
) {
  const customer = await tx.customer.findFirst({
    where: { id: customerId, deletedAt: null },
  });
  if (!customer) throw new DomainError("Selecciona un cliente activo.");
  if (orderId) {
    const order = await tx.workOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    if (order.customerId !== customerId || order.status === "CANCELLED")
      throw new DomainError(
        "La orden no corresponde a este cliente o fue cancelada.",
      );
  }
  return customer;
}
export async function snapshotLines(tx: Tx, lines: DocumentLineInput[]) {
  const result = [];
  for (const line of lines) {
    const item = await tx.catalogItem.findUniqueOrThrow({
      where: { id: line.itemId },
    });
    let total: string;
    try {
      total = lineTotal(line);
    } catch {
      throw new DomainError("El descuento supera el valor de la línea.");
    }
    result.push({ ...line, total, kind: item.kind, reference: item.reference });
  }
  return result;
}
export async function saveQuote(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "orders:write");
  const input = documentInput
    .extend({ previousId: z.uuid().optional(), validUntil: z.iso.date() })
    .parse(raw);
  return once(actor, input.requestId, "QUOTE_CREATED", input, async (tx) => {
    await validateCustomerOrder(tx, input.customerId, input.orderId);
    const previous = input.previousId
      ? await tx.quote.findUniqueOrThrow({ where: { id: input.previousId } })
      : null;
    if (previous) {
      const latest = await tx.quote.findFirst({
        where: { groupId: previous.groupId },
        orderBy: { revision: "desc" },
      });
      if (
        latest?.id !== previous.id ||
        previous.customerId !== input.customerId
      )
        throw new DomainError(
          "Abre la última versión de esta cotización para revisarla.",
        );
    }
    const lines = await snapshotLines(tx, input.lines);
    const total = lines.reduce((s, l) => s.plus(l.total), new Decimal(0));
    if (!total.gt(0))
      throw new DomainError(
        "La cotización debe tener un valor mayor que cero.",
      );
    const quote = await tx.quote.create({
      data: {
        groupId: previous?.groupId ?? randomUUID(),
        revision: (previous?.revision ?? 0) + 1,
        customerId: input.customerId,
        orderId: input.orderId,
        title: input.title,
        terms: input.terms,
        validUntil: day(input.validUntil),
        total: total.toFixed(2),
        actorId: actor.id,
        lines: { create: lines },
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: quote.id,
        action: "QUOTE_CREATED",
        details: { revision: quote.revision, previousId: previous?.id ?? null },
      },
    });
    return { id: quote.id };
  });
}
export async function decideQuote(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "orders:write");
  const input = z
    .object({
      requestId: z.uuid(),
      quoteId: z.uuid(),
      decision: z.enum(["APPROVED", "REJECTED"]),
      approvedBy: z.string().trim().min(3).max(180),
      note: z.string().trim().min(5).max(5000),
    })
    .parse(raw);
  return once(actor, input.requestId, "QUOTE_DECIDED", input, async (tx) => {
    const quote = await tx.quote.findUniqueOrThrow({
      where: { id: input.quoteId },
    });
    const latest = await tx.quote.findFirst({
      where: { groupId: quote.groupId },
      orderBy: { revision: "desc" },
    });
    if (quote.status !== "DRAFT" || latest?.id !== quote.id)
      throw new DomainError(
        "Solo puedes decidir sobre la última versión pendiente.",
      );
    if(input.decision==="APPROVED" && quote.validUntil.toISOString().slice(0,10)<new Intl.DateTimeFormat("en-CA",{timeZone:"America/Bogota"}).format(new Date()))throw new DomainError("La cotización venció. Crea una nueva versión con vigencia actualizada.");
    await tx.quote.update({
      where: { id: quote.id },
      data: {
        status: input.decision,
        approvedBy: input.approvedBy,
        approvalNote: input.note,
        approvedAt: new Date(),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: quote.id,
        action: "QUOTE_DECIDED",
        details: input,
      },
    });
    return { id: quote.id };
  });
}
