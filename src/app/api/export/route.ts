import { recordsPage } from "@/server/records-query";
import { requireMember } from "@/server/auth";
import { hubPage } from "@/server/hub-query";
import { commercialPage } from "@/server/commercial-query";
const labels: Record<string, string> = {
  id: "Identificador",
  number: "Número",
  title: "Concepto",
  customer: "Cliente",
  status: "Estado",
  total: "Total COP",
  paid: "Pagado COP",
  balance: "Saldo COP",
  date: "Fecha",
  createdAt: "Registro",
  dueOn: "Vencimiento",
  orderNumber: "Orden",
  terms: "Condiciones",
  revision: "Versión",
  amount: "Importe COP",
  subtitle: "Referencia",
  available: "Disponible",
  code: "Código interno",
  name: "Nombre",
  brand: "Marca",
  unit: "Unidad",
  quantity: "Cantidad",
  materialCost: "Costo de materiales COP",
  purchasePrice: "Precio de compra COP",
  salePrice: "Precio de venta COP",
  reserved: "Reservado",
  reference: "Referencia",
  note: "Observaciones",
  occurredOn: "Fecha",
  counterparty: "Tercero",
  direction: "Entrada o salida",
  kind: "Tipo",
  condition: "Condición",
  reason: "Motivo",
  reversed: "Revertido",
};
const escape = (v: unknown) =>
  '"' +
  String(v ?? "")
    .replace(/^[=+\-@\t\r]/, "'$&")
    .replaceAll('"', '""') +
  '"';
export async function GET(request: Request) {
  const actor = await requireMember().catch(() => null);
  if (actor?.role !== "ADMIN")
    return new Response("Sin permiso", { status: 403 });
  const params = new URL(request.url).searchParams;
  params.set("pageSize", "50");
  params.set("size", "50");
  const commercial = ["quotes", "sales", "payments"].includes(
    params.get("resource") ?? "",
  );
  const rows: Record<string, unknown>[] = [];
  try {
    for (let page = 1; page <= 200; page++) {
      params.set("page", String(page));
      const result = params.has("table")
        ? await recordsPage(actor, params)
        : commercial
          ? await commercialPage(actor, params)
          : await hubPage(actor, params);
      rows.push(...result.rows.map((r) => JSON.parse(JSON.stringify(r))));
      if (rows.length >= result.total) break;
      if (page === 200)
        return Response.json(
          {
            error:
              "Limita la exportación con fechas o filtros: máximo 10.000 registros.",
          },
          { status: 400 },
        );
    }
    const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const csv =
      "\ufeff" +
      [
        headers.map((h) => escape(labels[h] ?? h)).join(";"),
        ...rows.map((r) =>
          headers
            .map((h) =>
              escape(typeof r[h] === "object" ? JSON.stringify(r[h]) : r[h]),
            )
            .join(";"),
        ),
      ].join("\r\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="registros.csv"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json(
      { error: "No se pudo exportar. Revisa los filtros." },
      { status: 400 },
    );
  }
}
