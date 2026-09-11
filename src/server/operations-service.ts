import { DomainError } from "@/domain/errors";
import "server-only";
import { z } from "zod";
import { db } from "./db";
import { once, serializable, type Actor } from "./commands";
import { requirePermission, AccessDenied } from "@/domain/permissions";
import { assertOrderTransition } from "@/domain/order-lifecycle";
const memberInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(160),
  email: z.email().transform((v) => v.toLowerCase()),
  role: z.enum(["ADMIN", "OFFICE", "MECHANIC"]),
  active: z.boolean(),
});
export async function saveMember(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const input = memberInput.parse(raw);
  return serializable(async (tx) => {
    if (input.id === actor.id && (!input.active || input.role !== "ADMIN"))
      throw new DomainError(
        "No puedes desactivar tu propio acceso de administrador.",
      );
    const before = input.id
      ? await tx.member.findUniqueOrThrow({ where: { id: input.id } })
      : null;
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
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: member.id,
        action: "MEMBER_SAVED",
        details: { role: input.role, active: input.active },
      },
    });
    return { id: member.id };
  });
}
const customerInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(180),
  document: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.union([z.email(), z.literal("")]).optional(),
});
export async function saveCustomer(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "customers:write");
  const input = customerInput.parse(raw);
  return db().$transaction(async (tx) => {
    const customer = input.id
      ? await tx.customer.update({ where: { id: input.id, deletedAt: null }, data: input })
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
  });
}
const orderInput = z
  .object({
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
  const input = orderInput.parse(raw);
  return once(actor, input.requestId, "ORDER_RECEIVED", input, async (tx) => {
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
    if (customerId && !await tx.customer.findFirst({where: {id: customerId, deletedAt: null}})) throw new DomainError("El cliente fue eliminado. Selecciona otro cliente.");
    const match = input.reference
      ? await tx.asset.findFirst({
          where: {
            customerId,
            kind: input.kind,
            ...(input.kind === "VEHICLE"
              ? { plate: input.reference }
              : { serial: input.reference }),
          },
        })
      : null;
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
    const order = await tx.workOrder.create({
      data: {
        title: input.title,
        reportedProblem: input.problem,
        authorization: input.authorization,
        purpose: input.purpose,
        customerId,
        locationId: input.locationId,
        dueAt: input.dueAt ? new Date(`${input.dueAt}T17:00:00Z`) : undefined,
        assets: { create: { assetId: asset.id } },
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: order.id,
        action: "ORDER_RECEIVED",
        details: { number: order.number, purpose: input.purpose },
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
      reason: z.string().trim().min(3).max(1000),
    })
    .parse(raw);
  return once(actor, input.requestId, "ORDER_TRANSITION", input, async (tx) => {
    const order = await tx.workOrder.findUniqueOrThrow({
      where: { id: input.orderId },
    });
    if (order.version !== input.version)
      throw new DomainError("La orden cambió. Actualiza antes de continuar.");
    assertOrderTransition(order.status, input.status);
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
        details: { from: order.status, to: input.status, reason: input.reason },
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
