"use server";

import { AccessDenied } from "@/domain/permissions";
import { requireMember, supabaseServer } from "@/server/auth";
import { db } from "@/server/db";
import { receiveOrder } from "@/server/operations-service";
import { recordTaskTime } from "@/server/task-service";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DomainError } from "@/domain/errors";

export async function addObservation(orderId: string, body: string) {
  const actor = await requireMember();
  const input = z
    .object({ orderId: z.uuid(), body: z.string().trim().min(1).max(5000) })
    .parse({ orderId, body });
  await db().$transaction(
    async (tx) => {
      const order = await tx.workOrder.findFirst({
        where: {
          id: input.orderId,
          ...(actor.role === "MECHANIC"
            ? {
                tasks: {
                  some: { assignments: { some: { memberId: actor.id } } },
                },
              }
            : {}),
        },
        select: { id: true, status: true },
      });
      if (!order) throw new AccessDenied();
      if (["CLOSED", "CANCELLED"].includes(order.status))
        throw new Error("La orden está cerrada.");
      const note = await tx.observation.create({
        data: { ...input, memberId: actor.id },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: order.id,
          action: "OBSERVATION_ADDED",
          details: { observationId: note.id },
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
  revalidatePath("/");
}

export async function addTime(input: unknown) {
  const actor = await requireMember();
  const result = await recordTaskTime(actor, input);
  revalidatePath("/");
  return result;
}

export async function createOrder(raw: unknown) {
  const actor = await requireMember();
  try {
    const result = await receiveOrder(actor, raw);
    revalidatePath("/");
    return { ok: true as const, id: result.id };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof DomainError
          ? error.message
          : error instanceof z.ZodError
            ? "Revisa el cliente, el vehículo o componente y el motivo de ingreso."
            : "No se pudo crear la orden. Revisa los datos y vuelve a intentarlo.",
    };
  }
}

export async function signOut() {
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("No se pudo cerrar la sesión. Reintenta.");
}
