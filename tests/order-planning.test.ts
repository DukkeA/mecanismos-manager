import { beforeEach, describe, expect, it, vi } from "vitest";
const tx = vi.hoisted(() => ({
  member: { count: vi.fn(), findFirst: vi.fn() },
  location: { findUniqueOrThrow: vi.fn() },
  customer: { findUniqueOrThrow: vi.fn(), findFirst: vi.fn() },
  asset: { findUniqueOrThrow: vi.fn() },
  workOrder: { create: vi.fn() },
  task: { findUnique: vi.fn() },
  timeEntry: { findUnique: vi.fn(), aggregate: vi.fn(), create: vi.fn() },
  overtimeEntry: { aggregate: vi.fn() },
  auditEvent: { create: vi.fn() },
}));
vi.mock("@/server/commands", () => ({
  once: (
    _a: unknown,
    _id: unknown,
    _k: unknown,
    _i: unknown,
    run: (tx: unknown) => unknown,
  ) => run(tx),
  serializable: (run: (tx: unknown) => unknown) => run(tx),
  setActor: vi.fn(),
}));
vi.mock("@/server/category-service", () => ({ assertCategory: vi.fn() }));
import { receiveOrder } from "@/server/operations-service";
import { recordTaskTime } from "@/server/task-service";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const office = { id: uuid(1), role: "OFFICE" as const },
  mechanic = { id: uuid(2), role: "MECHANIC" as const };
beforeEach(() => {
  vi.resetAllMocks();
  tx.member.count.mockResolvedValue(1);
  tx.member.findFirst.mockResolvedValue({ id: mechanic.id });
  tx.customer.findFirst.mockResolvedValue({ id: uuid(3) });
  tx.asset.findUniqueOrThrow.mockResolvedValue({
    id: uuid(4),
    kind: "COMPONENT",
    customerId: uuid(3),
  });
  tx.workOrder.create.mockResolvedValue({ id: uuid(5), number: 1 });
  tx.task.findUnique.mockResolvedValue({
    id: uuid(6),
    deletedAt: null,
    order: { status: "IN_PROGRESS" },
    assignments: [{ memberId: mechanic.id }],
  });
  tx.timeEntry.aggregate.mockResolvedValue({ _sum: { minutes: 0 } });
  tx.overtimeEntry.aggregate.mockResolvedValue({ _sum: { minutes: 0 } });
  tx.timeEntry.create.mockResolvedValue({ id: uuid(7) });
});
const orderInput = () => ({
  requestId: uuid(10),
  title: "Bomba de inyección",
  customerId: uuid(3),
  assetId: uuid(4),
  reference: "",
  kind: "COMPONENT",
  locationId: uuid(8),
  problem: "No mantiene presión",
  responsibleId: mechanic.id,
  dueAt: "2026-09-20",
  initialTasks: [
    { title: "Probar en banco", memberId: mechanic.id, plannedMinutes: 60 },
  ],
});
const timeInput = () => ({
  taskId: uuid(6),
  idempotencyKey: uuid(9),
  memberId: mechanic.id,
  minutes: 45,
  workedOn: "2026-09-15",
  note: "Prueba de presión",
});
describe("order planning and attributed labor", () => {
  it("creates the responsible and initial tasks in the same order write", async () => {
    await receiveOrder(office, orderInput());
    const data = tx.workOrder.create.mock.calls[0][0].data;
    expect(data.responsibleId).toBe(mechanic.id);
    expect(data.tasks.create[0]).toMatchObject({
      title: "Probar en banco",
      plannedMinutes: 60,
      assignments: { create: { memberId: mechanic.id } },
    });
    expect(data.dueAt.toISOString()).toBe("2026-09-20T22:00:00.000Z");
  });
  it("rejects inactive/missing assignees before creating records", async () => {
    tx.member.count.mockResolvedValue(0);
    await expect(receiveOrder(office, orderInput())).rejects.toThrow("activos");
    expect(tx.workOrder.create).not.toHaveBeenCalled();
  });
  it("rejects a malformed initial task and mechanic-created orders", async () => {
    await expect(
      receiveOrder(office, {
        ...orderInput(),
        initialTasks: [{ title: "x", memberId: "" }],
      }),
    ).rejects.toThrow();
    await expect(receiveOrder(mechanic, orderInput())).rejects.toThrow();
    expect(tx.workOrder.create).not.toHaveBeenCalled();
  });
  it("attributes office-entered work to the mechanic while auditing the office actor", async () => {
    await recordTaskTime(office, timeInput());
    expect(tx.timeEntry.create.mock.calls[0][0].data.memberId).toBe(
      mechanic.id,
    );
    expect(tx.timeEntry.aggregate.mock.calls[0][0].where.memberId).toBe(
      mechanic.id,
    );
    expect(tx.auditEvent.create.mock.calls[0][0].data.actorId).toBe(office.id);
  });
  it("prevents mechanics from crediting another employee and unassigned time", async () => {
    await expect(
      recordTaskTime(mechanic, { ...timeInput(), memberId: office.id }),
    ).rejects.toThrow();
    await expect(
      recordTaskTime(office, { ...timeInput(), memberId: office.id }),
    ).rejects.toThrow("asignado");
    expect(tx.timeEntry.create).not.toHaveBeenCalled();
  });
  it("uses the credited employee for replay and daily limits", async () => {
    tx.timeEntry.findUnique.mockResolvedValue({
      ...timeInput(),
      id: uuid(7),
      workedOn: new Date("2026-09-15T00:00:00Z"),
    });
    await expect(recordTaskTime(office, timeInput())).resolves.toEqual({
      id: uuid(7),
    });
    tx.timeEntry.findUnique.mockResolvedValue(null);
    tx.timeEntry.aggregate.mockResolvedValue({ _sum: { minutes: 1420 } });
    await expect(recordTaskTime(office, timeInput())).rejects.toThrow(
      "24 horas",
    );
    expect(tx.timeEntry.create).not.toHaveBeenCalled();
  });
});
