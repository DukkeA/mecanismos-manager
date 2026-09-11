import "server-only";
import { z } from "zod";
import { once, type Actor } from "./commands";
import { AccessDenied } from "@/domain/permissions";

export async function deleteContact(
  actor: Actor,
  kind: "customer" | "supplier",
  raw: unknown,
) {
  if (actor.role !== "ADMIN") throw new AccessDenied();
  const input = z
    .object({
      id: z.uuid(),
      requestId: z.uuid(),
      reason: z.string().trim().min(3).max(1000),
    })
    .parse(raw);
  return once(
    actor,
    input.requestId,
    `${kind.toUpperCase()}_DELETED`,
    input,
    async (tx) => {
      const record =
        kind === "customer"
          ? await tx.customer.findUniqueOrThrow({ where: { id: input.id } })
          : await tx.supplier.findUniqueOrThrow({ where: { id: input.id } });
      if (!record.deletedAt) {
        const data = { deletedAt: new Date() };
        if (kind === "customer")
          await tx.customer.update({ where: { id: input.id }, data });
        else await tx.supplier.update({ where: { id: input.id }, data });
        await tx.auditEvent.create({
          data: {
            actorId: actor.id,
            entityId: input.id,
            action: `${kind.toUpperCase()}_DELETED`,
            details: { name: record.name, reason: input.reason },
          },
        });
      }
      return { id: input.id };
    },
  );
}
