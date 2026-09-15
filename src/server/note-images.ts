import "server-only";
import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import { noteImageUrl, type NoteNode } from "@/domain/note-content";
import { assertOrganizerAccess } from "@/domain/organizer";
import { AccessDenied } from "@/domain/permissions";
import { DomainError } from "@/domain/errors";
import { serializable, setActor, type Actor, type Tx } from "./commands";
import { storePrivate, readPrivate } from "./private-storage";

export async function persistNoteImages(
  tx: Tx,
  actor: Actor,
  noteId: string,
  document: NoteNode,
): Promise<NoteNode> {
  const result = structuredClone(document);
  async function visit(node: NoteNode) {
    if (node.type === "image") {
      const src = String(node.attrs?.src ?? "");
      const existingId = src.match(noteImageUrl)?.[1];
      if (existingId) {
        const image = await tx.attachment.findFirst({
          where: { id: existingId, entityType: "NOTE", entityId: noteId },
        });
        if (!image) throw new AccessDenied();
      } else {
        let bytes: Buffer;
        try {
          bytes = await sharp(Buffer.from(src.split(",")[1], "base64"), {
            limitInputPixels: 24_000_000,
          })
            .rotate()
            .resize({
              width: 1600,
              height: 1600,
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({ quality: 82 })
            .toBuffer();
        } catch {
          throw new DomainError(
            "No se pudo leer la imagen. Usa PNG, JPEG o WebP.",
          );
        }
        const hash = createHash("sha256").update(bytes).digest("hex");
        const path = `notes/${noteId}/${hash}.webp`;
        await storePrivate(path, bytes, "image/webp");
        const image =
          (await tx.attachment.findUnique({ where: { path } })) ??
          (await tx.attachment.create({
            data: {
              id: randomUUID(),
              entityType: "NOTE",
              entityId: noteId,
              actorId: actor.id,
              name: String(node.attrs?.alt ?? "Imagen de nota"),
              path,
              mime: "image/webp",
              bytes: bytes.length,
            },
          }));
        node.attrs = {
          ...node.attrs,
          src: `/api/organizer/images?id=${image.id}`,
        };
      }
    }
    for (const child of node.content ?? []) await visit(child);
  }
  await visit(result);
  return result;
}

export async function readNoteImage(actor: Actor, id: string) {
  assertOrganizerAccess(actor);
  const image = await serializable(async (tx) => {
    await setActor(tx, actor);
    const record = await tx.attachment.findFirst({
      where: { id, entityType: "NOTE" },
    });
    if (!record) throw new AccessDenied();
    const note = await tx.organizerEntry.findFirst({
      where: { id: record.entityId, kind: "NOTE", deletedAt: null },
    });
    if (!note) throw new AccessDenied();
    assertOrganizerAccess(actor, note);
    return record;
  });
  return { bytes: await readPrivate(image.path), mime: image.mime };
}
