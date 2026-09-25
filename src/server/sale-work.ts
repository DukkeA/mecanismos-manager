import "server-only";
import Decimal from "decimal.js";
import { DomainError } from "@/domain/errors";
import type { Actor, Tx } from "./commands";
import type { PartCondition } from "@/generated/prisma/client";
import { postStock } from "./commercial-ledger";

// Billing confirms use of these parts. Reuse existing consumption before issuing
// only the missing quantity. Reservations belonging to other jobs stay protected.
export async function completeSaleConsumption(
  tx: Tx,
  actor: Actor,
  orderId: string,
  locationId: string,
  number: number,
  lines: {
    itemId: string;
    condition: PartCondition;
    kind: string;
    quantity: string;
  }[],
  occurredOn?: string,
) {
  const groups = new Map<
    string,
    { itemId: string; condition: PartCondition; quantity: Decimal }
  >();
  for (const line of lines.filter((l) => l.kind === "PART")) {
    const key = `${line.itemId}:${line.condition}`;
    const previous = groups.get(key);
    groups.set(key, {
      ...line,
      quantity: new Decimal(line.quantity).plus(previous?.quantity ?? 0),
    });
  }
  for (const part of groups.values()) {
    const posted = await tx.stockMovement.aggregate({
      where: { orderId, itemId: part.itemId, condition: part.condition },
      _sum: { quantity: true },
    });
    let needed = part.quantity.plus(posted._sum.quantity?.toString() ?? 0);
    if (needed.lte(0)) continue;
    const reservations = await tx.stockReservation.findMany({
      where: {
        orderId,
        itemId: part.itemId,
        condition: part.condition,
        status: "ACTIVE",
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    for (const r of reservations) {
      if (needed.lte(0)) break;
      const used = Decimal.min(needed, r.quantity.toString());
      const key = {
        itemId: r.itemId,
        locationId: r.locationId,
        condition: r.condition,
      };
      await tx.stockBalance.update({
        where: { itemId_locationId_condition: key },
        data: { reserved: { decrement: used.toString() } },
      });
      const movement = await postStock(tx, actor, {
        ...key,
        orderId,
        occurredOn,
        quantity: used.negated().toString(),
        kind: "CONSUMPTION",
        reason: `Repuesto confirmado en venta ${number}`,
      });
      await tx.stockReservation.update({
        where: { id: r.id },
        data: {
          status: "CONSUMED",
          quantity: used.toString(),
          movementId: movement.id,
        },
      });
      const remaining = new Decimal(r.quantity.toString()).minus(used);
      if (remaining.gt(0))
        await tx.stockReservation.create({
          data: {
            ...key,
            orderId,
            quantity: remaining.toString(),
            actorId: actor.id,
          },
        });
      needed = needed.minus(used);
    }
    if (needed.gt(0)) {
      const item = await tx.catalogItem.findUniqueOrThrow({
        where: { id: part.itemId },
      });
      try {
        await postStock(tx, actor, {
          itemId: part.itemId,
          condition: part.condition,
          locationId,
          orderId,
          occurredOn,
          quantity: needed.negated().toString(),
          kind: "CONSUMPTION",
          reason: `Repuesto confirmado en venta ${number}`,
        });
      } catch (error) {
        if (error instanceof DomainError)
          throw new DomainError(
            `${item.name}: ${error.message} Recibe la compra o revisa los repuestos de la venta.`,
          );
        throw error;
      }
    }
  }
}
