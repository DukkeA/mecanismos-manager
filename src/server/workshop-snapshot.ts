import "server-only";
import { getOrders } from "./workshop-query";
import { getOperations } from "./operations-query";
import { db } from "./db";
import type { Actor } from "./commands";
export async function getWorkshopSnapshot(actor: Actor) {
  const [orders, operations, locations] = await Promise.all([
    getOrders(actor),
    getOperations(actor),
    db().location.findMany({ select: { id: true, name: true } }),
  ]);
  return { orders, operations, locations };
}
