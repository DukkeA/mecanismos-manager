import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { recordTaskTime } from "@/server/task-service";

const memberId = randomUUID();
const otherId = randomUUID();
const taskId = randomUUID();
const actor = {id: memberId, role: "MECHANIC" as const};
const input = {taskId, idempotencyKey: randomUUID(), minutes: 45, workedOn: "2026-09-09", note: "Prueba de presión en banco"};

beforeAll(async () => {
  await db().member.createMany({data: [memberId, otherId].map(id => ({id, email: `${id}@example.invalid`, name: "Test mechanic", role: "MECHANIC"}))});
  await db().task.create({data: {id: taskId, title: "Integration test", assignments: {create: {memberId}}}});
});

afterAll(async () => {
  await db().auditEvent.deleteMany({where: {actorId: {in: [memberId, otherId]}}});
  await db().timeEntry.deleteMany({where: {taskId}});
  await db().taskAssignment.deleteMany({where: {taskId}});
  await db().task.deleteMany({where: {id: taskId}});
  await db().member.deleteMany({where: {id: {in: [memberId, otherId]}}});
  await db().$disconnect();
});

describe("manual task time with real PostgreSQL", () => {
  it("records exactly one entry and one audit on a retry", async () => {
    const first = await recordTaskTime(actor, input);
    expect(await recordTaskTime(actor, input)).toEqual(first);
    expect(await db().timeEntry.count({where: {taskId}})).toBe(1);
    expect(await db().auditEvent.count({where: {entityId: first.id}})).toBe(1);
  });
  it("rejects a different payload under the same idempotency key", async () => {
    await expect(recordTaskTime(actor, {...input, minutes: 90})).rejects.toThrow("otros datos");
  });
  it("does not let another mechanic use the task or retrieve its retry result", async () => {
    await expect(recordTaskTime({id: otherId, role: "MECHANIC"}, input)).rejects.toThrow("permiso");
  });
});
