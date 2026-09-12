import { cleanupActivity } from "./activity-cleanup";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import {
  createAccount,
  createObligation,
  recordCash,
  reverseCash,
} from "@/server/cash-service";
import { getOperations } from "@/server/operations-query";

const admin = { id: randomUUID(), role: "ADMIN" as const };
const office = { id: randomUUID(), role: "OFFICE" as const };
const ids = [admin.id, office.id];
let accountId: string;
let obligationId: string;
let payrollId: string;
const payment = (amount: string) => ({
  requestId: randomUUID(),
  accountId,
  obligationId,
  kind: "EXPENSE_PAYMENT",
  amount,
  counterparty: "Test landlord",
  reference: "Test",
  note: "Integration payment",
  occurredOn: "2026-09-09",
});
beforeAll(async () => {
  await db().member.createMany({
    data: [admin, office].map((a) => ({
      ...a,
      name: "Cash test",
      email: `${a.id}@example.invalid`,
    })),
  });
  // Isolated ledger fixture: configured workshop accounts must never be changed by this test.
  accountId = (
    await db().moneyAccount.create({
      data: { name: randomUUID(), openingBalance: "1000", balance: "1000" },
    })
  ).id;
  obligationId = (
    await createObligation(office, {
      requestId: randomUUID(),
      title: "Test rent",
      category: "RENT",
      period: "2026-09",
      amount: "100",
      dueOn: "2026-09-15",
    })
  ).id;
  payrollId = (
    await createObligation(admin, {
      requestId: randomUUID(),
      title: "Confidential payroll",
      category: "PAYROLL",
      period: "2026-09",
      amount: "200",
      dueOn: "2026-09-30",
    })
  ).id;
});
afterAll(async () => {
  await db().auditEvent.deleteMany({ where: { actorId: { in: ids } } });
  await db().commandReceipt.deleteMany({ where: { actorId: { in: ids } } });
  await db().cashEntry.deleteMany({ where: { actorId: { in: ids } } });
  await db().obligation.deleteMany({
    where: { id: { in: [obligationId, payrollId].filter(Boolean) } },
  });
  if (accountId) await db().moneyAccount.delete({ where: { id: accountId } });
  await cleanupActivity(
    (await db().member.findMany({ where: { id: { in: ids } } })).map(
      (m) => m.id,
    ),
  );
  await db().member.deleteMany({ where: { id: { in: ids } } });
  await db().$disconnect();
});
describe("cash ledger against PostgreSQL", () => {
  it("restricts account creation to the four names and duplicate protection", async () => {
    await expect(
      createAccount(admin, {
        requestId: randomUUID(),
        name: "Otra caja",
        openingBalance: "0",
      }),
    ).rejects.toThrow();
    await expect(
      createAccount(office, {
        requestId: randomUUID(),
        name: "Oficina",
        openingBalance: "0",
      }),
    ).rejects.toThrow("ya existe");
    const existing = await db().moneyAccount.findUnique({
      where: { name: "Oficina" },
    });
    if (existing)
      await expect(
        createAccount(admin, {
          requestId: randomUUID(),
          name: "Oficina",
          openingBalance: "0",
        }),
      ).rejects.toThrow("ya existe");
  });
  it("prevents simultaneous payments from exceeding an obligation and reverses once", async () => {
    const results = await Promise.allSettled([
      recordCash(office, payment("75")),
      recordCash(office, payment("75")),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const paid = (await getOperations(admin)).obligations.find(
      (o) => o.id === obligationId,
    )!;
    expect(paid.paid).toBe("75.00");
    const success = results.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<{ id: string }>;
    const reversal = {
      requestId: randomUUID(),
      entryId: success.value.id,
      reason: "Reverse integration payment",
      occurredOn: "2026-09-09",
    };
    expect(await reverseCash(admin, reversal)).toEqual(
      await reverseCash(admin, reversal),
    );
    expect(
      (await getOperations(admin)).obligations.find(
        (o) => o.id === obligationId,
      )!.paid,
    ).toBe("0.00");
    expect(
      (
        await db().moneyAccount.findUniqueOrThrow({ where: { id: accountId } })
      ).balance.toString(),
    ).toBe("1000");
  });
  it("rejects an overdraft and replays the same receipt without duplicating cash", async () => {
    await expect(
      recordCash(office, { ...payment("1001"), obligationId: undefined }),
    ).rejects.toThrow("saldo suficiente");
    const input = {
      ...payment("25"),
      obligationId: undefined,
      kind: "CUSTOMER_PAYMENT",
    };
    const [a, b] = await Promise.all([
      recordCash(office, input),
      recordCash(office, input),
    ]);
    expect(a).toEqual(b);
    expect(
      (
        await db().moneyAccount.findUniqueOrThrow({ where: { id: accountId } })
      ).balance.toString(),
    ).toBe("1025");
  });
  it("allows office payroll expense payments and protects owner financing", async () => {
    await recordCash(admin, { ...payment("50"), obligationId: payrollId });
    const view = await getOperations(office);
    expect(view.obligations.some((o) => o.id === payrollId)).toBe(true);
    expect(view.cashEntries.some((e) => e.obligationId === payrollId)).toBe(
      true,
    );
    await expect(
      recordCash(office, { ...payment("50"), obligationId: payrollId }),
    ).resolves.toHaveProperty("id");
    await expect(
      recordCash(office, {
        ...payment("50"),
        obligationId: undefined,
        kind: "LOAN_RECEIVED",
      }),
    ).rejects.toThrow("administración");
  });
  it("does not grant runtime mutation of cash history", async () => {
    const result = await db().$queryRaw<
      { allowed: boolean }[]
    >`SELECT has_table_privilege('workshop_runtime','workshop."CashEntry"','UPDATE') AS allowed`;
    expect(result[0].allowed).toBe(false);
  });
});
