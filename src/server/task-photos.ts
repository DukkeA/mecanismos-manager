import "server-only";
import {db} from "./db";
import {storePrivate} from "./private-storage";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { once, type Actor } from "./commands";
import { canContributeToTask, AccessDenied } from "@/domain/permissions";
import { DomainError } from "@/domain/errors";

export async function saveTaskPhoto(actor: Actor, raw: unknown, bytes: Buffer) {
  const input = z
    .object({
      taskId: z.uuid(),
      requestId: z.uuid(),
      caption: z.string().trim().min(1).max(250),
    })
    .parse(raw);
  if (bytes.length > 3 * 1024 * 1024)
    throw new DomainError("La foto supera 3 MB.");
  let content: Buffer;
  try {
    const picture = sharp(bytes, { limitInputPixels: 24_000_000 });
    const metadata = await picture.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? ""))
      throw new Error();
    content = await picture
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    throw new DomainError("El archivo no es una foto JPG, PNG o WebP válida.");
  }
  if (content.length > 1024 * 1024)
    throw new DomainError(
      "La foto sigue siendo demasiado grande. Usa una imagen más pequeña.",
    );
  const hash = createHash("sha256").update(bytes).digest("hex");
  const before=await db().task.findUniqueOrThrow({where:{id:input.taskId},include:{assignments:true}});
  if(!canContributeToTask(actor.role,actor.id,before.assignments.map(a=>a.memberId)))throw new AccessDenied();
  if(before.deletedAt)throw new DomainError("La tarea ya no admite fotos.");
  const storagePath=`tasks/${input.taskId}/${actor.id}-${input.requestId}-${hash}.jpg`;
  await storePrivate(storagePath,content,"image/jpeg");
  return once(
    actor,
    input.requestId,
    "TASK_PHOTO",
    { ...input, hash },
    async (tx) => {
      const task = await tx.task.findUniqueOrThrow({
        where: { id: input.taskId },
        include: { assignments: true, order: true },
      });
      if (
        !canContributeToTask(
          actor.role,
          actor.id,
          task.assignments.map((a) => a.memberId),
        )
      )
        throw new AccessDenied();
      if (
        task.deletedAt ||
        (task.order && ["CLOSED", "CANCELLED"].includes(task.order.status))
      )
        throw new DomainError("La tarea ya no admite fotos.");
      if ((await tx.taskPhoto.count({ where: { taskId: task.id } })) >= 12)
        throw new DomainError("Esta tarea ya tiene 12 fotos.");
      const photo = await tx.taskPhoto.create({
        data: {
          taskId: task.id,
          actorId: actor.id,
          caption: input.caption,
          storagePath,
          content: null,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          entityId: task.id,
          action: "TASK_PHOTO_ADDED",
          details: { photoId: photo.id, caption: input.caption },
        },
      });
      return { id: photo.id };
    },
  );
}
