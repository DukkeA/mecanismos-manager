import { requireMember } from "@/server/auth";
import {
  teamOverview,
  compensationHistory,
  overtimePage,
} from "@/server/team-query";
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
  const params = new URL(request.url).searchParams;
  try {
    const result =
      params.get("resource") === "overtime"
        ? await overtimePage(actor, params)
        : params.get("resource") === "history"
          ? await compensationHistory(actor, Object.fromEntries(params))
          : await teamOverview(actor, Object.fromEntries(params));
    return Response.json(result, { headers });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AccessDenied
            ? e.message
            : e instanceof ZodError
              ? "Revisa los filtros."
              : "No se pudo consultar el equipo.",
      },
      {
        status:
          e instanceof AccessDenied ? 403 : e instanceof ZodError ? 400 : 500,
        headers,
      },
    );
  }
}
