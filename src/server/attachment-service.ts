import "server-only";
import { z } from "zod";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { db } from "./db";
import { once, type Actor, type Tx } from "./commands";
import { AccessDenied } from "@/domain/permissions";
import { DomainError } from "@/domain/errors";
import { storePrivate } from "./private-storage";
export const entityType = z.enum(["ORDER", "SALE", "PURCHASE", "WARRANTY"]);
export async function authorizeAttachment(
  actor: Actor,
  type: string,
  id: string,
  tx: Tx = db(),
) {
  if (type === "ORDER") {
    const order = await tx.workOrder.findUnique({ where: { id } });
    if (!order) throw new AccessDenied();
    if (
      actor.role === "MECHANIC" &&
      !(await tx.taskAssignment.findFirst({
        where: { memberId: actor.id, task: { orderId: id, deletedAt: null } },
      }))
    )
      throw new AccessDenied();
    return;
  }
  if (actor.role === "MECHANIC") throw new AccessDenied();
  const exists =
    type === "SALE"
      ? await tx.sale.findUnique({ where: { id } })
      : type === "PURCHASE"
        ? await tx.purchase.findUnique({ where: { id } })
        : type === "WARRANTY"
          ? await tx.warrantyCase.findUnique({ where: { id } })
          : null;
  if (!exists) throw new AccessDenied();
}
export async function saveAttachment(actor: Actor, raw: unknown, file: File) {
  const input = z
    .object({
      requestId: z.uuid(),
      entityType,
      entityId: z.uuid(),
      name: z.string().trim().min(1).max(250),
    })
    .parse(raw);
  await authorizeAttachment(actor, input.entityType, input.entityId);
  if (file.size > 3 * 1024 * 1024)
    throw new DomainError("El archivo supera 3 MB.");
  let content = Buffer.from(await file.arrayBuffer()),
    mime = "application/pdf",
    extension = "pdf";
  if (content.subarray(0, 5).toString() !== "%PDF-") {
    try {
      content = await sharp(content, { limitInputPixels: 24_000_000 })
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();
      mime = "image/jpeg";
      extension = "jpg";
    } catch {
      throw new DomainError("Selecciona un PDF o una imagen válida.");
    }
  }
  if (content.length > 3 * 1024 * 1024)
    throw new DomainError("El archivo supera 3 MB.");
  const hash = createHash("sha256").update(content).digest("hex"),
    path = `documents/${input.entityType}/${input.entityId}/${actor.id}-${input.requestId}-${hash}.${extension}`;
  await storePrivate(path, content, mime);
  return once(
    actor,
    input.requestId,
    "ATTACHMENT_ADDED",
    { ...input, hash },
    async (tx) => {
      await authorizeAttachment(actor, input.entityType, input.entityId, tx);
      if (
        (await tx.attachment.count({
          where: { entityType: input.entityType, entityId: input.entityId },
        })) >= 20
      )
        throw new DomainError("Este expediente ya tiene 20 adjuntos.");
      const result = await tx.attachment.create({
        data: {
          entityType: input.entityType,
          entityId: input.entityId,
          name: input.name,
          path,
          mime,
          bytes: content.length,
          actorId: actor.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: input.entityId,
          action: "ATTACHMENT_ADDED",
          details: { attachmentId: result.id, name: input.name },
        },
      });
      return { id: result.id };
    },
  );
}
