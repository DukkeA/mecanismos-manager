import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db } from "@/server/db";
import { assignTask, changeTaskStatus } from "@/server/operations-service";
import { addTaskNote, editTask, archiveTask } from "@/server/task-service";
import { saveTaskPhoto } from "@/server/task-photos";
import { saveItem, moveStock } from "@/server/inventory-service";
import { getOperations } from "@/server/operations-query";
const admin = { id: randomUUID(), role: "ADMIN" as const },
  office = { id: randomUUID(), role: "OFFICE" as const },
  mechanic = { id: randomUUID(), role: "MECHANIC" as const },
  other = { id: randomUUID(), role: "MECHANIC" as const };
const actors = [admin, office, mechanic, other],
  ids = actors.map((a) => a.id),
  itemIds: string[] = [];
let taskId: string;
beforeAll(async () => {
  await db().member.createMany({
    data: actors.map((a) => ({
      ...a,
      email: `${a.id}@example.invalid`,
      name: `Detalle ${a.role}`,
    })),
  });
  taskId = (
    await assignTask(admin, {
      requestId: randomUUID(),
      title: "Comprobar presión",
      description: "Medir en frío y registrar resultados.",
      memberIds: [mechanic.id],
    })
  ).id;
});
afterAll(async () => {
  await db().taskPhoto.deleteMany({ where: { taskId } });
  await db().taskNote.deleteMany({ where: { taskId } });
  await db().auditEvent.deleteMany({ where: { actorId: { in: ids } } });
  await db().commandReceipt.deleteMany({ where: { actorId: { in: ids } } });
  await db().taskAssignment.deleteMany({ where: { taskId } });
  await db().task.deleteMany({ where: { id: taskId } });
  await db().catalogItem.deleteMany({ where: { id: { in: itemIds } } });
  await db().member.deleteMany({ where: { id: { in: ids } } });
  await db().$disconnect();
});
it("persists observations once and rejects unrelated mechanics", async () => {
  const note = {
    requestId: randomUUID(),
    taskId,
    body: "Retorno elevado en el inyector 3.",
  };
  expect(await addTaskNote(mechanic, note)).toEqual(
    await addTaskNote(mechanic, note),
  );
  await expect(
    addTaskNote(other, { ...note, requestId: randomUUID() }),
  ).rejects.toThrow("permiso");
  const view = await getOperations(mechanic);
  const task = view.tasks.find((t) => t.id === taskId)!;
  expect(task.notes).toHaveLength(1);
  expect(task.history?.some((h) => h.action === "TASK_NOTE_ADDED")).toBe(true);
  expect((await getOperations(other)).tasks.some((t) => t.id === taskId)).toBe(
    false,
  );
});
it("edits assignments with version checks and denies mechanic edits", async () => {
  const edit = {
    requestId: randomUUID(),
    taskId,
    version: 0,
    title: "Comprobar presión y retorno",
    description: "Repetir prueba en caliente.",
    memberIds: [mechanic.id, office.id],
  };
  await expect(editTask(mechanic, edit)).rejects.toThrow("permiso");
  await editTask(office, edit);
  await expect(
    editTask(office, { ...edit, requestId: randomUUID() }),
  ).rejects.toThrow("cambió");
  expect(
    (await getOperations(office)).tasks.find((t) => t.id === taskId)?.members,
  ).toHaveLength(2);
});
it("validates photos and saves private metadata without exposing bytes in snapshot", async () => {
  const bytes = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "#087484" },
  })
    .png()
    .toBuffer();
  const input = {
    taskId,
    requestId: randomUUID(),
    caption: "Prueba de adjunto",
  };
  await expect(saveTaskPhoto(other, input, bytes)).rejects.toThrow("permiso");
  await expect(
    saveTaskPhoto(mechanic, input, Buffer.from("not an image")),
  ).rejects.toThrow("válida");
  const first = await saveTaskPhoto(mechanic, input, bytes);
  expect(await saveTaskPhoto(mechanic, input, bytes)).toEqual(first);
  const task = (await getOperations(mechanic)).tasks.find(
    (t) => t.id === taskId,
  )!;
  expect(task.photos).toHaveLength(1);
  expect(task.photos?.[0]).not.toHaveProperty("content");
});
it("soft deletes only as admin, preserves notes and restores assignments", async () => {
  const input = {
    requestId: randomUUID(),
    taskId,
    reason: "Trabajo duplicado",
  };
  await expect(archiveTask(office, input)).rejects.toThrow("permiso");
  await archiveTask(admin, input);
  expect(
    (await getOperations(mechanic)).tasks.some((t) => t.id === taskId),
  ).toBe(false);
  expect(
    (await getOperations(admin)).archivedTasks?.some((t) => t.id === taskId),
  ).toBe(true);
  await expect(
    changeTaskStatus(mechanic, { taskId, status: "DONE" }),
  ).rejects.toThrow("eliminada");
  await archiveTask(admin, {
    ...input,
    requestId: randomUUID(),
    restore: true,
  });
  const task = (await getOperations(admin)).tasks.find((t) => t.id === taskId)!;
  expect(task.notes).toHaveLength(1);
  expect(task.members).toContain(mechanic.id);
});
it("keeps part references and service scope, and rejects stocking a service", async () => {
  const part = await saveItem(admin, {
    code: randomUUID(),
    name: "Tobera de prueba",
    kind: "PART",
    unit: "unidad",
    reference: "DLLA-TEST",
    notes: "Validar número antes de instalar.",
  });
  itemIds.push(part.id);
  const service = await saveItem(office, {
    code: randomUUID(),
    name: "Escaneo de motor",
    kind: "SERVICE",
    notes: "Lectura y entrega de códigos.",
  });
  itemIds.push(service.id);
  const view = await getOperations(admin);
  expect(view.items.find((i) => i.id === part.id)?.reference).toBe("DLLA-TEST");
  expect(view.items.find((i) => i.id === service.id)?.notes).toContain(
    "códigos",
  );
  await expect(
    saveItem(admin, {
      id: part.id,
      code: randomUUID(),
      name: "Cambio inválido",
      kind: "SERVICE",
    }),
  ).rejects.toThrow("convertir");
  await expect(
    moveStock(admin, {
      requestId: randomUUID(),
      itemId: service.id,
      locationId: "00000000-0000-4000-8000-000000000002",
      quantity: "1",
      unitCost: "100",
      condition: "NEW",
      kind: "RECEIPT",
      reason: "No permitido",
    }),
  ).rejects.toThrow();
});
