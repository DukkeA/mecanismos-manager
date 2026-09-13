import { DomainError } from "@/domain/errors";
import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";
import { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/domain/permissions";

export type Actor = { id: string; role: Role };
export type Tx = Prisma.TransactionClient;

export async function serializable<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db().$transaction(run, {
        isolationLevel: "Serializable",
        maxWait: 10000,
        timeout: 60000,
      });
    } catch (error) {
      const prismaConflict =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (["P2034", "P2002"].includes(error.code) ||
          // Raw SQL wraps PostgreSQL serialization/deadlock errors in P2010.
          (error.code === "P2010" &&
            ["40001", "40P01"].includes(String(error.meta?.code))));
      // Adapter conflicts appear at COMMIT or nested inside raw SQL metadata.
      const adapterError =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? (error.meta?.driverAdapterError ?? error)
          : error;
      const adapterConflict =
        adapterError instanceof Error &&
        adapterError.name === "DriverAdapterError" &&
        adapterError.message === "TransactionWriteConflict";
      if ((!prismaConflict && !adapterConflict) || attempt >= 7) throw error;
      // Jitter prevents simultaneous writers from colliding on every retry.
      const delay =
        Math.min(400, 25 * 2 ** attempt) + Math.floor(Math.random() * 40);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function once<T extends Prisma.InputJsonObject>(
  actor: Actor,
  id: string,
  kind: string,
  payload: unknown,
  run: (tx: Tx) => Promise<T>,
): Promise<T> {
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  return serializable(async (tx) => {
    await setActor(tx, actor);
    const previous = await tx.commandReceipt.findUnique({ where: { id } });
    if (previous) {
      if (
        previous.actorId !== actor.id ||
        previous.kind !== kind ||
        previous.payloadHash !== payloadHash
      )
        throw new DomainError("La solicitud ya existe con datos diferentes.");
      return previous.result as T;
    }
    const result = await run(tx);
    if (
      /^(COMPENSATION_|OVERTIME_|EMPLOYEE_LEAVE|SALARY_ADVANCE|PAYROLL_)/.test(
        kind,
      )
    ) {
      const { syncSalaryObligations } = await import("./payroll-service");
      await syncSalaryObligations(tx);
    }
    await tx.commandReceipt.create({
      data: { id, actorId: actor.id, kind, payloadHash, result },
    });
    return result;
  });
}

export async function setActor(tx: Tx, actor: Actor) {
  await tx.$queryRaw`SELECT set_config('workshop.actor_id', ${actor.id}, true)`;
}
