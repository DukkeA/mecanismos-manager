import { requireMember } from "@/server/auth";
import { activityQuery } from "@/server/activity-query";
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
      await activityQuery(actor, new URL(request.url).searchParams),
      { headers },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AccessDenied
            ? e.message
            : "No se pudo consultar el historial.",
      },
      {
        status:
          e instanceof AccessDenied ? 403 : e instanceof ZodError ? 400 : 500,
        headers,
      },
    );
  }
}
