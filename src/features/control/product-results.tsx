"use client";
import { useSearchParams } from "next/navigation";
import { ArrowUpDown } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
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
  for (const key of ["q", "category", "page", "orderBy", "direction"])
    if (params.get(`product_${key}`)) q.set(key, params.get(`product_${key}`)!);
  const query = useProductResults(q);
  function update(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    next.delete("product_page");
    for (const [key, value] of Object.entries(values))
      value ? next.set(`product_${key}`, value) : next.delete(`product_${key}`);
    window.history.pushState(null, "", `?${next}`);
  }
  return (
    <section
      className="space-y-4 border-b pb-6"
      aria-label="Resultados por producto y servicio"
    >
      <div>
        <h3 className="font-semibold">Qué genera ingresos</h3>
        <p className="text-sm text-muted-foreground">
          Ventas del período, descontando sus devoluciones registradas hasta
          hoy. Los abonos se consultan en Dinero.
        </p>
      </div>
      {query.isError && <p role="alert">{query.error.message}</p>}
      {query.data && (
        <ChartContainer
          className="h-64 w-full"
          config={{
            revenue: { label: "Ventas netas", color: "var(--chart-2)" },
          }}
        >
          <BarChart
            layout="vertical"
            data={query.data.categories.map((c) => ({
              ...c,
              label: productCategories[c.category] ?? c.category,
              revenue: Number(c.revenue),
            }))}
          >
            <CartesianGrid horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v) =>
                `${(v / 1000000).toLocaleString("es-CO")} M`
              }
            />
            <YAxis
              type="category"
              dataKey="label"
              width={135}
              tickLine={false}
              axisLine={false}
              fontSize={12}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent formatter={(v) => cop(Number(v))} />
              }
            />
            <Bar
              dataKey="revenue"
              fill="var(--color-revenue)"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ChartContainer>
      )}
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
      <Table>
        <TableHeader>
          <TableRow>
            {[
              ["name", "Servicio / repuesto"],
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
            <TableRow key={`${row.id}-${row.category}`}>
              <TableCell>
                <strong>{row.name}</strong>
                <small className="cell-detail">{row.reference}</small>
              </TableCell>
              <TableCell>{productCategories[row.category]}</TableCell>
              <TableCell>
                {Number(row.quantity).toLocaleString("es-CO")}
              </TableCell>
              <TableCell className="tabular-nums">{cop(row.revenue)}</TableCell>
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
          {!query.data?.rows.length && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center">
                {query.isPending
                  ? "Consultando ventas…"
                  : "No hay ventas para esta consulta."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          {query.data?.total ?? 0} resultados · Página {query.data?.page ?? 1}
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
            disabled={!query.data || query.data.page * 10 >= query.data.total}
            onClick={() => update({ page: String(query.data!.page + 1) })}
          >
            Siguiente
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        En mostrador se descuenta el costo del repuesto. En órdenes cerradas, el
        costo total de materiales y mano de obra se reparte según el valor
        original de cada línea: es una atribución estimada. El margen no
        descuenta gastos generales ni garantías posteriores.
      </p>
    </section>
  );
}
