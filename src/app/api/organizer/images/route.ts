import { z } from "zod";
import { requireMember } from "@/server/auth";
import { readNoteImage } from "@/server/note-images";
export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    const actor = await requireMember();
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    const image = await readNoteImage(actor, id);
    return new Response(image.bytes, {
      headers: { ...headers, "Content-Type": image.mime },
    });
  } catch {
    return Response.json(
      { error: "Imagen no disponible." },
      { status: 404, headers },
    );
  }
}
