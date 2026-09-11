import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { transferCash } from "@/server/cash-transfers";
import { reverseCash } from "@/server/cash-service";
const admin = { id: randomUUID(), role: "ADMIN" as const },
  office = { id: randomUUID(), role: "OFFICE" as const },
  mechanic = { id: randomUUID(), role: "MECHANIC" as const };
const actors = [admin, office, mechanic],
  ids = actors.map((a) => a.id);
let sourceAccountId: string, destinationAccountId: string;
const input = (amount = "25.15") => ({
  requestId: randomUUID(),
  sourceAccountId,
  destinationAccountId,
  amount,
  note: "Reposición de caja menor",
  reference: "TR-01",
  occurredOn: "2026-09-10",
});
const balances = async () =>
  Promise.all(
    [sourceAccountId, destinationAccountId].map(async (id) =>
      (
        await db().moneyAccount.findUniqueOrThrow({ where: { id } })
      ).balance.toFixed(2),
    ),
  );
beforeAll(async () => {
  await db().member.createMany({
    data: actors.map((a) => ({
      ...a,
      name: "Prueba transferencia",
      email: `${a.id}@example.invalid`,
    })),
  });
});
beforeEach(async () => {
  sourceAccountId = (
    await db().moneyAccount.create({
      data: { name: randomUUID(), balance: "100", openingBalance: "100" },
    })
  ).id;
  destinationAccountId = (
    await db().moneyAccount.create({
      data: { name: randomUUID(), balance: "0", openingBalance: "0" },
    })
  ).id;
});
afterEach(async () => {
  await db().cashEntry.deleteMany({ where: { actorId: { in: ids } } });
  await db().auditEvent.deleteMany({ where: { actorId: { in: ids } } });
  await db().commandReceipt.deleteMany({ where: { actorId: { in: ids } } });
  await db().moneyAccount.deleteMany({
    where: { id: { in: [sourceAccountId, destinationAccountId] } },
  });
});
afterAll(async () => {
  await db().member.deleteMany({ where: { id: { in: ids } } });
  await db().$disconnect();
});
it("records both sides once and preserves the total", async () => {
  const payload = input();
  const [a, b] = await Promise.all([
    transferCash(office, payload),
    transferCash(office, payload),
  ]);
  expect(a).toEqual(b);
  expect(await balances()).toEqual(["74.85", "25.15"]);
  const entries = await db().cashEntry.findMany({
    where: { transferId: a.id },
  });
  expect(entries).toHaveLength(2);
  expect(entries.map((e) => e.direction).sort()).toEqual(["IN", "OUT"]);
});
it("rejects invalid accounts, insufficient balance and unauthorized users without partial writes", async () => {
  await expect(
    transferCash(office, { ...input(), destinationAccountId: sourceAccountId }),
  ).rejects.toThrow("diferente");
  await expect(transferCash(office, input("0"))).rejects.toThrow();
  await expect(transferCash(office, input("101"))).rejects.toThrow("saldo");
  await expect(
    transferCash(office, { ...input(), destinationAccountId: randomUUID() }),
  ).rejects.toThrow();
  await expect(transferCash(mechanic, input())).rejects.toThrow("permiso");
  expect(await balances()).toEqual(["100.00", "0.00"]);
  expect(await db().cashEntry.count({ where: { actorId: { in: ids } } })).toBe(
    0,
  );
});
it("serializes competing withdrawals from one account", async () => {
  const results = await Promise.allSettled([
    transferCash(office, input("75")),
    transferCash(office, input("75")),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await balances()).toEqual(["25.00", "75.00"]);
});
it("reverses both entries together and cannot reverse the other half again", async () => {
  const transfer = await transferCash(office, input());
  const pair = await db().cashEntry.findMany({
    where: { transferId: transfer.id },
  });
  const reversal = {
    requestId: randomUUID(),
    entryId: pair[0].id,
    reason: "Transferencia registrada por error",
    occurredOn: "2026-09-11",
  };
  await expect(reverseCash(office, reversal)).rejects.toThrow("permiso");
  expect(await reverseCash(admin, reversal)).toEqual(
    await reverseCash(admin, reversal),
  );
  expect(await balances()).toEqual(["100.00", "0.00"]);
  expect(
    await db().cashEntry.count({ where: { transferId: transfer.id } }),
  ).toBe(4);
  await expect(
    reverseCash(admin, {
      ...reversal,
      requestId: randomUUID(),
      entryId: pair[1].id,
    }),
  ).rejects.toThrow("reversión");
});
it("blocks a reversal after the destination money has moved elsewhere", async () => {
  const first = await transferCash(office, input("75"));
  await transferCash(office, {
    ...input("70"),
    sourceAccountId: destinationAccountId,
    destinationAccountId: sourceAccountId,
  });
  const entry = await db().cashEntry.findFirstOrThrow({
    where: { transferId: first.id },
  });
  await expect(
    reverseCash(admin, {
      requestId: randomUUID(),
      entryId: entry.id,
      reason: "Corregir traslado",
      occurredOn: "2026-09-11",
    }),
  ).rejects.toThrow("saldo");
  expect(await balances()).toEqual(["95.00", "5.00"]);
  expect(await db().cashEntry.count({ where: { transferId: first.id } })).toBe(
    2,
  );
});
it("enforces balanced pairs at the database boundary", async () => {
  await expect(
    db().cashEntry.create({
      data: {
        accountId: sourceAccountId,
        transferId: randomUUID(),
        kind: "TRANSFER",
        direction: "OUT",
        amount: "5",
        counterparty: "Destino",
        reference: "",
        note: "Incompleta",
        occurredOn: new Date("2026-09-10"),
        actorId: admin.id,
      },
    }),
  ).rejects.toThrow();
  expect(await balances()).toEqual(["100.00", "0.00"]);
});
