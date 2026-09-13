import { afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { serializable } from "@/server/commands";

const customerId = randomUUID();
afterAll(async () => {
  await db().customer.deleteMany({ where: { id: customerId } });
});
it("retries a raw PostgreSQL serialization failure and rolls back the first write", async () => {
  let attempts = 0;
  const result = await serializable(async (tx) => {
    attempts++;
    const customer = await tx.customer.create({
      data: { id: customerId, name: "Prueba de reintento de transacción" },
    });
    if (attempts === 1)
      await tx.$executeRaw`DO $$ BEGIN RAISE EXCEPTION 'Concurrent transaction test' USING ERRCODE='40001'; END $$`;
    return customer.id;
  });
  expect(result).toBe(customerId);
  expect(attempts).toBe(2);
  expect(await db().customer.count({ where: { id: customerId } })).toBe(1);
});
