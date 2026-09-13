import { requireMember } from "@/server/auth";
import {
  assignOrderCategory,
  listCategories,
  saveCategory,
} from "@/server/category-service";
import { DomainError } from "@/domain/errors";
import { AccessDenied } from "@/domain/permissions";
export async function GET() {
  const actor = await requireMember().catch(() => null);
  if (!actor)
    return Response.json({ error: "Inicia sesión." }, { status: 401 });
  return Response.json(await listCategories(), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function POST(request: Request) {
  const actor = await requireMember().catch(() => null);
  if (!actor)
    return Response.json({ error: "Inicia sesión." }, { status: 401 });
  try {
    const { kind, input } = await request.json();
    if (!["save", "order"].includes(kind))
      throw new DomainError("Acción no válida.");
    return Response.json(
      await (kind === "order"
        ? assignOrderCategory(actor, input)
        : saveCategory(actor, input)),
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof DomainError || e instanceof AccessDenied
            ? e.message
            : "No se pudo guardar la categoría. Revisa los datos.",
      },
      { status: e instanceof AccessDenied ? 403 : 400 },
    );
  }
}
