import "server-only";
import { z } from "zod";
import Decimal from "decimal.js";
import { once, type Actor, type Tx } from "./commands";
import { requirePermission } from "@/domain/permissions";
import { DomainError } from "@/domain/errors";
import { money } from "@/domain/commercial";
import { day } from "./commercial-ledger";
const reason = z.string().trim().min(5).max(3000);
export async function saveLaborRate(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "payroll:read");
  const input = z
    .object({
      requestId: z.uuid(),
      memberId: z.uuid(),
      effectiveOn: z.iso.date(),
      hourlyCost: money,
      note: reason,
    })
    .parse(raw);
  return once(actor, input.requestId, "LABOR_RATE_SET", input, async (tx) => {
    const member = await tx.member.findUniqueOrThrow({
      where: { id: input.memberId },
    });
    if (!member.active) throw new DomainError("Selecciona una persona activa.");
    if (
      await tx.laborRate.findUnique({
        where: {
          memberId_effectiveOn: {
            memberId: input.memberId,
            effectiveOn: day(input.effectiveOn),
          },
        },
      })
    )
      throw new DomainError(
        "Ya existe una tarifa para esa fecha. Registra la siguiente vigencia.",
      );
    const rate = await tx.laborRate.create({
      data: {
        memberId: input.memberId,
        effectiveOn: day(input.effectiveOn),
        hourlyCost: input.hourlyCost,
        note: input.note,
        actorId: actor.id,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: rate.id,
        action: "LABOR_RATE_SET",
        details: input,
      },
    });
    return { id: rate.id };
  });
}
export async function orderCost(tx: Tx, orderId: string) {
  const moves = await tx.stockMovement.findMany({ where: { orderId } }),
    times = await tx.timeEntry.findMany({ where: { task: { orderId } } });
  const material = moves.reduce(
    (s, m) => s.minus(m.materialAmount.toString()),
    new Decimal(0),
  );
  let labor = new Decimal(0),
    missingMinutes = 0;
  for (const time of times) {
    const rate = await tx.laborRate.findFirst({
      where: { memberId: time.memberId, effectiveOn: { lte: time.workedOn } },
      orderBy: { effectiveOn: "desc" },
    });
    if (!rate) missingMinutes += time.minutes;
    else
      labor = labor.plus(
        new Decimal(rate.hourlyCost.toString()).mul(time.minutes).div(60),
      );
  }
  const extra = await tx.overtimeEntry.aggregate({
    where: {
      taskId: {
        in: (
          await tx.task.findMany({ where: { orderId }, select: { id: true } })
        ).map((t) => t.id),
      },
      voidedAt: null,
    },
    _sum: { pay: true, employerCost: true },
  });
  labor = labor
    .plus(extra._sum.pay?.toString() ?? 0)
    .plus(extra._sum.employerCost?.toString() ?? 0);
  return {
    material: material.toDecimalPlaces(2),
    labor: labor.toDecimalPlaces(2),
    missingMinutes,
    missingMaterials: moves.some(
      (m) => !m.costKnown && m.quantity.isNegative(),
    ),
  };
}
export async function openWarranty(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "orders:write");
  const input = z
    .object({
      requestId: z.uuid(),
      saleId: z.uuid(),
      assetId: z.uuid().optional(),
      symptom: reason,
      locationId: z.uuid(),
    })
    .parse(raw);
  return once(actor, input.requestId, "WARRANTY_OPENED", input, async (tx) => {
    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: input.saleId },
    });
    if (sale.status !== "ISSUED")
      throw new DomainError("La garantía requiere una venta vigente.");
    const candidates = sale.orderId
      ? await tx.orderAsset.findMany({
          where: { orderId: sale.orderId },
          select: { assetId: true },
        })
      : [];
    const assetId =
      input.assetId ??
      (candidates.length === 1 ? candidates[0].assetId : undefined);
    if (assetId) {
      const linked = sale.orderId
        ? await tx.orderAsset.findUnique({
            where: {
              orderId_assetId: {
                orderId: sale.orderId,
                assetId,
              },
            },
          })
        : null;
      if (!linked)
        throw new DomainError("El activo no pertenece al trabajo original.");
    }
    const order = await tx.workOrder.create({
      data: {
        purpose: "WARRANTY",
        businessCategoryId: sale.orderId
          ? (
              await tx.workOrder.findUniqueOrThrow({
                where: { id: sale.orderId },
              })
            ).businessCategoryId
          : (
              await tx.saleLine.findFirst({
                where: { saleId: sale.id },
                orderBy: { total: "desc" },
              })
            )?.businessCategoryId,
        customerId: sale.customerId,
        locationId: input.locationId,
        title: `Garantía · ${sale.title}`,
        reportedProblem: input.symptom,
        ...(assetId ? { assets: { create: { assetId } } } : {}),
      },
    });
    const warranty = await tx.warrantyCase.create({
      data: {
        saleId: sale.id,
        originalOrderId: sale.orderId,
        assetId,
        repairOrderId: order.id,
        symptom: input.symptom,
        actorId: actor.id,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: order.id,
        action: "WARRANTY_OPENED",
        details: input,
      },
    });
    return { id: warranty.id };
  });
}
export async function reviewWarranty(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "orders:write");
  const input = z
    .object({
      requestId: z.uuid(),
      warrantyId: z.uuid(),
      diagnosis: reason,
      decision: z.enum(["ACCEPTED", "REJECTED"]),
      cause: z.enum(["PART", "WORKMANSHIP", "EXTERNAL", "UNDETERMINED"]),
    })
    .parse(raw);
  return once(
    actor,
    input.requestId,
    "WARRANTY_REVIEWED",
    input,
    async (tx) => {
      const warranty = await tx.warrantyCase.findUniqueOrThrow({
        where: { id: input.warrantyId },
      });
      if (warranty.decision !== "PENDING")
        throw new DomainError("La garantía ya tiene una decisión registrada.");
      await tx.warrantyCase.update({
        where: { id: warranty.id },
        data: {
          diagnosis: input.diagnosis,
          decision: input.decision,
          cause: input.cause,
          reviewerId: actor.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: warranty.repairOrderId,
          action: "WARRANTY_REVIEWED",
          details: input,
        },
      });
      return { id: warranty.id };
    },
  );
}
export async function recordCheck(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "tasks:contribute");
  const input = z
    .object({
      requestId: z.uuid(),
      orderId: z.uuid(),
      name: z.string().trim().min(3).max(200),
      result: z.enum(["PASS", "FAIL"]),
      readings: reason,
    })
    .parse(raw);
  return once(actor, input.requestId, "QUALITY_RECORDED", input, async (tx) => {
    const order = await tx.workOrder.findUniqueOrThrow({
      where: { id: input.orderId },
    });
    if (["CLOSED", "CANCELLED"].includes(order.status))
      throw new DomainError("La orden está cerrada.");
    if (
      actor.role === "MECHANIC" &&
      !(await tx.taskAssignment.findFirst({
        where: {
          memberId: actor.id,
          task: { orderId: input.orderId, deletedAt: null },
        },
      }))
    )
      throw new DomainError(
        "Solo puedes registrar pruebas de tus órdenes asignadas.",
      );
    const result = await tx.orderCheck.create({
      data: {
        orderId: input.orderId,
        name: input.name,
        result: input.result,
        readings: input.readings,
        actorId: actor.id,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: input.orderId,
        action: "QUALITY_RECORDED",
        details: input,
      },
    });
    return { id: result.id };
  });
}
export async function handoverOrder(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "orders:write");
  const input = z
    .object({
      requestId: z.uuid(),
      orderId: z.uuid(),
      kind: z.enum(["RECEPTION", "DELIVERY"]),
      condition: reason,
      inventory: reason,
      acceptedBy: z.string().trim().min(3).max(180),
      note: reason,
    })
    .parse(raw);
  return once(actor, input.requestId, "ORDER_HANDOVER", input, async (tx) => {
    const order = await tx.workOrder.findUniqueOrThrow({
      where: { id: input.orderId },
    });
    if (order.status === "CANCELLED" || order.status === "CLOSED")
      throw new DomainError("La orden está cerrada.");
    if (input.kind === "DELIVERY" && order.status !== "READY")
      throw new DomainError("La orden debe estar lista para entregar.");
    const result = await tx.orderHandover.create({
      data: {
        orderId: input.orderId,
        kind: input.kind,
        condition: input.condition,
        inventory: input.inventory,
        acceptedBy: input.acceptedBy,
        note: input.note,
        actorId: actor.id,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: input.orderId,
        action: "ORDER_HANDOVER",
        details: input,
      },
    });
    return { id: result.id };
  });
}
export async function changeOwner(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "customers:write");
  const input = z
    .object({
      requestId: z.uuid(),
      assetId: z.uuid(),
      customerId: z.uuid(),
      reason,
    })
    .parse(raw);
  return once(
    actor,
    input.requestId,
    "ASSET_OWNER_CHANGED",
    input,
    async (tx) => {
      const asset = await tx.asset.findUniqueOrThrow({
        where: { id: input.assetId },
      });
      if (asset.customerId === input.customerId)
        throw new DomainError("El activo ya pertenece a este cliente.");
      if (
        !(await tx.customer.findFirst({
          where: { id: input.customerId, deletedAt: null },
        }))
      )
        throw new DomainError("Selecciona un cliente activo.");
      if (
        await tx.orderAsset.findFirst({
          where: {
            assetId: asset.id,
            order: { status: { notIn: ["CLOSED", "CANCELLED"] } },
          },
        })
      )
        throw new DomainError(
          "Cierra los trabajos abiertos del activo antes de cambiar el propietario.",
        );
      await tx.assetOwnership.create({
        data: {
          assetId: asset.id,
          previousCustomerId: asset.customerId,
          customerId: input.customerId,
          reason: input.reason,
          actorId: actor.id,
        },
      });
      await tx.asset.update({
        where: { id: asset.id },
        data: { customerId: input.customerId },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: asset.id,
          action: "ASSET_OWNER_CHANGED",
          details: input,
        },
      });
      return { id: asset.id };
    },
  );
}
export async function registerUnit(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "inventory:write");
  const input = z
    .object({
      requestId: z.uuid(),
      itemId: z.uuid(),
      locationId: z.uuid(),
      code: z.string().trim().min(2).max(120),
      serial: z.string().trim().max(120).default(""),
      orderId: z.uuid(),
      coreCost: money,
    })
    .parse(raw);
  return once(actor, input.requestId, "UNIT_REGISTERED", input, async (tx) => {
    const order = await tx.workOrder.findUniqueOrThrow({
        where: { id: input.orderId },
      }),
      item = await tx.catalogItem.findUniqueOrThrow({
        where: { id: input.itemId },
      });
    if (order.purpose !== "OWN_REBUILD" || item.kind !== "PART")
      throw new DomainError(
        "Selecciona una reconstrucción propia y un repuesto del catálogo.",
      );
    if (!order.businessCategoryId && item.businessCategoryId)
      await tx.workOrder.update({
        where: { id: order.id },
        data: {
          businessCategoryId: item.businessCategoryId,
          version: { increment: 1 },
        },
      });
    const unit = await tx.serializedUnit.create({
      data: {
        itemId: input.itemId,
        locationId: input.locationId,
        code: input.code,
        serial: input.serial,
        orderId: order.id,
        coreCost: input.coreCost,
        actorId: actor.id,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: unit.id,
        action: "UNIT_REGISTERED",
        details: input,
      },
    });
    return { id: unit.id };
  });
}
export async function finishUnit(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const input = z.object({ requestId: z.uuid(), unitId: z.uuid() }).parse(raw);
  return once(actor, input.requestId, "UNIT_FINISHED", input, async (tx) => {
    const unit = await tx.serializedUnit.findUniqueOrThrow({
      where: { id: input.unitId },
    });
    if (unit.status !== "REBUILDING" || !unit.orderId)
      throw new DomainError("La unidad no está en reconstrucción.");
    const order = await tx.workOrder.findUniqueOrThrow({
      where: { id: unit.orderId },
    });
    if (order.status !== "CLOSED")
      throw new DomainError(
        "Cierra la reconstrucción con sus pruebas técnicas antes de dar de alta la unidad.",
      );
    const cost = await orderCost(tx, unit.orderId);
    if (cost.missingMaterials)
      throw new DomainError(
        "Faltan costos de materiales para cerrar la valoración.",
      );
    if (cost.missingMinutes)
      throw new DomainError(
        "Faltan tarifas de mano de obra para calcular el costo.",
      );
    await tx.serializedUnit.update({
      where: { id: unit.id },
      data: {
        status: "AVAILABLE",
        rebuildCost: cost.material.plus(cost.labor).toFixed(2),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: unit.id,
        action: "UNIT_FINISHED",
        details: { cost: cost.material.plus(cost.labor).toFixed(2) },
      },
    });
    return { id: unit.id };
  });
}
export async function sellUnit(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "finance:write");
  const input = z
    .object({
      requestId: z.uuid(),
      unitId: z.uuid(),
      customerId: z.uuid(),
      price: money,
      issuedOn: z.iso.date(),
      dueOn: z.iso.date(),
      terms: reason,
    })
    .parse(raw);
  if (!new Decimal(input.price).gt(0) || input.dueOn < input.issuedOn)
    throw new DomainError("Revisa precio y vencimiento.");
  return once(actor, input.requestId, "UNIT_SOLD", input, async (tx) => {
    const unit = await tx.serializedUnit.findUniqueOrThrow({
      where: { id: input.unitId },
    });
    if (unit.status !== "AVAILABLE")
      throw new DomainError("La unidad no está disponible para venta.");
    if (
      !(await tx.customer.findFirst({
        where: { id: input.customerId, deletedAt: null },
      }))
    )
      throw new DomainError("Selecciona un cliente activo.");
    const item = await tx.catalogItem.findUniqueOrThrow({
      where: { id: unit.itemId },
    });
    const sale = await tx.sale.create({
      data: {
        customerId: input.customerId,
        locationId: unit.locationId,
        kind: "UNIT",
        title: `${item.name} · ${unit.code}`,
        terms: input.terms,
        issuedOn: day(input.issuedOn),
        dueOn: day(input.dueOn),
        total: input.price,
        actorId: actor.id,
        lines: {
          create: {
            itemId: unit.itemId,
            businessCategoryId: item.businessCategoryId,
            description: `${item.name} · ${unit.code} · ${unit.serial}`,
            reference: unit.code,
            kind: "PART",
            condition: "REBUILT",
            quantity: "1",
            unitPrice: input.price,
            discount: "0",
            total: input.price,
            materialCost: new Decimal(unit.coreCost.toString())
              .plus(unit.rebuildCost!.toString())
              .toFixed(2),
          },
        },
      },
    });
    await tx.serializedUnit.update({
      where: { id: unit.id },
      data: { status: "SOLD", saleId: sale.id },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: unit.id,
        action: "UNIT_SOLD",
        details: input,
      },
    });
    return { id: sale.id };
  });
}
