"use client";
import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ReferenceLine,
  Cell,
} from "recharts";
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
import { Badge } from "@/components/ui/badge";
import { cop } from "@/features/cash/summary";
import type { ProductResults } from "@/domain/product-results";
export function CategoryProfitability({
  rows,
  orderBy,
  direction,
  update,
}: {
  rows: ProductResults["businessCategories"];
  orderBy: string;
  direction: string;
  update: (v: Record<string, string>) => void;
}) {
  const [page, setPage] = useState(1),
    pages = Math.max(1, Math.ceil(rows.length / 10)),
    current = Math.min(page, pages);
  const complete = rows.filter((r) => r.margin !== null),
    pending = rows.filter((r) => r.missing > 0);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-semibold">Margen por categoría</h3>
        <p className="text-sm text-muted-foreground">
          Ventas netas menos materiales y mano de obra. Las reparaciones se
          agrupan por la categoría del trabajo; el mostrador, por la del
          repuesto.
        </p>
      </div>
      {complete.length > 0 && (
        <ChartContainer
          className="h-72 w-full"
          config={{
            margin: {
              label: "Margen de contribución",
              color: "var(--chart-2)",
            },
          }}
        >
          <BarChart
            accessibilityLayer
            layout="vertical"
            data={complete
              .slice(0, 10)
              .map((r) => ({ ...r, margin: Number(r.margin) }))}
            margin={{ left: 5, right: 30 }}
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
              dataKey="name"
              width={155}
              tickLine={false}
              axisLine={false}
              fontSize={12}
            />
            <ReferenceLine x={0} stroke="var(--border)" />
            <ChartTooltip
              content={
                <ChartTooltipContent formatter={(v) => cop(Number(v))} />
              }
            />
            <Bar dataKey="margin" radius={3} maxBarSize={36}>
              {complete.slice(0, 10).map((r) => (
                <Cell
                  key={r.id ?? "NONE"}
                  fill={
                    Number(r.margin) < 0
                      ? "var(--destructive)"
                      : "var(--chart-2)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
      {pending.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {pending.length}{" "}
          {pending.length === 1 ? "categoría tiene" : "categorías tienen"}{" "}
          costos pendientes y aún no aparecen en el gráfico.
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {[
              ["name", "Categoría"],
              ["revenue", "Ventas netas"],
              ["cost", "Costo atribuido"],
              ["margin", "Margen"],
              ["", "% de margen"],
            ].map(([key, label]) => (
              <TableHead
                key={label}
                aria-sort={
                  orderBy === key
                    ? direction === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                {key ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPage(1);
                      update({
                        businessOrderBy: key,
                        businessDirection:
                          orderBy === key && direction === "desc"
                            ? "asc"
                            : "desc",
                      });
                    }}
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
          {rows.slice((current - 1) * 10, current * 10).map((r) => (
            <TableRow key={r.id ?? "NONE"}>
              <TableCell>
                <Button
                  variant="link"
                  onClick={() =>
                    update({
                      businessCategoryId: r.id ?? "NONE",
                      display: "products",
                    })
                  }
                >
                  {r.name}
                </Button>
                {r.missing > 0 && (
                  <small className="cell-detail">
                    {r.missing}{" "}
                    {r.missing === 1
                      ? "línea con costo pendiente"
                      : "líneas con costo pendiente"}
                  </small>
                )}
              </TableCell>
              <TableCell className="tabular-nums">{cop(r.revenue)}</TableCell>
              <TableCell className="tabular-nums">
                {r.cost === null ? "Costo pendiente" : cop(r.cost)}
              </TableCell>
              <TableCell className="tabular-nums">
                {r.margin === null ? (
                  "Sin costo completo"
                ) : (
                  <span
                    className={
                      Number(r.margin) < 0
                        ? "font-semibold text-destructive"
                        : "font-semibold"
                    }
                  >
                    {cop(r.margin)}
                    {Number(r.margin) < 0 && (
                      <Badge variant="destructive" className="ml-2">
                        Pérdida
                      </Badge>
                    )}
                  </span>
                )}
              </TableCell>
              <TableCell>
                {r.marginPercent === null
                  ? "—"
                  : `${Number(r.marginPercent).toLocaleString("es-CO")}%`}
              </TableCell>
            </TableRow>
          ))}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center">
                No hay ventas con estos filtros.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {rows.length > 10 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">
            Página {current} de {pages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              disabled={current === pages}
              onClick={() => setPage(current + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
