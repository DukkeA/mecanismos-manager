"use client";
import { Wallet as EmptyWallet } from "lucide-react";
import { DataEmpty } from "@/components/data-empty";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { Choice, dateLabel } from "@/components/workshop-controls";
import type { Role } from "@/domain/permissions";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Wallet,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useCash } from "./hooks";
import { MonthlyProfitability } from "@/features/profitability/profitability";
import { cashSummary, cop, todayInBogota } from "./summary";

export function FinancialOverview({
  period,
  setPeriod,
  role,
  onOpenCash,
  compact = false,
}: {
  period: string;
  setPeriod: (value: string) => void;
  role: Role;
  onOpenCash?: () => void;
  compact?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const { data } = useCash();
  if (!data) return null;
  const summary = cashSummary(
    {
      accounts: data.accounts,
      obligations: data.obligations,
      cashEntries: data.entries,
    },
    period,
    todayInBogota(),
  );
  const periods = [
    ...new Set([
      period,
      todayInBogota().slice(0, 7),
      ...data.obligations.map((o) => o.period),
      ...data.entries.map((e) => e.occurredOn.slice(0, 7)),
    ]),
  ]
    .sort()
    .reverse();
  return (
    <section
      className="financial-overview"
      data-compact={compact}
      aria-label="Resumen financiero"
    >
      <div className="financial-heading">
        <h2>Finanzas del taller</h2>
        <Choice
          label="Mes de finanzas"
          value={period}
          onChange={setPeriod}
          options={periods.map((id) => ({
            id,
            label: new Intl.DateTimeFormat("es-CO", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${id}-01T12:00:00Z`)),
          }))}
        />
      </div>
      {data.payrollLoading && (
        <p className="text-sm text-muted-foreground">
          Consultando pagos del personal…
        </p>
      )}
      {role === "ADMIN" && <MonthlyProfitability period={period} compact />}
      {data.payrollError && (
        <Alert variant="destructive">
          <AlertTitle>
            No se pudo incluir el pago del personal: {data.payrollError}
          </AlertTitle>
        </Alert>
      )}
      <div className="finance-primary-grid">
        <Card className="finance-coverage">
          <CardHeader>
            <CardTitle>Gastos del mes</CardTitle>
            <Badge variant="secondary">
              {role !== "ADMIN"
                ? "Vista sin nómina"
                : data.coverage.some((m) => m.period === period && m.confirmed)
                  ? "Gastos completos confirmados"
                  : "Gastos pendientes de revisión"}
            </Badge>
            <CardDescription>
              {role !== "MECHANIC"
                ? "Arriendos, servicios, nómina y otros gastos registrados."
                : "Arriendos, servicios y otros gastos. No incluye nómina."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summary.hasObligations ? (
              <>
                <div className="coverage-value">
                  <strong>{cop(summary.paid)}</strong>
                  <span>pagados de {cop(summary.total)}</span>
                </div>
                <Progress
                  value={summary.percent}
                  aria-label={`${Math.round(summary.percent)}% de los gastos pagados`}
                />
                <div className="coverage-caption">
                  <span>{Math.round(summary.percent)}% pagado</span>
                  <strong>{cop(summary.remaining)} pendientes</strong>
                </div>
              </>
            ) : (
              <DataEmpty
                icon={EmptyWallet}
                compact
                title="Sin gastos en este mes"
                description="Los compromisos registrados permitirán calcular cuánto falta por pagar."
              />
            )}
          </CardContent>
          <CardFooter>
            {onOpenCash ? (
              <Button variant="secondary" onClick={onOpenCash}>
                {summary.hasObligations
                  ? "Revisar gastos por pagar"
                  : "Registrar gastos del mes"}
                <ArrowUpRight data-icon="inline-end" />
              </Button>
            ) : (
              <span>
                {summary.hasObligations
                  ? "Los abonos y las reversiones actualizan este saldo."
                  : "Registra los compromisos del taller para calcular cuánto falta por pagar."}
              </span>
            )}
          </CardFooter>
        </Card>
        <Card className="finance-liquidity">
          <CardHeader>
            <CardTitle>
              <Wallet />
              Dinero disponible
            </CardTitle>
            <CardDescription>
              Suma de caja y bancos, al día de hoy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summary.hasAccounts ? (
              <strong className="finance-number">
                {cop(summary.available)}
              </strong>
            ) : (
              <DataEmpty
                icon={EmptyWallet}
                compact
                title="Sin cuentas registradas"
                description="Añade una cuenta con su saldo inicial desde Dinero."
              />
            )}
            <div className="account-breakdown">
              {data.accounts.map((a) => (
                <div key={a.id}>
                  <span>{a.name}</span>
                  <strong>{cop(a.balance)}</strong>
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter>
            <span>
              {!summary.hasAccounts
                ? "Registra una caja o cuenta bancaria con su saldo inicial."
                : !summary.hasObligations
                  ? "Registra los gastos del mes para compararlos con este saldo."
                  : Number(summary.shortfall) > 0
                    ? `Faltan ${cop(summary.shortfall)} al comparar el saldo con los gastos pendientes del mes.`
                    : "El saldo alcanza para los gastos pendientes registrados. No contempla otros compromisos ni dinero reservado."}
            </span>
          </CardFooter>
        </Card>
      </div>
      {!compact && (
        <div className="finance-details-grid">
          <Card>
            <CardHeader>
              <CardTitle>Entradas y salidas del mes</CardTitle>
              <CardDescription>
                Movimientos registrados, incluidos anticipos, préstamos y
                reversiones.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="cash-flow-totals">
                <div>
                  <span>
                    <ArrowDownLeft />
                    Entradas
                  </span>
                  <strong>{cop(summary.inflow)}</strong>
                </div>
                <div>
                  <span>
                    <ArrowUpRight />
                    Salidas
                  </span>
                  <strong>{cop(summary.outflow)}</strong>
                </div>
                <div>
                  <span>Movimiento neto</span>
                  <strong>{cop(summary.net)}</strong>
                </div>
              </div>
              {summary.series.length ? (
                <ChartContainer
                  config={{
                    inflow: { label: "Entradas", color: "var(--chart-1)" },
                    outflow: { label: "Salidas", color: "var(--chart-2)" },
                  }}
                  className="h-52 w-full"
                >
                  <BarChart data={summary.series} accessibilityLayer>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) => String(v).slice(8)}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      width={56}
                      tickFormatter={(v) => `${Number(v) / 1_000_000} M`}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(v) => dateLabel(String(v))}
                          formatter={(v, name) => (
                            <>
                              <span>
                                {name === "inflow" ? "Entradas" : "Salidas"}
                              </span>
                              <strong>{cop(Number(v))}</strong>
                            </>
                          )}
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar
                      isAnimationActive={!reducedMotion}
                      dataKey="inflow"
                      fill="var(--color-inflow)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      isAnimationActive={!reducedMotion}
                      dataKey="outflow"
                      fill="var(--color-outflow)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              ) : (
                <DataEmpty
                  icon={EmptyWallet}
                  compact
                  title="Sin movimientos en este mes"
                  description="Los cobros y pagos registrados aparecerán en esta gráfica."
                />
              )}
            </CardContent>
          </Card>
          <Card className="finance-due">
            <CardHeader>
              <CardTitle>
                <CalendarClock />
                Pagos por atender
              </CardTitle>
              <CardDescription>
                {summary.overdue.length
                  ? summary.overdue.length === 1
                    ? "1 obligación vencida en los períodos registrados."
                    : `${summary.overdue.length} obligaciones vencidas en los períodos registrados.`
                  : "Próximos vencimientos registrados."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {summary.next.length ? (
                <ul>
                  {summary.next.map((o) => (
                    <li key={o.id}>
                      <div>
                        <strong>{o.title}</strong>
                        <small>{dateLabel(o.dueOn)}</small>
                      </div>
                      <div>
                        <strong>
                          {cop(Number(o.amount) - Number(o.paid))}
                        </strong>
                        <Badge
                          variant="outline"
                          data-payment-state={
                            o.dueOn < todayInBogota() ? "overdue" : "pending"
                          }
                        >
                          {o.dueOn < todayInBogota() ? "Vencido" : "Pendiente"}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <DataEmpty
                  icon={EmptyWallet}
                  compact
                  title="Sin pagos pendientes"
                  description="Los compromisos por pagar aparecerán aquí según su vencimiento."
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
