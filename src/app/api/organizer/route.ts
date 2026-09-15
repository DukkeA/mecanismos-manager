import { requireMember } from "@/server/auth";
import {
  listOrganizer,
  saveOrganizer,
  deleteOrganizer,
} from "@/server/organizer-service";
import { AccessDenied } from "@/domain/permissions";
import { DomainError } from "@/domain/errors";
import { z } from "zod";
function errorResponse(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof AccessDenied || error instanceof DomainError
          ? error.message
          : error instanceof z.ZodError
            ? error.issues[0].message
            : "No se pudo completar la solicitud.",
    },
    { status: error instanceof AccessDenied ? 403 : 400 },
  );
}
export async function GET() {
  const actor = await requireMember().catch(() => null);
  if (!actor)
    return Response.json({ error: "Inicia sesión." }, { status: 401 });
  try {
    return Response.json(await listOrganizer(actor), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  const allowed = process.env.NEXT_PUBLIC_APP_URL;
  if (!allowed || request.headers.get("origin") !== new URL(allowed).origin)
    return Response.json({ error: "Origen no autorizado." }, { status: 403 });
  const actor = await requireMember().catch(() => null);
  if (!actor)
    return Response.json({ error: "Inicia sesión." }, { status: 401 });
  try {
    const { kind, input } = await request.json();
    if (kind !== "save" && kind !== "delete")
      throw new DomainError("Acción no válida.");
    return Response.json(
      await (kind === "delete"
        ? deleteOrganizer(actor, input)
        : saveOrganizer(actor, input)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
