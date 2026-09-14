"use client";
import { SearchX as EmptySearchX } from "lucide-react";
import { DataEmpty } from "@/components/data-empty";
import { CategoryProfitability } from "@/features/categories/profitability";
import { useCategories } from "@/features/categories/hooks";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParams } from "next/navigation";
import { ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Choice } from "@/components/workshop-controls";
import { cop } from "@/features/cash/summary";
import { productCategories } from "@/domain/product-results";
import { useProductResults } from "./hooks";

export function ProductResults({ from, to }: { from?: string; to?: string }) {
  const params = useSearchParams(),
    q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  for (const key of [
    "q",
    "category",
    "businessCategoryId",
    "businessOrderBy",
    "businessDirection",
    "page",
    "orderBy",
    "direction",
  ])
    if (params.get(`product_${key}`)) q.set(key, params.get(`product_${key}`)!);
  const query = useProductResults(q),
    categories = useCategories();
  const display = params.get("product_display") ?? "categories";
  function update(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    next.delete("product_page");
    for (const [key, value] of Object.entries(values))
      value ? next.set(`product_${key}`, value) : next.delete(`product_${key}`);
    window.history.pushState(null, "", `?${next}`);
  }
  return (
    <section
      className="flex flex-col gap-4 border-b pb-6"
      aria-label="Resultados por producto y servicio"
    >
      <div>
        <h3 className="font-semibold">Qué deja cada venta y reparación</h3>
        <p className="text-sm text-muted-foreground">
          Ventas del período, descontando sus devoluciones registradas hasta
          hoy. Los abonos se consultan en Dinero.
        </p>
      </div>
      {query.isError && <p role="alert">{query.error.message}</p>}
      <div
        className="commercial-filters"
        role="search"
        aria-label="Filtros de productos vendidos"
      >
        <label>
          Buscar
          <Input
            value={q.get("q") ?? ""}
            placeholder="Servicio, repuesto o referencia"
            onChange={(e) => update({ q: e.target.value })}
          />
        </label>
        <label>
          Categoría
          <Choice
            value={q.get("businessCategoryId") ?? ""}
            onChange={(businessCategoryId) => update({ businessCategoryId })}
            options={[
              { id: "", label: "Todas las categorías" },
              { id: "NONE", label: "Sin categoría" },
              ...(categories.data ?? []).map((c) => ({
                id: c.id,
                label: c.name,
              })),
            ]}
          />
        </label>
        <label>
          Tipo
          <Choice
            value={q.get("category") ?? ""}
            onChange={(category) => update({ category })}
            options={[
              { id: "", label: "Todos" },
              ...Object.entries(productCategories).map(([id, label]) => ({
                id,
                label,
              })),
            ]}
          />
        </label>
      </div>
      <Tabs value={display} onValueChange={(display) => update({ display })}>
        <TabsList aria-label="Comparar rentabilidad">
          <TabsTrigger value="categories">Por categoría</TabsTrigger>
          <TabsTrigger value="products">Repuestos y servicios</TabsTrigger>
        </TabsList>
      </Tabs>
      {display === "categories" ? (
        query.data ? (
          <CategoryProfitability
            rows={query.data.businessCategories}
            orderBy={q.get("businessOrderBy") ?? "revenue"}
            direction={q.get("businessDirection") ?? "desc"}
            update={update}
          />
        ) : query.isPending ? (
          <p role="status">Consultando categorías…</p>
        ) : null
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  ["name", "Servicio / repuesto"],
                  ["", "Categoría"],
                  ["", "Tipo"],
                  ["quantity", "Cantidad"],
                  ["revenue", "Ventas netas"],
                  ["", "Costo atribuido"],
                  ["margin", "Margen de contribución"],
                ].map(([key, label]) => (
                  <TableHead key={label}>
                    {key ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          update({
                            orderBy: key,
                            direction:
                              q.get("orderBy") === key &&
                              q.get("direction") !== "asc"
                                ? "asc"
                                : "desc",
                          })
                        }
                      >
                        {label}
                        <ArrowUpDown />
                      </Button>
                    ) : (
                      label
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.rows.map((row) => (
                <TableRow
                  key={`${row.id}-${row.category}-${row.businessCategoryId}`}
                >
                  <TableCell>
                    <strong>{row.name}</strong>
                    <small className="cell-detail">{row.reference}</small>
                  </TableCell>
                  <TableCell>{row.businessCategory}</TableCell>
                  <TableCell>{productCategories[row.category]}</TableCell>
                  <TableCell>
                    {Number(row.quantity).toLocaleString("es-CO")}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {cop(row.revenue)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.cost === null ? "Costo pendiente" : cop(row.cost)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.margin === null ? (
                      <span className="text-muted-foreground">
                        Sin costo completo
                      </span>
                    ) : (
                      <span
                        className={
                          Number(row.margin) < 0
                            ? "text-destructive"
                            : "font-semibold"
                        }
                      >
                        {cop(row.margin)}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!query.isError && !query.data?.rows.length && (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    {query.isPending ? (
                      <p role="status">Consultando ventas…</p>
                    ) : (
                      <DataEmpty
                        icon={EmptySearchX}
                        title="Sin ventas para esta consulta"
                        description="Revisa el período y los filtros seleccionados."
                      />
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {query.data?.total ?? 0} resultados · Página{" "}
              {query.data?.page ?? 1}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!query.data || query.data.page <= 1}
                onClick={() => update({ page: String(query.data!.page - 1) })}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                disabled={
                  !query.data || query.data.page * 10 >= query.data.total
                }
                onClick={() => update({ page: String(query.data!.page + 1) })}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </>
      )}
      <p className="text-sm text-muted-foreground">
        En mostrador se descuenta el costo del repuesto. En órdenes cerradas, el
        costo total de materiales y mano de obra se reparte según el valor
        original de cada línea: es una atribución estimada. El margen no
        descuenta gastos generales ni garantías posteriores.
      </p>
    </section>
  );
}
