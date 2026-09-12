import {
  benefitsPage,
  vacationAccounts,
  payrollPreview,
  advanceHistory,
} from "@/server/employee-benefits-query";
import { DomainError } from "@/domain/errors";
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
    const resource = params.get("resource");
    const result =
      resource === "leaves" || resource === "advances"
        ? await benefitsPage(actor, params, resource)
        : resource === "vacations"
          ? await vacationAccounts(actor)
          : resource === "payroll"
            ? await payrollPreview(
                actor,
                params.get("period") ?? "",
                Object.fromEntries(params),
              )
            : resource === "advance-history"
              ? await advanceHistory(actor, params.get("id") ?? "")
              : params.get("resource") === "overtime"
                ? await overtimePage(actor, params)
                : params.get("resource") === "history"
                  ? await compensationHistory(actor, Object.fromEntries(params))
                  : await teamOverview(actor, Object.fromEntries(params));
    return Response.json(result, { headers });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AccessDenied || e instanceof DomainError
            ? e.message
            : e instanceof ZodError
              ? "Revisa los filtros."
              : "No se pudo consultar el equipo.",
      },
      {
        status:
          e instanceof AccessDenied
            ? 403
            : e instanceof ZodError || e instanceof DomainError
              ? 400
              : 500,
        headers,
      },
    );
  }
}
