import { requireMember } from "@/server/auth";
import { inventoryPriceHistory } from "@/server/inventory-history";
import { AccessDenied } from "@/domain/permissions";
import { ZodError } from "zod";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const actor = await requireMember().catch(() => null);
  if (!actor)
    return Response.json(
      { error: "Sesión requerida." },
      { status: 401, headers },
    );
  try {
    return Response.json(
      await inventoryPriceHistory(actor, new URL(request.url).searchParams),
      { headers },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof AccessDenied
            ? error.message
            : error instanceof ZodError
              ? "Revisa los filtros."
              : "No se pudo consultar el historial.",
      },
      { status: error instanceof AccessDenied ? 403 : 400, headers },
    );
  }
}
