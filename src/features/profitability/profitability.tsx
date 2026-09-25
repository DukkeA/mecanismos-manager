"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleAlert } from "lucide-react";
import { useProfitability, useProfitabilityDetail } from "./hooks";
import { useWorkshopScope } from "@/features/workshop/query";
import { cop, todayInBogota } from "@/features/cash/summary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryState } from "@/components/workshop-controls";
import { TablePagination } from "@/components/workshop-controls";
import { ProductResults } from "@/features/control/product-results";
import { ManagementReport } from "@/features/control/management-report";
import { ControlPanel } from "@/features/control/control-panel";
import type {
  ProfitabilityJob,
  ProfitabilityOverview,
} from "@/domain/profitability";
import type { ComponentProps } from "react";

function QueryError({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{message}</AlertTitle>
      <Button variant="outline" onClick={retry}>
        Reintentar
      </Button>
    </Alert>
  );
}

function Breakdown({ values }: { values: [string, string][] }) {
  return (
    <dl className="grid gap-2 text-sm">
      {values.map(([label, value]) => (
        <div
          key={label}
          className="flex flex-wrap justify-between gap-x-5 gap-y-1"
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium tabular-nums">{cop(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MonthlyProfitability({
  period,
  compact = false,
}: {
  period: string;
  compact?: boolean;
}) {
  const { demo } = useWorkshopScope();
  const query = useProfitability(period);
  if (demo) return null;
  if (query.isError)
    return (
      <QueryError message={query.error.message} retry={() => query.refetch()} />
    );
  if (!query.data)
    return <p role="status">Calculando el resultado del taller…</p>;
  return <MonthlyResult data={query.data} compact={compact} />;
}
function MonthlyResult({
  data,
  compact = false,
}: {
  data: ProfitabilityOverview;
  compact?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>¿Cuánto dejó el taller?</CardTitle>
          <Badge variant="secondary">
            {data.result === null ? "Provisional" : "Mes revisado"}
          </Badge>
        </div>
        <CardDescription>
          Resultado de gestión · {data.period}. Las ventas y los gastos cuentan
          aunque todavía no se hayan pagado.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2">
        <div>
          <p
            className={`text-3xl font-semibold tabular-nums ${Number(data.knownResult) < 0 ? "text-destructive" : ""}`}
          >
            {cop(data.knownResult)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {data.result === null
              ? "Con los datos registrados. Faltan revisiones antes de tomarlo como ganancia definitiva."
              : "Ventas menos repuestos, salarios y gastos registrados."}
          </p>
          {compact ? (
            <Button asChild variant="outline" className="mt-4">
              <Link href={`?view=Rentabilidad&period=${data.period}`}>
                Ver resultado y pendientes <ArrowUpRight />
              </Link>
            </Button>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              La mano de obra de cada trabajo sirve para comparar trabajos; aquí
              los salarios se descuentan una sola vez. Aportes y prestaciones
              están en otros gastos.
            </p>
          )}
        </div>
        <Breakdown
          values={[
            ["Ventas menos devoluciones", data.revenue],
            ["Repuestos y ajustes de inventario", data.materials],
            ["Salarios y extras del mes", data.payroll],
            ["Otros gastos y prestaciones", data.expenses],
          ]}
        />
        {!compact && data.pending.length > 0 && (
          <div className="md:col-span-2 border-t pt-4">
            <h3 className="mb-2 flex items-center gap-2 font-medium">
              <CircleAlert className="size-4" />
              Para confiar en este resultado
            </h3>
            <ul className="grid gap-2 text-sm">
              {data.pending.map((item) => (
                <li key={item.label}>
                  <Link
                    className="text-primary underline underline-offset-4"
                    href={item.href}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function JobResult({ job }: { job: ProfitabilityJob }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          Resultado de este {job.saleId ? "negocio" : "trabajo"}
        </h3>
        <Badge variant="secondary">
          {job.revenue === null
            ? "Sin venta"
            : job.pending.length
              ? "Provisional"
              : "Completo"}
        </Badge>
      </div>
      <Breakdown
        values={[
          ...(job.revenue === null
            ? []
            : [["Venta neta", job.revenue] as [string, string]]),
          [
            job.purpose === "UNIT" || job.purpose === "OWN_REBUILD"
              ? "Núcleo y repuestos"
              : "Repuestos",
            job.material,
          ],
          ["Trabajo registrado", job.labor],
          ["Gastos directos", job.expenses],
          ["Garantías asumidas", job.warrantyCost],
        ]}
      />
      <div className="flex justify-between gap-4 border-t pt-3 font-semibold">
        <span>
          {job.revenue === null
            ? "Costo acumulado"
            : "Resultado antes de gastos generales"}
        </span>
        <span
          className={
            job.margin !== null && Number(job.margin) < 0
              ? "text-destructive"
              : ""
          }
        >
          {job.revenue === null
            ? cop(job.cost)
            : job.margin === null
              ? "Faltan datos"
              : cop(job.margin)}
        </span>
      </div>
      {job.pending.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {job.pending.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {job.balance !== null && (
        <p className="text-sm">
          Pendiente de cobro: <strong>{cop(job.balance)}</strong>. Cobrarlo
          cambia la caja, no la ganancia.
        </p>
      )}
      {job.originalSaleId && (
        <p className="text-sm">
          Este costo se atribuye a la venta original mientras la garantía sea
          asumida por el taller.{" "}
          <Link
            className="underline"
            href={`?view=Ventas&recordId=${job.originalSaleId}`}
          >
            Abrir venta original
          </Link>
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Incluye los costos registrados hasta hoy. Los gastos generales del
        taller se consultan en el resultado mensual.
      </p>
    </div>
  );
}
export function ProfitabilityDetail(props: {
  orderId?: string;
  saleId?: string;
}) {
  const query = useProfitabilityDetail(props);
  if (query.isError)
    return (
      <QueryError message={query.error.message} retry={() => query.refetch()} />
    );
  if (query.isPending)
    return <p role="status">Calculando costos del trabajo…</p>;
  if (!query.data) return null;
  return (
    <section className="border-t pt-4">
      <JobResult job={query.data} />
    </section>
  );
}

function Jobs({
  data,
  openOrder,
}: {
  data: ProfitabilityOverview;
  openOrder: (id: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [onlyPending, setOnlyPending] = useState(false),
    [page, setPage] = useState(1);
  const filtered = data.jobs.filter(
    (j) =>
      (!onlyPending || j.pending.length) &&
      `${j.label} ${j.title} ${j.customer}`
        .toLocaleLowerCase("es")
        .includes(search.toLocaleLowerCase("es")),
  );
  const current = Math.min(page, Math.max(1, Math.ceil(filtered.length / 10)));
  return (
    <section className="space-y-4" aria-label="Resultado por trabajo y venta">
      <div>
        <h2 className="text-xl font-semibold">
          Qué trabajos están dejando dinero
        </h2>
        <p className="text-sm text-muted-foreground">
          Ventas del mes y trabajos sin venta. Incluye sus garantías y costos
          registrados hasta hoy.
        </p>
        <p className="mt-1 text-sm">
          Costo acumulado en trabajos sin vender:{" "}
          <strong>{cop(data.workInProgress)}</strong>. Incluye materiales,
          trabajo y gastos conocidos.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Input
          aria-label="Buscar trabajo o venta"
          placeholder="Cliente, trabajo o número de venta"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="min-w-0 flex-1"
        />
        <Button
          variant={onlyPending ? "default" : "outline"}
          aria-pressed={onlyPending}
          onClick={() => {
            setOnlyPending(!onlyPending);
            setPage(1);
          }}
        >
          Pendientes ({data.incompleteJobs})
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.slice((current - 1) * 10, current * 10).map((j) => (
          <Card key={`${j.saleId ? "sale" : "order"}-${j.id}`}>
            <CardHeader>
              <CardTitle className="text-base">
                {j.label} · {j.title}
              </CardTitle>
              <CardDescription>{j.customer}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <JobResult job={j} />
              <div className="flex flex-wrap gap-2">
                {j.orderId && (
                  <Button
                    variant="outline"
                    onClick={() => openOrder(j.orderId!)}
                  >
                    Abrir trabajo
                  </Button>
                )}
                {j.saleId && (
                  <Button asChild variant="outline">
                    <Link href={`?view=Ventas&recordId=${j.saleId}`}>
                      Ver venta y cobro
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!filtered.length && (
        <p className="py-6 text-muted-foreground">
          No hay trabajos o ventas con estos filtros.
        </p>
      )}
      <TablePagination
        page={current}
        pageSize={10}
        total={filtered.length}
        onPageChange={setPage}
      />
    </section>
  );
}

export function ProfitabilityWorkspace({
  openOrder,
  ...props
}: Omit<ComponentProps<typeof ControlPanel>, "resources"> & {
  openOrder: (id: string) => void;
}) {
  const { demo } = useWorkshopScope();
  const [period, setPeriod] = useQueryState(
    "period",
    todayInBogota().slice(0, 7),
  );
  const [tab, setTab] = useState("summary");
  const query = useProfitability(period);
  const from = `${period}-01`,
    date = new Date(`${from}T00:00:00Z`);
  const to = Number.isNaN(date.getTime())
    ? from
    : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
        .toISOString()
        .slice(0, 10);
  if (demo)
    return (
      <p className="text-muted-foreground">
        La rentabilidad se calcula con los trabajos, ventas y gastos guardados.
        La demostración permite explorar el flujo sin registrar resultados
        financieros.
      </p>
    );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Los repuestos, las tareas, los gastos y las garantías alimentan este
          resultado automáticamente.
        </p>
        <label className="grid gap-1 text-sm">
          Mes del resultado
          <Input
            type="month"
            aria-label="Mes del resultado"
            value={period}
            onChange={(e) => {
              if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))
                setPeriod(e.target.value);
            }}
          />
        </label>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Consultar rentabilidad">
          <TabsTrigger value="summary">Resultado y trabajos</TabsTrigger>
          <TabsTrigger value="products">Productos y categorías</TabsTrigger>
          <TabsTrigger value="warranties">Garantías y equipo</TabsTrigger>
          <TabsTrigger value="orders">Histórico de órdenes</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "summary" &&
        (query.isError ? (
          <QueryError
            message={query.error.message}
            retry={() => query.refetch()}
          />
        ) : !query.data ? (
          <p role="status">Calculando el resultado del taller…</p>
        ) : (
          <>
            <MonthlyResult data={query.data} />
            <Jobs data={query.data} openOrder={openOrder} />
          </>
        ))}
      {tab === "products" && <ProductResults from={from} to={to} />}
      {tab === "warranties" && (
        <ManagementReport from={from} to={to} includeProducts={false} />
      )}
      {tab === "orders" && <ControlPanel {...props} resources={["margins"]} />}
    </div>
  );
}
