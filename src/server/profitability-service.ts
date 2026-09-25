import "server-only";
import { z } from "zod";
import Decimal from "decimal.js";
import { requirePermission } from "@/domain/permissions";
import { DomainError } from "@/domain/errors";
import { once, type Actor } from "./commands";
import { completeSaleConsumption } from "./sale-work";

// Explicit historical reconciliation: never infer which old job a sale belongs to.
export async function connectSaleWork(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "finance:write");
  const input = z
    .object({
      requestId: z.uuid(),
      saleId: z.uuid(),
      orderId: z.uuid().optional(),
      memberId: z.uuid().optional(),
      note: z.string().trim().min(3).max(1000),
    })
    .parse(raw);
  return once(
    actor,
    input.requestId,
    "SALE_WORK_CONNECTED",
    input,
    async (tx) => {
      const sale = await tx.sale.findUniqueOrThrow({
        where: { id: input.saleId },
        include: {
          lines: { include: { returnLines: { include: { document: true } } } },
        },
      });
      if (
        sale.status !== "ISSUED" ||
        sale.orderId ||
        sale.kind !== "COUNTER" ||
        !sale.lines.some((l) => l.kind === "SERVICE")
      )
        throw new DomainError(
          "Solo se pueden conectar ventas vigentes de servicio que todavía no tengan trabajo.",
        );
      let order = input.orderId
        ? await tx.workOrder.findUniqueOrThrow({ where: { id: input.orderId } })
        : null;
      if (
        order &&
        (order.customerId !== sale.customerId ||
          order.purpose !== "CUSTOMER_REPAIR" ||
          order.status === "CANCELLED" ||
          (await tx.sale.count({
            where: { orderId: order.id, status: "ISSUED" },
          })))
      )
        throw new DomainError(
          "Selecciona un trabajo del mismo cliente, sin venta vigente ni cancelación.",
        );
      const movementIds = sale.lines
        .flatMap((l) => [
          l.movementId,
          ...l.returnLines.map((r) => r.movementId),
        ])
        .filter((id): id is string => !!id);
      if (
        order &&
        movementIds.length &&
        (await tx.stockMovement.count({ where: { orderId: order.id } }))
      )
        throw new DomainError(
          "La venta y la orden ya tienen movimientos de repuestos. Revisa sus consumos antes de vincularlos para no duplicar costos.",
        );
      if (!order)
        order = await tx.workOrder.create({
          data: {
            customerId: sale.customerId,
            locationId: sale.locationId,
            purpose: "CUSTOMER_REPAIR",
            status: "IN_PROGRESS",
            title: sale.title,
            reportedProblem: input.note,
            receivedAt: sale.issuedOn,
            businessCategoryId: sale.lines.find((l) => l.kind === "SERVICE")
              ?.businessCategoryId,
          },
        });
      if (
        !(await tx.task.count({
          where: { orderId: order.id, deletedAt: null },
        }))
      ) {
        if (
          input.memberId &&
          !(await tx.member.count({
            where: { id: input.memberId, active: true },
          }))
        )
          throw new DomainError("Selecciona un responsable activo.");
        if (
          order.status === "CLOSED" &&
          !input.memberId &&
          sale.lines.some((l) => l.kind === "SERVICE" && !l.assignedMemberId)
        )
          throw new DomainError(
            "Selecciona quién hizo el trabajo para completar las tareas de esta orden cerrada.",
          );
        for (const line of sale.lines.filter((l) => l.kind === "SERVICE"))
          await tx.task.create({
            data: {
              orderId: order.id,
              title: line.description,
              status: order.status === "CLOSED" ? "DONE" : "TODO",
              ...(line.assignedMemberId || input.memberId
                ? {
                    assignments: {
                      create: {
                        memberId: line.assignedMemberId ?? input.memberId!,
                      },
                    },
                  }
                : {}),
            },
          });
      }
      for (const line of sale.lines) {
        if (line.movementId)
          await tx.stockMovement.update({
            where: { id: line.movementId },
            data: { orderId: order.id, occurredOn: sale.issuedOn },
          });
        for (const returned of line.returnLines)
          if (returned.movementId)
            await tx.stockMovement.update({
              where: { id: returned.movementId },
              data: {
                orderId: order.id,
                occurredOn: returned.document.occurredOn,
              },
            });
      }
      await tx.sale.update({
        where: { id: sale.id },
        data: { orderId: order.id, kind: "REPAIR" },
      });
      if (sale.quoteId)
        await tx.quote.update({
          where: { id: sale.quoteId },
          data: { orderId: order.id },
        });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: sale.id,
          action: "SALE_WORK_CONNECTED",
          details: { orderId: order.id, note: input.note, movementIds },
        },
      });
      return { id: sale.id };
    },
  );
}

export async function completeRepairParts(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "finance:write");
  const input = z
    .object({
      requestId: z.uuid(),
      saleId: z.uuid(),
      note: z.string().trim().min(3).max(1000),
    })
    .parse(raw);
  return once(
    actor,
    input.requestId,
    "SALE_PARTS_COMPLETED",
    input,
    async (tx) => {
      const sale = await tx.sale.findUniqueOrThrow({
        where: { id: input.saleId },
        include: { lines: { include: { returnLines: true } } },
      });
      if (sale.status !== "ISSUED" || sale.kind !== "REPAIR" || !sale.orderId)
        throw new DomainError("Selecciona una venta de reparación vigente.");
      await completeSaleConsumption(
        tx,
        actor,
        sale.orderId,
        sale.locationId,
        sale.number,
        sale.lines.map((l) => ({
          ...l,
          quantity: l.returnLines
            .reduce(
              (qty, r) => qty.minus(r.quantity.toString()),
              new Decimal(l.quantity.toString()),
            )
            .toString(),
        })),
      );
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: sale.id,
          action: "SALE_PARTS_COMPLETED",
          details: { orderId: sale.orderId, note: input.note },
        },
      });
      return { id: sale.id };
    },
  );
}
