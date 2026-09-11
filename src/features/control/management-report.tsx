"use client";
import { useManagementReport } from "./hooks";
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
import { cop } from "@/features/cash/summary";
const names: Record<string, string> = {
  REPAIR: "Reparaciones",
  VEHICLE: "Vehículos",
  COMPONENT: "Componentes",
  COUNTER: "Mostrador",
  UNIT: "Unidades propias",
  PART: "Repuesto",
  WORKMANSHIP: "Ejecución del trabajo",
  EXTERNAL: "Causa externa",
  UNDETERMINED: "Sin determinar",
};
export function ManagementReport({ from, to }: { from?: string; to?: string }) {
  const query = useManagementReport(from, to);
  if (query.isError) return <p role="alert">{query.error.message}</p>;
  if (!query.data)
    return (
      <p className="text-sm text-muted-foreground">Consultando resultados…</p>
    );
  const { groups, causes, team } = query.data;
  return (
    <section
      className="space-y-5 border-b pb-5"
      aria-label="Resultados y garantías"
    >
      <div>
        <h3 className="font-semibold">Ventas que regresan por garantía</h3>
        <p className="text-sm text-muted-foreground">
          Ventas emitidas en las fechas seleccionadas y garantías aceptadas
          hasta hoy. Una venta cuenta una vez aunque tenga varios casos.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo de venta</TableHead>
            <TableHead>Ventas</TableHead>
            <TableHead>Con garantía</TableHead>
            <TableHead>Proporción</TableHead>
            <TableHead>Costo asumido</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((g) => (
            <TableRow key={g.type}>
              <TableCell>{names[g.type] ?? g.type}</TableCell>
              <TableCell>{g.sales}</TableCell>
              <TableCell>
                {g.affected} ventas · {g.cases} casos
              </TableCell>
              <TableCell>
                {((100 * g.affected) / Math.max(1, g.sales)).toLocaleString(
                  "es-CO",
                  { maximumFractionDigits: 1 },
                )}
                %
              </TableCell>
              <TableCell>
                {cop(g.warrantyCost)}
                {g.warrantyUnknown > 0 && (
                  <small className="block text-muted-foreground">
                    {g.warrantyUnknown} casos con costos pendientes
                  </small>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {causes.length > 0 && (
        <p className="text-sm">
          Causas registradas:{" "}
          {causes
            .map((c) => `${names[c.cause] ?? c.cause}: ${c.cases}`)
            .join(" · ")}
          .
        </p>
      )}
      <div>
        <h3 className="font-semibold">Horas registradas por mecánico</h3>
        <p className="text-sm text-muted-foreground">
          Horas informadas en el período. Una asignación compartida no
          identifica al causante de una garantía.
        </p>
      </div>
      <ChartContainer
        className="h-80 w-full"
        config={{
          hours: { label: "Horas registradas", color: "var(--chart-1)" },
        }}
      >
        <BarChart layout="vertical"
          data={team.map((m) => ({
            ...m,
            hours: Number((m.minutes / 60).toFixed(1)),
            label: m.name.split(" ").slice(0, 2).join(" "),
          }))}
        >
          <CartesianGrid vertical={false} />
          <XAxis type="number" tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" width={100} tickLine={false} axisLine={false} fontSize={11} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar
            dataKey="hours"
            fill="var(--color-hours)"
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ChartContainer>
    </section>
  );
}
