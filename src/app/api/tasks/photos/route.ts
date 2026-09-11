import {readPrivate} from "@/server/private-storage";
import { requireMember } from "@/server/auth";
import { db } from "@/server/db";
import { saveTaskPhoto } from "@/server/task-photos";
import { AccessDenied, canContributeToTask } from "@/domain/permissions";
import { DomainError } from "@/domain/errors";
import { z } from "zod";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function GET(request: Request) {
  const actor = await requireMember().catch(() => null);
  if (!actor) return new Response(null, { status: 401, headers });
  const id = z.uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return new Response(null, { status: 400, headers });
  const photo = await db().taskPhoto.findUnique({
    where: { id: id.data },
    include: { task: { include: { assignments: true } } },
  });
  if (
    !photo ||
    (photo.task.deletedAt && actor.role !== "ADMIN") ||
    !canContributeToTask(
      actor.role,
      actor.id,
      photo.task.assignments.map((a) => a.memberId),
    )
  )
    return new Response(null, { status: 404, headers });
  return new Response(photo.storagePath ? await readPrivate(photo.storagePath) : new Uint8Array(photo.content!), {
    headers: { ...headers, "Content-Type": "image/jpeg" },
  });
}
export async function POST(request: Request) {
  const actor = await requireMember().catch(() => null);
  if (!actor)
    return Response.json(
      { error: "Sesión requerida." },
      { status: 401, headers },
    );
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json(
      { error: "Origen no permitido." },
      { status: 403, headers },
    );
  try {
    // Bound the body before parsing multipart; client Content-Length is not trusted.
    const reader = request.body?.getReader();
    if (!reader) throw new DomainError("Selecciona una foto.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 3 * 1024 * 1024 + 65536) {
        await reader.cancel();
        throw new DomainError("La foto supera 3 MB.");
      }
      chunks.push(part.value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("photo");
    if (!(file instanceof File)) throw new DomainError("Selecciona una foto.");
    const result = await saveTaskPhoto(
      actor,
      {
        taskId: form.get("taskId"),
        requestId: form.get("requestId"),
        caption: form.get("caption"),
      },
      Buffer.from(await file.arrayBuffer()),
    );
    return Response.json(result, { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof DomainError || error instanceof AccessDenied
            ? error.message
            : "No se pudo guardar la foto. Revisa el archivo y vuelve a intentar.",
      },
      { status: error instanceof AccessDenied ? 403 : 400, headers },
    );
  }
}
