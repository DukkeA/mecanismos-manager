import "server-only";
import { z } from "zod";
import { serializable } from "./commands";
import { canContributeToTask, AccessDenied, type Role } from "@/domain/permissions";

const timeInput = z.object({
  taskId: z.uuid(), idempotencyKey: z.uuid(),
  minutes: z.number().int().min(1).max(1440),
  workedOn: z.iso.date(), note: z.string().trim().min(1).max(1000),
});

export async function recordTaskTime(actor: {id: string; role: Role}, raw: unknown) {
  const input = timeInput.parse(raw);
  return serializable(async (tx) => {
    const task = await tx.task.findUnique({where: {id: input.taskId}, select: {
      id: true, order: {select: {status: true}}, assignments: {select: {memberId: true}},
    }});
    if (!task || !canContributeToTask(actor.role, actor.id, task.assignments.map(a => a.memberId))) throw new AccessDenied();
    const existing = await tx.timeEntry.findUnique({where: {idempotencyKey: input.idempotencyKey}});
    if (existing) {
      if (existing.memberId !== actor.id || existing.taskId !== input.taskId || existing.minutes !== input.minutes || existing.note !== input.note || existing.workedOn.toISOString().slice(0, 10) !== input.workedOn) throw new Error("La solicitud ya existe con otros datos.");
      return {id: existing.id};
    }
    if (task.order && ["CLOSED", "CANCELLED"].includes(task.order.status)) throw new Error("La orden está cerrada.");
    const entry = await tx.timeEntry.create({data: {...input, memberId: actor.id, workedOn: new Date(`${input.workedOn}T00:00:00.000Z`)}});
    await tx.auditEvent.create({data: {actorId: actor.id, action: "TASK_TIME_RECORDED", entityId: entry.id, details: {taskId: input.taskId, minutes: input.minutes}}});
    return {id: entry.id};
  });
}
