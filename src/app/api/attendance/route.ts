import { workshopSettings } from "@/server/workshop-settings";
import { requireMember } from "@/server/auth";
import { attendancePage } from "@/server/attendance-query";
import { stationCode } from "@/server/attendance-service";
import { AccessDenied } from "@/domain/permissions";
import { DomainError } from "@/domain/errors";
import { ZodError } from "zod";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" },
    actor = await requireMember().catch(() => null);
  if (!actor)
    return Response.json(
      { error: "Sesión requerida." },
      { status: 401, headers },
    );
  try {
    const p = new URL(request.url).searchParams;
    if (p.get("resource") === "settings") {
      if (actor.role !== "ADMIN") throw new AccessDenied();
      return Response.json(await workshopSettings(), { headers });
    }
    return Response.json(
      p.get("resource") === "code"
        ? await stationCode(actor, p.get("locationId") ?? "")
        : await attendancePage(actor, p),
      { headers },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AccessDenied || e instanceof DomainError
            ? e.message
            : e instanceof ZodError
              ? "Revisa los filtros."
              : "No se pudo consultar la asistencia.",
      },
      {
        status:
          e instanceof AccessDenied
            ? 403
            : e instanceof DomainError || e instanceof ZodError
              ? 400
              : 500,
        headers,
      },
    );
  }
}
