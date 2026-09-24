import { assertCategory } from "./category-service";
import { compensationInput } from "@/domain/team";
import { writeCompensation } from "./team-service";
import { DomainError } from "@/domain/errors";
import "server-only";
import { z } from "zod";
import { db } from "./db";
import { once, serializable, setActor, type Actor } from "./commands";
import { requirePermission, AccessDenied } from "@/domain/permissions";
import { assertOrderTransition } from "@/domain/order-lifecycle";
const memberInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(160),
  email: z.email().transform((v) => v.toLowerCase()),
  role: z.enum(["ADMIN", "OFFICE", "MECHANIC"]),
  active: z.boolean(),
  compensation: compensationInput.optional(),
});
export async function saveMember(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "team:write");
  const { compensation, ...input } = memberInput.parse(raw);
  return serializable(async (tx) => {
    await setActor(tx, actor);
    if (
      actor.role === "ADMIN" &&
      input.id === actor.id &&
      (!input.active || input.role !== "ADMIN")
    )
      throw new DomainError(
        "No puedes desactivar tu propio acceso de administrador.",
      );
    const before = input.id
      ? await tx.member.findUniqueOrThrow({ where: { id: input.id } })
      : null;
    if (
      actor.role === "OFFICE" &&
      (before
        ? before.role !== input.role ||
          before.active !== input.active ||
          before.email !== input.email
        : input.role === "ADMIN" || !input.active)
    )
      throw new DomainError(
        "Solo administración puede cambiar roles, correos de acceso o desactivar empleados.",
      );
    if (before?.authSubject && before.email !== input.email)
      throw new DomainError(
        "Un correo vinculado no puede cambiarse desde este formulario.",
      );
    if (
      before?.role === "ADMIN" &&
      before.active &&
      (!input.active || input.role !== "ADMIN")
    ) {
      if (
        (await tx.member.count({ where: { role: "ADMIN", active: true } })) <= 1
      )
        throw new DomainError("Debe quedar un administrador activo.");
    }
    const member = input.id
      ? await tx.member.update({ where: { id: input.id }, data: input })
      : await tx.member.create({ data: input });
    if (compensation)
      await writeCompensation(tx, actor, member.id, compensation);
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: member.id,
        action: "MEMBER_SAVED",
        details: { role: input.role, active: input.active },
      },
    });
    if (compensation) {
      const { syncSalaryObligations } = await import("./payroll-service");
      await syncSalaryObligations(tx);
    }
    return { id: member.id };
  });
}
const customerInput = z.object({
  requestId: z.uuid().optional(),
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(180),
  document: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.union([z.email(), z.literal("")]).optional(),
});
export async function saveCustomer(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "customers:write");
  const { requestId, ...input } = customerInput.parse(raw);
  const save = async (tx: import("./commands").Tx) => {
    const customer = input.id
      ? await tx.customer.update({
          where: { id: input.id, deletedAt: null },
          data: input,
        })
      : await tx.customer.create({ data: input });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: customer.id,
        action: "CUSTOMER_SAVED",
        details: { name: customer.name },
      },
    });
    return { id: customer.id };
  };
  return requestId
    ? once(actor, requestId, "CUSTOMER_SAVED", input, save)
    : db().$transaction(save);
}
const orderInput = z
  .object({
    responsibleId: z.uuid().optional(),
    initialTasks: z
      .array(
        z.object({
          title: z.string().trim().min(3).max(250),
          memberId: z.uuid(),
          plannedMinutes: z.number().int().min(1).max(43200).optional(),
        }),
      )
      .max(30)
      .default([]),
    businessCategoryId: z.uuid().nullable().optional(),
    assetId: z.uuid().optional(),
    quoteId: z.uuid().optional(),
    dueAt: z.iso.date().optional(),
    requestId: z.uuid(),
    title: z.string().trim().min(3).max(250),
    customerId: z.uuid().optional(),
    customer: z.string().trim().min(3).max(180).optional(),
    reference: z.string().trim().max(120),
    kind: z.enum(["VEHICLE", "COMPONENT"]),
    purpose: z
      .enum(["CUSTOMER_REPAIR", "OWN_REBUILD"])
      .default("CUSTOMER_REPAIR"),
    problem: z.string().trim().min(5).max(5000),
    authorization: z.string().trim().max(5000).default(""),
    locationId: z.uuid(),
  })
  .superRefine((v, ctx) => {
    if (v.purpose !== "OWN_REBUILD" && !v.customerId && !v.customer)
      ctx.addIssue({
        code: "custom",
        message: "Selecciona o crea un cliente.",
      });
    if (v.kind === "VEHICLE" && v.reference.length > 20)
      ctx.addIssue({ code: "custom", message: "Placa demasiado larga." });
  });
export async function receiveOrder(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "orders:write");
  const parsed = orderInput.parse(raw);
  const input = {
    ...parsed,
    reference:
      parsed.kind === "VEHICLE"
        ? parsed.reference.toUpperCase().replace(/[^A-Z0-9]/g, "")
        : parsed.reference.trim(),
  };
  return once(actor, input.requestId, "ORDER_RECEIVED", input, async (tx) => {
    const memberIds = [
      ...new Set([
        ...(input.responsibleId ? [input.responsibleId] : []),
        ...input.initialTasks.map((t) => t.memberId),
      ]),
    ];
    if (
      memberIds.length !==
      (await tx.member.count({
        where: { id: { in: memberIds }, active: true },
      }))
    )
      throw new DomainError("Selecciona responsables activos del equipo.");
    const quote = input.quoteId
      ? await tx.quote.findUniqueOrThrow({
          where: { id: input.quoteId },
          include: { sale: true },
        })
      : null;
    if (
      quote &&
      (quote.status !== "APPROVED" ||
        quote.orderId ||
        quote.sale ||
        quote.customerId !== input.customerId ||
        input.purpose !== "CUSTOMER_REPAIR")
    )
      throw new DomainError(
        "La cotización debe estar aprobada, sin venta ni orden y pertenecer al cliente seleccionado.",
      );
    if (
      quote &&
      (await tx.quote.findFirst({
        where: { groupId: quote.groupId, revision: { gt: quote.revision } },
      }))
    )
      throw new DomainError(
        "Abre la última versión de la cotización antes de recibir el trabajo.",
      );
    if (
      quote &&
      (await tx.quote.findFirst({
        where: {
          groupId: quote.groupId,
          OR: [{ orderId: { not: null } }, { sale: { isNot: null } }],
        },
      }))
    )
      throw new DomainError(
        "Esta cotización ya tiene un trabajo o una venta. Abre su detalle.",
      );
    await tx.location.findUniqueOrThrow({ where: { id: input.locationId } });
    let customerId =
      input.purpose === "OWN_REBUILD" ? null : (input.customerId ?? null);
    if (customerId)
      await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
    else if (input.purpose !== "OWN_REBUILD")
      customerId = (
        await tx.customer.create({ data: { name: input.customer! } })
      ).id;
    // Reuse an exact reference only within the same owner's history.
    if (
      customerId &&
      !(await tx.customer.findFirst({
        where: { id: customerId, deletedAt: null },
      }))
    )
      throw new DomainError(
        "El cliente fue eliminado. Selecciona otro cliente.",
      );
    const chosen = input.assetId
      ? await tx.asset.findUniqueOrThrow({ where: { id: input.assetId } })
      : null;
    if (
      chosen &&
      (chosen.customerId !== customerId || chosen.kind !== input.kind)
    )
      throw new DomainError("El activo no corresponde a este cliente o tipo.");
    if (
      !chosen &&
      input.kind === "VEHICLE" &&
      input.reference &&
      (await tx.asset.findFirst({
        where: {
          plate: input.reference,
          customerId: { not: customerId ?? undefined },
        },
      }))
    )
      throw new DomainError(
        "La placa está registrada con otro propietario. Revisa el activo antes de crear otra ficha.",
      );
    const match =
      chosen ??
      (input.reference
        ? await tx.asset.findFirst({
            where: {
              customerId,
              kind: input.kind,
              ...(input.kind === "VEHICLE"
                ? { plate: input.reference }
                : { serial: input.reference }),
            },
          })
        : null);
    const asset =
      match ??
      (await tx.asset.create({
        data: {
          kind: input.kind,
          description: input.title,
          customerId,
          ...(input.kind === "VEHICLE"
            ? { plate: input.reference }
            : { serial: input.reference }),
        },
      }));
    await assertCategory(tx, input.businessCategoryId);
    const order = await tx.workOrder.create({
      data: {
        title: input.title,
        businessCategoryId: input.businessCategoryId,
        reportedProblem: input.problem,
        authorization: input.authorization,
        purpose: input.purpose,
        responsibleId: input.responsibleId,
        tasks: {
          create: input.initialTasks.map((t) => ({
            title: t.title,
            plannedMinutes: t.plannedMinutes,
            dueAt: input.dueAt
              ? new Date(`${input.dueAt}T22:00:00Z`)
              : undefined,
            assignments: { create: { memberId: t.memberId } },
          })),
        },
        customerId,
        locationId: input.locationId,
        dueAt: input.dueAt ? new Date(`${input.dueAt}T22:00:00Z`) : undefined,
        assets: { create: { assetId: asset.id } },
      },
      include: {
        tasks: {
          select: { id: true, assignments: { select: { memberId: true } } },
        },
      },
    });
    for (const task of order.tasks ?? [])
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: task.id,
          action: "TASK_ASSIGNED",
          details: {
            members: task.assignments.map((a) => a.memberId),
            orderId: order.id,
          },
        },
      });
    if (quote)
      await tx.quote.updateMany({
        where: { groupId: quote.groupId },
        data: { orderId: order.id },
      });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: order.id,
        action: "ORDER_RECEIVED",
        details: {
          number: order.number,
          purpose: input.purpose,
          quoteId: quote?.id ?? null,
          responsibleId: input.responsibleId ?? null,
          initialTasks: input.initialTasks.length,
        },
      },
    });
    return { id: order.id, number: order.number };
  });
}
export async function transitionOrder(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "orders:write");
  const input = z
    .object({
      requestId: z.uuid(),
      orderId: z.uuid(),
      version: z.number().int().nonnegative(),
      status: z.enum([
        "DIAGNOSING",
        "IN_PROGRESS",
        "ON_HOLD",
        "QUALITY_REVIEW",
        "READY",
        "CLOSED",
        "CANCELLED",
      ]),
      reason: z.string().trim().max(1000).optional().default(""),
    })
    .parse(raw);
  return once(actor, input.requestId, "ORDER_TRANSITION", input, async (tx) => {
    const order = await tx.workOrder.findUniqueOrThrow({
      where: { id: input.orderId },
    });
    if (order.version !== input.version)
      throw new DomainError("La orden cambió. Actualiza antes de continuar.");
    assertOrderTransition(order.status, input.status);
    if (["READY", "CLOSED"].includes(input.status)) {
      const checks = await tx.orderCheck.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: "desc" },
      });
      const latest = new Map<string, string>();
      for (const check of checks)
        if (!latest.has(check.name)) latest.set(check.name, check.result);
      if (!latest.size || [...latest.values()].some((r) => r !== "PASS"))
        throw new DomainError(
          "Registra resultados satisfactorios de las pruebas técnicas antes de entregar.",
        );
    }
    if (
      input.status === "CLOSED" &&
      order.purpose !== "OWN_REBUILD" &&
      !(await tx.orderHandover.findFirst({
        where: { orderId: order.id, kind: "DELIVERY" },
      }))
    )
      throw new DomainError(
        "Registra la constancia de entrega antes de cerrar la orden.",
      );
    if (
      ["CLOSED", "CANCELLED"].includes(input.status) &&
      (await tx.stockReservation.count({
        where: { orderId: order.id, status: "ACTIVE" },
      }))
    )
      throw new DomainError(
        "Consume o libera las reservas de repuestos antes de cerrar la orden.",
      );
    if (
      ["QUALITY_REVIEW", "READY", "CLOSED"].includes(input.status) &&
      (await tx.task.count({
        where: { orderId: order.id, deletedAt: null, status: { not: "DONE" } },
      })) > 0
    )
      throw new DomainError("Termina las tareas pendientes antes de avanzar.");
    await tx.workOrder.update({
      where: { id: order.id },
      data: {
        status: input.status,
        version: { increment: 1 },
        closedAt: input.status === "CLOSED" ? new Date() : null,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: order.id,
        action: "ORDER_TRANSITION",
        details: {
          from: order.status,
          to: input.status,
          reason: input.reason || null,
        },
      },
    });
    return { id: order.id };
  });
}
export async function assignTask(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "orders:write");
  const input = z
    .object({
      requestId: z.uuid(),
      orderId: z.uuid().optional(),
      title: z.string().trim().min(3).max(250),
      description: z.string().trim().max(5000).default(""),
      plannedMinutes: z.coerce.number().int().min(1).max(43200).optional(),
      assetId: z.uuid().optional(),
      dueAt: z.iso.date().optional(),
      memberIds: z.array(z.uuid()).min(1).max(20),
    })
    .parse(raw);
  return once(actor, input.requestId, "TASK_ASSIGNED", input, async (tx) => {
    if (input.orderId) {
      const order = await tx.workOrder.findUniqueOrThrow({
        where: { id: input.orderId },
      });
      if (["CLOSED", "CANCELLED"].includes(order.status))
        throw new DomainError("La orden está cerrada.");
    }
    const ids = [...new Set(input.memberIds)];
    if (
      (await tx.member.count({ where: { id: { in: ids }, active: true } })) !==
      ids.length
    )
      throw new DomainError("Hay un empleado inactivo o inexistente.");
    const task = await tx.task.create({
      data: {
        orderId: input.orderId,
        title: input.title,
        description: input.description,
        plannedMinutes: input.plannedMinutes ?? null,
        dueAt: input.dueAt ? new Date(`${input.dueAt}T17:00:00Z`) : undefined,
        assignments: { create: ids.map((memberId) => ({ memberId })) },
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: task.id,
        action: "TASK_ASSIGNED",
        details: { members: ids },
      },
    });
    return { id: task.id };
  });
}
export async function changeTaskStatus(actor: Actor, raw: unknown) {
  const input = z
    .object({
      taskId: z.uuid(),
      status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]),
    })
    .parse(raw);
  return serializable(async (tx) => {
    const task = await tx.task.findUniqueOrThrow({
      where: { id: input.taskId },
      include: { assignments: true, order: true },
    });
    if (task.deletedAt) throw new DomainError("La tarea está eliminada.");
    if (
      actor.role === "MECHANIC" &&
      !task.assignments.some((a) => a.memberId === actor.id)
    )
      throw new AccessDenied();
    if (task.order && ["CLOSED", "CANCELLED"].includes(task.order.status))
      throw new DomainError("La orden está cerrada.");
    await tx.task.update({
      where: { id: task.id },
      data: { status: input.status, version: { increment: 1 } },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: task.id,
        action: "TASK_STATUS_CHANGED",
        details: { from: task.status, to: input.status },
      },
    });
    return { id: task.id };
  });
}
