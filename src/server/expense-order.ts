import "server-only";
import { DomainError } from "@/domain/errors";
import type { Tx } from "./commands";

export async function assertExpenseOrder(tx: Tx, orderId?: string | null) {
  if (!orderId) return;
  const order = await tx.workOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new DomainError("La orden del gasto no existe.");
  const unit = await tx.serializedUnit.findUnique({ where: { orderId } });
  if (unit && unit.status !== "REBUILDING")
    throw new DomainError(
      "La unidad ya fue valorada. Sus costos de reconstrucción están cerrados.",
    );
}
