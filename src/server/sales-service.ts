import "server-only";
import { z } from "zod";
import Decimal from "decimal.js";
import { once, type Actor, type Tx } from "./commands";
import { requirePermission } from "@/domain/permissions";
import { DomainError } from "@/domain/errors";
import { documentInput, quantity, positiveMoney } from "@/domain/commercial";
import {
  day,
  postStock,
  postMoney,
  releaseAllocations,
} from "./commercial-ledger";
import { allocate, paymentState } from "./payment-service";
import { snapshotLines, validateCustomerOrder } from "./quote-service";

export async function issueSale(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "finance:write");
  const input = documentInput
    .extend({
      quoteId: z.uuid().optional(),
      locationId: z.uuid(),
      issuedOn: z.iso.date(),
      dueOn: z.iso.date(),
      invoiceReference: z.string().trim().max(200).default(""),
      applyCredit: z.boolean().optional(),
      settleInFull: z.boolean().optional(),
      payment: z
        .object({ accountId: z.uuid(), amount: positiveMoney })
        .optional(),
    })
    .parse(raw);
  if (input.dueOn < input.issuedOn)
    throw new DomainError("El vencimiento no puede ser anterior a la venta.");
  return once(actor, input.requestId, "SALE_ISSUED", input, async (tx) => {
    const customer = await validateCustomerOrder(
      tx,
      input.customerId,
      input.orderId,
    );
    await tx.location.findUniqueOrThrow({ where: { id: input.locationId } });
    const quote = input.quoteId
      ? await tx.quote.findUniqueOrThrow({
          where: { id: input.quoteId },
          include: { lines: true, sale: true },
        })
      : null;
    if (
      quote &&
      (quote.status !== "APPROVED" ||
        quote.sale ||
        quote.customerId !== input.customerId ||
        quote.orderId !== (input.orderId ?? null))
    )
      throw new DomainError(
        "Selecciona una cotización aprobada, sin venta y del mismo cliente y orden.",
      );
    if (
      input.orderId &&
      (await tx.sale.findFirst({
        where: { orderId: input.orderId, status: "ISSUED" },
      }))
    )
      throw new DomainError(
        "Esta orden ya tiene una venta vigente. Abre su detalle.",
      );
    if (
      quote &&
      (await tx.quote.findFirst({
        where: {
          groupId: quote.groupId,
          revision: { gt: quote.revision },
          status: "APPROVED",
        },
      }))
    )
      throw new DomainError(
        "Hay una versión aprobada más reciente. Selecciónala para registrar la venta.",
      );
    if (
      quote &&
      (await tx.sale.findFirst({
        where: { quote: { groupId: quote.groupId }, status: "ISSUED" },
      }))
    )
      throw new DomainError(
        "Esta cotización ya tiene una venta vigente. Abre la venta para cobrar o hacer una devolución.",
      );
    const lines = quote
      ? quote.lines.map((l) => ({
          itemId: l.itemId,
          businessCategoryId: l.businessCategoryId,
          description: l.description,
          reference: l.reference,
          kind: l.kind,
          assignedMemberId: l.assignedMemberId,
          quantity: l.quantity.toString(),
          unitPrice: l.unitPrice.toFixed(2),
          discount: l.discount.toFixed(2),
          condition: l.condition,
          total: l.total.toFixed(2),
        }))
      : await snapshotLines(tx, input.lines);
    const total = lines.reduce((s, l) => s.plus(l.total), new Decimal(0));
    if (!total.gt(0))
      throw new DomainError("La venta debe tener un valor mayor que cero.");
    const sale = await tx.sale.create({
      data: {
        customerId: input.customerId,
        orderId: input.orderId,
        quoteId: input.quoteId,
        locationId: input.locationId,
        kind: input.orderId ? "REPAIR" : "COUNTER",
        title: quote?.title ?? input.title,
        terms: quote?.terms ?? input.terms,
        total: total.toFixed(2),
        issuedOn: day(input.issuedOn),
        dueOn: day(input.dueOn),
        invoiceReference: input.invoiceReference,
        actorId: actor.id,
      },
    });
    const orderCategory = input.orderId
      ? (await tx.workOrder.findUniqueOrThrow({ where: { id: input.orderId } }))
          .businessCategoryId
      : undefined;
    for (const line of lines) {
      // Repair parts are consumed against the work order; invoicing must not consume twice.
      const movement =
        !input.orderId && line.kind === "PART"
          ? await postStock(tx, actor, {
              itemId: line.itemId,
              locationId: input.locationId,
              condition: line.condition,
              quantity: new Decimal(line.quantity).negated().toString(),
              kind: "SALE",
              reason: `Venta ${sale.number}`,
            })
          : null;
      await tx.saleLine.create({
        data: {
          saleId: sale.id,
          itemId: line.itemId,
          businessCategoryId: input.orderId
            ? orderCategory
            : line.businessCategoryId,
          description: line.description,
          reference: line.reference,
          kind: line.kind,
          condition: line.condition,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discount: line.discount,
          total: line.total,
          movementId: movement?.id,
          materialCost:
            movement && !movement.costKnown
              ? null
              : movement
                ? new Decimal(movement.materialAmount.toString())
                    .abs()
                    .toFixed(2)
                : line.kind === "SERVICE"
                  ? "0"
                  : null,
          assignedMemberId: line.assignedMemberId,
        },
      });
    }
    // One checkout transaction: stock, credit and new money either all persist or all roll back.
    let remaining = total;
    if (input.applyCredit) {
      const credits = await tx.customerPayment.findMany({
        where: {
          customerId: input.customerId,
          refundOfId: null,
          entry: { direction: "IN", reversal: null },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      for (const credit of credits) {
        if (!remaining.gt(0)) break;
        const { available } = await paymentState(tx, credit.id);
        const amount = Decimal.min(available, remaining);
        if (!amount.gt(0)) continue;
        await allocate(
          tx,
          actor,
          credit.id,
          sale.id,
          amount.toFixed(2),
          "Saldo a favor usado al registrar la venta",
        );
        remaining = remaining.minus(amount);
      }
    }
    if (
      input.settleInFull &&
      remaining.minus(input.payment?.amount ?? "0").gt(0)
    )
      throw new DomainError(
        "El saldo a favor cambió o el cobro no cubre la venta. Revisa el importe antes de guardar.",
      );
    if (input.payment) {
      if (remaining.lt(input.payment.amount))
        throw new DomainError(
          "El cobro supera lo que queda por pagar. Revisa el saldo a favor y el importe recibido.",
        );
      const entry = await postMoney(tx, actor, {
        accountId: input.payment.accountId,
        amount: input.payment.amount,
        direction: "IN",
        kind: "CUSTOMER_PAYMENT",
        counterparty: customer.name,
        note: `Cobro de venta ${sale.number}`,
        occurredOn: input.issuedOn,
      });
      const payment = await tx.customerPayment.create({
        data: { customerId: input.customerId, entryId: entry.id },
      });
      await allocate(
        tx,
        actor,
        payment.id,
        sale.id,
        input.payment.amount,
        "Cobro registrado con la venta",
      );
    }
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: sale.id,
        action: "SALE_ISSUED",
        details: {
          number: sale.number,
          quoteId: quote?.id ?? null,
          total: total.toFixed(2),
        },
      },
    });
    return { id: sale.id };
  });
}

export async function releaseExcess(tx: Tx, actor: Actor, saleId: string) {
  const sale = await tx.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: {
      returns: true,
      allocations: {
        where: { reversalOfId: null, reversal: null },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  const debt = new Decimal(sale.total.toString()).minus(
    sale.returns.reduce((s, r) => s.plus(r.amount.toString()), new Decimal(0)),
  );
  let excess = sale.allocations
    .reduce((s, a) => s.plus(a.amount.toString()), new Decimal(0))
    .minus(debt);
  for (const allocation of sale.allocations) {
    if (!excess.gt(0)) break;
    const amount = new Decimal(allocation.amount.toString()),
      released = Decimal.min(excess, amount);
    await tx.paymentAllocation.create({
      data: {
        paymentId: allocation.paymentId,
        saleId,
        amount: amount.negated().toFixed(2),
        actorId: actor.id,
        reversalOfId: allocation.id,
        note: "Liberación por devolución de venta",
      },
    });
    if (amount.gt(released))
      await tx.paymentAllocation.create({
        data: {
          paymentId: allocation.paymentId,
          saleId,
          amount: amount.minus(released).toFixed(2),
          actorId: actor.id,
          note: "Aplicación conservada después de devolución",
        },
      });
    excess = excess.minus(released);
  }
}

export async function returnSale(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const input = z
    .object({
      requestId: z.uuid(),
      saleId: z.uuid(),
      saleLineId: z.uuid(),
      quantity,
      reason: z.string().trim().min(5).max(1000),
      occurredOn: z.iso.date(),
    })
    .parse(raw);
  return once(actor, input.requestId, "SALE_RETURNED", input, async (tx) => {
    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: input.saleId },
    });
    const line = await tx.saleLine.findUniqueOrThrow({
      where: { id: input.saleLineId },
      include: { movement: true, returnLines: { include: { movement: true } } },
    });
    if (sale.status !== "ISSUED" || line.saleId !== sale.id)
      throw new DomainError("La línea no pertenece a una venta vigente.");
    if (sale.kind === "UNIT" && !new Decimal(input.quantity).eq(1))
      throw new DomainError("Una unidad con serie debe devolverse completa.");
    const remaining = new Decimal(line.quantity.toString()).minus(
      line.returnLines.reduce(
        (s, l) => s.plus(l.quantity.toString()),
        new Decimal(0),
      ),
    );
    const qty = new Decimal(input.quantity);
    if (qty.gt(remaining))
      throw new DomainError("La cantidad supera lo pendiente por devolver.");
    const credited = line.returnLines.reduce(
      (s, l) => s.plus(l.amount.toString()),
      new Decimal(0),
    );
    const amount = qty.eq(remaining)
      ? new Decimal(line.total.toString()).minus(credited)
      : new Decimal(line.total.toString())
          .mul(qty)
          .div(line.quantity.toString())
          .toDecimalPlaces(2);
    const document = await tx.saleReturn.create({
      data: {
        saleId: sale.id,
        amount: amount.toFixed(2),
        reason: input.reason,
        occurredOn: day(input.occurredOn),
        actorId: actor.id,
      },
    });
    let movementId: string | undefined;
    if (line.movementId) {
      const previousCost = line.returnLines.reduce(
        (s, l) => s.plus(l.movement?.materialAmount.toString() ?? "0"),
        new Decimal(0),
      );
      const value = qty.eq(remaining)
        ? new Decimal(
            line.movement
              ? new Decimal(line.movement.materialAmount.toString())
                  .abs()
                  .toString()
              : (line.materialCost?.toString() ?? "0"),
          ).minus(previousCost)
        : new Decimal(
            line.movement
              ? new Decimal(line.movement.materialAmount.toString())
                  .abs()
                  .toString()
              : (line.materialCost?.toString() ?? "0"),
          )
            .mul(qty)
            .div(line.quantity.toString())
            .toDecimalPlaces(2);
      movementId = (
        await postStock(tx, actor, {
          itemId: line.itemId,
          locationId: sale.locationId,
          condition: line.condition,
          quantity: input.quantity,
          materialAmount: value.toFixed(2),
          costKnown: line.movement?.costKnown ?? true,
          kind: "SALE_RETURN",
          reason: input.reason,
        })
      ).id;
    }
    await tx.saleReturnLine.create({
      data: {
        returnId: document.id,
        saleLineId: line.id,
        quantity: input.quantity,
        amount: amount.toFixed(2),
        movementId,
      },
    });
    if (sale.kind === "UNIT")
      await tx.serializedUnit.updateMany({
        where: { saleId: sale.id },
        data: { status: "AVAILABLE", saleId: null },
      });
    await releaseExcess(tx, actor, sale.id);
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: sale.id,
        action: "SALE_RETURNED",
        details: input,
      },
    });
    return { id: document.id };
  });
}

export async function voidSale(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const input = z
    .object({
      requestId: z.uuid(),
      saleId: z.uuid(),
      reason: z.string().trim().min(5).max(1000),
    })
    .parse(raw);
  return once(actor, input.requestId, "SALE_VOIDED", input, async (tx) => {
    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: input.saleId },
      include: {
        lines: {
          include: {
            movement: true,
            returnLines: { include: { movement: true } },
          },
        },
      },
    });
    if (sale.status !== "ISSUED")
      throw new DomainError("La venta ya fue anulada.");
    for (const line of sale.lines)
      if (line.movementId) {
        const qty = new Decimal(line.quantity.toString()).minus(
          line.returnLines.reduce(
            (s, r) => s.plus(r.quantity.toString()),
            new Decimal(0),
          ),
        );
        const value = new Decimal(
          line.movement
            ? new Decimal(line.movement.materialAmount.toString())
                .abs()
                .toString()
            : (line.materialCost?.toString() ?? "0"),
        ).minus(
          line.returnLines.reduce(
            (s, r) => s.plus(r.movement?.materialAmount.toString() ?? "0"),
            new Decimal(0),
          ),
        );
        if (qty.gt(0))
          await postStock(tx, actor, {
            itemId: line.itemId,
            locationId: sale.locationId,
            condition: line.condition,
            quantity: qty.toString(),
            materialAmount: value.toFixed(2),
            costKnown: line.movement?.costKnown ?? true,
            kind: "SALE_VOID",
            reason: input.reason,
          });
      }
    if (sale.kind === "UNIT")
      await tx.serializedUnit.updateMany({
        where: { saleId: sale.id },
        data: { status: "AVAILABLE", saleId: null },
      });
    await releaseAllocations(tx, actor, { saleId: sale.id }, input.reason);
    await tx.sale.update({
      where: { id: sale.id },
      data: { status: "VOID", voidReason: input.reason },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: sale.id,
        action: "SALE_VOIDED",
        details: input,
      },
    });
    return { id: sale.id };
  });
}
