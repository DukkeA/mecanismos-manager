import { requireMember } from "@/server/auth";
import { productResults } from "@/server/product-results";
import { managementReport } from "@/server/management-report";
import {
  profitabilityDetail,
  profitabilityOverview,
} from "@/server/profitability-query";
export async function GET(request: Request) {
  const actor = await requireMember().catch(() => null);
  if (actor?.role !== "ADMIN")
    return Response.json({ error: "Sin permiso." }, { status: 403 });
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(
      await (params.get("resource") === "profitability"
        ? profitabilityOverview(actor, params)
        : params.get("resource") === "profitability-detail"
          ? profitabilityDetail(actor, params)
          : params.get("resource") === "products"
            ? productResults(actor, params)
            : managementReport(actor, params)),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { error: "No se pudo consultar el informe." },
      { status: 400 },
    );
  }
}
