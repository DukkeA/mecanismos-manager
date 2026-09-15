import "server-only";
import { DomainError } from "@/domain/errors";
import { once, setActor, type Actor } from "./commands";
import { requirePermission } from "@/domain/permissions";
import { z } from "zod";
import { serializable } from "./commands";
import {
  canContributeToTask,
  AccessDenied,
  type Role,
} from "@/domain/permissions";
const timeInput = z.object({
  memberId: z.uuid().optional(),
  taskId: z.uuid(),
  idempotencyKey: z.uuid(),
  minutes: z.number().int().min(1).max(1440),
  workedOn: z.iso.date(),
  note: z.string().trim().min(1).max(1000),
});
export async function recordTaskTime(
  actor: { id: string; role: Role },
  raw: unknown,
) {
  const input = timeInput.parse(raw);
  const memberId = input.memberId ?? actor.id;
  if (actor.role === "MECHANIC" && memberId !== actor.id)
    throw new AccessDenied();
  return serializable(async (tx) => {
    await setActor(tx, actor);
    const task = await tx.task.findUnique({
      where: { id: input.taskId },
      select: {
        id: true,
        deletedAt: true,
        order: { select: { status: true } },
        assignments: { select: { memberId: true } },
      },
    });
    if (
      !task ||
      task.deletedAt ||
      !canContributeToTask(
        actor.role,
        actor.id,
        task.assignments.map((a) => a.memberId),
      )
    )
      throw new AccessDenied();
    if (
      !task.assignments.some((a) => a.memberId === memberId) ||
      !(await tx.member.findFirst({ where: { id: memberId, active: true } }))
    )
      throw new DomainError(
        "El empleado debe estar activo y asignado a esta tarea.",
      );
    const existing = await tx.timeEntry.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (
        existing.memberId !== memberId ||
        existing.taskId !== input.taskId ||
        existing.minutes !== input.minutes ||
        existing.note !== input.note ||
        existing.workedOn.toISOString().slice(0, 10) !== input.workedOn
      )
        throw new Error("La solicitud ya existe con otros datos.");
      return { id: existing.id };
    }
    if (task.order && ["CLOSED", "CANCELLED"].includes(task.order.status))
      throw new Error("La orden está cerrada.");
    const workedOn = new Date(`${input.workedOn}T00:00:00.000Z`);
    const [regular, extra] = await Promise.all([
      tx.timeEntry.aggregate({
        where: { memberId, workedOn },
        _sum: { minutes: true },
      }),
      tx.overtimeEntry.aggregate({
        where: { memberId, workedOn, voidedAt: null },
        _sum: { minutes: true },
      }),
    ]);
    if (
      (regular._sum.minutes ?? 0) + (extra._sum.minutes ?? 0) + input.minutes >
      1440
    )
      throw new DomainError(
        "El tiempo registrado supera las 24 horas de ese día.",
      );
    const entry = await tx.timeEntry.create({
      data: {
        ...input,
        memberId,
        workedOn: new Date(`${input.workedOn}T00:00:00.000Z`),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        action: "TASK_TIME_RECORDED",
        entityId: entry.id,
        details: { taskId: input.taskId, memberId, minutes: input.minutes },
      },
    });
    return { id: entry.id };
  });
}
const editInput = z.object({
  requestId: z.uuid(),
  taskId: z.uuid(),
  version: z.number().int().nonnegative(),
  title: z.string().trim().min(3).max(250),
  description: z.string().trim().max(5000).default(""),
  plannedMinutes: z.coerce.number().int().min(1).max(43200).optional(),
  dueAt: z.iso.date().optional(),
  memberIds: z.array(z.uuid()).min(1).max(20),
});
export async function editTask(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "orders:write");
  const input = editInput.parse(raw);
  return once(actor, input.requestId, "TASK_EDITED", input, async (tx) => {
    const task = await tx.task.findUniqueOrThrow({
      where: { id: input.taskId },
      include: { order: true },
    });
    if (
      task.deletedAt ||
      (task.order && ["CLOSED", "CANCELLED"].includes(task.order.status))
    )
      throw new DomainError("La tarea ya no admite cambios.");
    if (task.version !== input.version)
      throw new DomainError(
        "La tarea cambió. Cierra la ficha y vuelve a abrirla antes de editar.",
      );
    const ids = [...new Set(input.memberIds)];
    if (
      (await tx.member.count({ where: { id: { in: ids }, active: true } })) !==
      ids.length
    )
      throw new DomainError("Hay un responsable inactivo o inexistente.");
    await tx.taskAssignment.deleteMany({ where: { taskId: task.id } });
    await tx.task.update({
      where: { id: task.id },
      data: {
        title: input.title,
        description: input.description,
        plannedMinutes: input.plannedMinutes ?? null,
        dueAt: input.dueAt ? new Date(`${input.dueAt}T17:00:00Z`) : null,
        version: { increment: 1 },
        assignments: { create: ids.map((memberId) => ({ memberId })) },
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: task.id,
        action: "TASK_EDITED",
        details: {
          before: {
            title: task.title,
            description: task.description,
            plannedMinutes: task.plannedMinutes,
            dueAt: task.dueAt?.toISOString() ?? null,
          },
          after: {
            title: input.title,
            description: input.description,
            plannedMinutes: input.plannedMinutes ?? null,
            dueAt: input.dueAt ?? null,
            members: ids,
          },
        },
      },
    });
    return { id: task.id };
  });
}
export async function archiveTask(actor: Actor, raw: unknown) {
  if (actor.role !== "ADMIN") throw new AccessDenied();
  const input = z
    .object({
      requestId: z.uuid(),
      taskId: z.uuid(),
      restore: z.boolean().default(false),
      reason: z.string().trim().min(3).max(1000),
    })
    .parse(raw);
  return once(actor, input.requestId, "TASK_ARCHIVE", input, async (tx) => {
    const task = await tx.task.findUniqueOrThrow({
      where: { id: input.taskId },
      include: { order: true },
    });
    if (task.order && ["CLOSED", "CANCELLED"].includes(task.order.status))
      throw new DomainError("La orden está cerrada.");
    if (Boolean(task.deletedAt) === !input.restore)
      throw new DomainError(
        input.restore
          ? "La tarea ya está activa."
          : "La tarea ya está eliminada.",
      );
    await tx.task.update({
      where: { id: task.id },
      data: {
        deletedAt: input.restore ? null : new Date(),
        version: { increment: 1 },
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: task.id,
        action: input.restore ? "TASK_RESTORED" : "TASK_DELETED",
        details: { reason: input.reason },
      },
    });
    return { id: task.id };
  });
}
export async function addTaskNote(actor: Actor, raw: unknown) {
  const input = z
    .object({
      requestId: z.uuid(),
      taskId: z.uuid(),
      body: z.string().trim().min(1).max(5000),
    })
    .parse(raw);
  return once(actor, input.requestId, "TASK_NOTE", input, async (tx) => {
    const task = await tx.task.findUniqueOrThrow({
      where: { id: input.taskId },
      include: { assignments: true, order: true },
    });
    if (
      !canContributeToTask(
        actor.role,
        actor.id,
        task.assignments.map((a) => a.memberId),
      )
    )
      throw new AccessDenied();
    if (
      task.deletedAt ||
      (task.order && ["CLOSED", "CANCELLED"].includes(task.order.status))
    )
      throw new DomainError("La tarea ya no admite observaciones.");
    const note = await tx.taskNote.create({
      data: { taskId: task.id, actorId: actor.id, body: input.body },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: task.id,
        action: "TASK_NOTE_ADDED",
        details: { noteId: note.id },
      },
    });
    return { id: note.id };
  });
}
