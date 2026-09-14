"use client";
import { SearchX as EmptySearchX } from "lucide-react";
import { DataEmpty } from "@/components/data-empty";
import { RecordStamp } from "@/features/activity/activity-ui";
import { useState, type ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { RowActions } from "@/components/row-actions";
import { AttendanceWorkspace } from "@/features/attendance/attendance-workspace";
import { OperationsPanel } from "@/components/operations-panel";
import { FormSheet } from "@/components/form-sheet";
import { OperationForm, type Dialog } from "@/components/operation-form";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Choice,
  DateRangePicker,
  dateLabel,
} from "@/components/workshop-controls";
import { todayInBogota, cop } from "@/features/cash/summary";
import {
  useCompensationHistory,
  useOvertime,
  useTeamCommand,
  useTeamOverview,
} from "./hooks";
import { BenefitsWorkspace } from "./benefits-workspace";
import { CompensationSheet } from "./compensation-sheet";
import { OvertimeForm } from "./overtime-form";
import type { OperationsView } from "@/domain/operations-view";

export function TeamWorkspace(props: ComponentProps<typeof OperationsPanel>) {
  const params = useSearchParams();
  const tab = params.get("teamTab") ?? "people";
  return (
    <div className="workspace-tabs flex flex-col gap-5">
      <Tabs
        value={tab}
        onValueChange={(value) =>
          window.history.pushState(null, "", `?view=Equipo&teamTab=${value}`)
        }
      >
        <TabsList aria-label="Equipo">
          <TabsTrigger value="people">Personal y salarios</TabsTrigger>
          <TabsTrigger value="overtime">Bonos y horas extra</TabsTrigger>
          <TabsTrigger value="attendance">Asistencia</TabsTrigger>
          <TabsTrigger value="leaves">Permisos</TabsTrigger>
          <TabsTrigger value="advances">Anticipos</TabsTrigger>
          <TabsTrigger value="payroll">Pago del mes</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "attendance" ? (
        <AttendanceWorkspace
          team
          members={props.data.members}
          locations={props.locations}
        />
      ) : ["leaves", "advances", "payroll"].includes(tab) ? (
        <BenefitsWorkspace
          role={props.role}
          key={tab}
          tab={tab as "leaves" | "advances" | "payroll"}
          data={props.data}
        />
      ) : (
        <TeamCosts {...props} />
      )}
    </div>
  );
}
function TeamCosts(props: ComponentProps<typeof OperationsPanel>) {
  const params = useSearchParams(),
    today = todayInBogota();
  const tab = params.get("teamTab") === "overtime" ? "overtime" : "people";
  const requestedPeriod = params.get("period") ?? "";
  const period =
    tab === "overtime" && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedPeriod)
      ? requestedPeriod
      : today.slice(0, 7);
  const periodLabel = new Date(`${period}-01T12:00:00Z`).toLocaleDateString(
    "es-CO",
    { month: "long", timeZone: "UTC" },
  );
  const overview = useTeamOverview(period),
    command = useTeamCommand();
  const [member, setMember] = useState<
    OperationsView["members"][number] | null
  >(null);
  const [extraOpen, setExtraOpen] = useState(false),
    [dialog, setDialog] = useState<Dialog | null>(null);
  const history = useCompensationHistory(member?.id);
  const qp = new URLSearchParams();
  for (const key of [
    "q",
    "memberId",
    "status",
    "page",
    "orderBy",
    "direction",
    "from",
    "to",
  ])
    if (params.get(key)) qp.set(key, params.get(key)!);
  if (!qp.has("from")) qp.set("from", `${period}-01`);
  if (!qp.has("to")) {
    const end = new Date(`${period}-01T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(0);
    qp.set("to", end.toISOString().slice(0, 10));
  }
  const overtime = useOvertime(qp, tab === "overtime");
  function update(values: Record<string, string>) {
    const q = new URLSearchParams(params.toString());
    q.delete("page");
    for (const [k, v] of Object.entries(values)) v ? q.set(k, v) : q.delete(k);
    window.history.pushState(null, "", `?${q}`);
  }
  return (
    <div className="workspace-tabs flex flex-col gap-5">
      {overview.isPending ? (
        <Skeleton className="h-28" />
      ) : overview.isError ? (
        <Alert variant="destructive">
          <AlertTitle>{overview.error.message}</AlertTitle>
        </Alert>
      ) : (
        <>
          <dl className="team-cost-summary">
            <div>
              <dt>Salarios mensuales</dt>
              <dd>{cop(overview.data.salaries)}</dd>
              <p>{overview.data.configured} personas con salario registrado</p>
            </div>
            <div>
              <dt>Bonos y horas extra · {periodLabel}</dt>
              <dd>{cop(overview.data.overtimePay)}</dd>
              <p>
                {(overview.data.overtimeMinutes / 60).toLocaleString("es-CO", {
                  maximumFractionDigits: 2,
                })}{" "}
                horas registradas
              </p>
            </div>
            <div>
              <dt>Costo mensual estimado</dt>
              <dd>{cop(overview.data.monthlyCost)}</dd>
              <p>
                Incluye{" "}
                {cop(
                  Number(overview.data.employerCosts) +
                    Number(overview.data.overtimeEmployerCost),
                )}{" "}
                de costos adicionales
              </p>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            Base mensual según los salarios vigentes al{" "}
            {dateLabel(overview.data.asOf)}, más los bonos y horas extra del
            mes.{" "}
            {overview.data.missing > 0
              ? `${overview.data.missing} personas sin salario configurado. `
              : ""}
            Registra los pagos y abonos en Pago del mes.
          </p>
        </>
      )}
      {tab === "people" ? (
        <OperationsPanel
          {...props}
          onCompensation={setMember}
          compensationRates={overview.data?.rates}
        />
      ) : (
        <>
          <div className="operations-heading">
            <p>Bonos de importe fijo y tiempo adicional al de las tareas.</p>
            <Button onClick={() => setExtraOpen(true)}>
              <Plus data-icon="inline-start" />
              Registrar bono
            </Button>
          </div>
          <div
            className="commercial-filters"
            role="search"
            aria-label="Filtros de bonos y horas extra"
          >
            <label>
              Mes
              <Choice
                label="Mes"
                value={period}
                options={Array.from({ length: 24 }, (_, i) => {
                  const d = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
                  d.setUTCMonth(d.getUTCMonth() - i);
                  return {
                    id: d.toISOString().slice(0, 7),
                    label: d.toLocaleDateString("es-CO", {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    }),
                  };
                })}
                onChange={(value) =>
                  update({ period: value, from: "", to: "" })
                }
              />
            </label>
            <label>
              Buscar
              <Input
                value={params.get("q") ?? ""}
                onChange={(e) => update({ q: e.target.value })}
                placeholder="Empleado, tarea u observación"
              />
            </label>
            <label>
              Empleado
              <Choice
                label="Empleado"
                value={params.get("memberId") ?? ""}
                options={[
                  { id: "", label: "Todo el equipo" },
                  ...props.data.members.map((m) => ({
                    id: m.id,
                    label: m.name,
                  })),
                ]}
                onChange={(memberId) => update({ memberId })}
              />
            </label>
            <label>
              Estado
              <Choice
                label="Estado"
                value={params.get("status") ?? "active"}
                options={[
                  { id: "active", label: "Registrados" },
                  { id: "voided", label: "Anulados" },
                  { id: "all", label: "Todas" },
                ]}
                onChange={(status) => update({ status })}
              />
            </label>
            <label>
              Fechas
              <DateRangePicker
                from={qp.get("from")!}
                to={qp.get("to")!}
                onChange={(from, to) => update({ from, to })}
              />
            </label>
            <Button
              variant="ghost"
              onClick={() =>
                window.history.pushState(
                  null,
                  "",
                  "?view=Equipo&teamTab=overtime",
                )
              }
            >
              Limpiar filtros
            </Button>
          </div>
          {overtime.isPending ? (
            <Skeleton className="h-48" />
          ) : overtime.isError ? (
            <Alert variant="destructive">
              <AlertTitle>{overtime.error.message}</AlertTitle>
            </Alert>
          ) : (
            <div className="data-panel">
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      ["name", "Empleado / actividad"],
                      ["workedOn", "Fecha"],
                      ["minutes", "Tiempo"],
                      ["", "Tipo / recargo"],
                      ["pay", "Valor"],
                      ["", "Estado"],
                      ["", "Acciones"],
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
                                  params.get("orderBy") === key &&
                                  params.get("direction") === "asc"
                                    ? "desc"
                                    : "asc",
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
                  {overtime.data?.rows.length ? (
                    overtime.data.rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <strong>{row.name}</strong>
                          <div>
                            <RecordStamp id={row.id} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {row.task ?? "Trabajo general del taller"}
                          </p>
                          <p className="max-w-80 text-sm whitespace-normal">
                            {row.note}
                          </p>
                          {row.voidReason && (
                            <p className="text-sm text-destructive">
                              Anulación: {row.voidReason}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>{dateLabel(row.workedOn)}</TableCell>
                        <TableCell>
                          {row.kind === "FIXED" ? "—" : `${row.minutes} min`}
                        </TableCell>
                        <TableCell>
                          {row.kind === "FIXED"
                            ? "Bono fijo"
                            : `${row.kind === "DAY" ? "Diurnas" : "Nocturnas"} · ${row.surchargePercent}%`}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {cop(row.pay)}
                          {Number(row.employerCost) > 0 && (
                            <p className="text-xs text-muted-foreground">
                              + {cop(row.employerCost)} de costo adicional
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={row.voidedAt ? "outline" : "secondary"}
                          >
                            {row.voidedAt ? "Anulado" : "Registrado"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {!row.voidedAt && props.role === "ADMIN" && (
                            <RowActions
                              name={row.name}
                              actions={[
                                {
                                  label: "Anular",
                                  danger: true,
                                  run: () =>
                                    setDialog({
                                      kind: "overtime-void",
                                      title: `Anular bono de ${row.name}`,
                                      extra: { id: row.id },
                                      description: `${cop(row.pay)} del ${dateLabel(row.workedOn)}. El registro queda en el historial.`,
                                      fields: [
                                        {
                                          key: "reason",
                                          label: "Motivo",
                                          type: "textarea",
                                        },
                                      ],
                                      submitLabel: "Anular bono",
                                    }),
                                },
                              ]}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="p-0">
                        <DataEmpty
                          icon={EmptySearchX}
                          title="Sin bonos para esta consulta"
                          description="Revisa el empleado y el período seleccionados."
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3">
                <span className="text-sm">
                  {overtime.data?.total ?? 0} registros · Página{" "}
                  {overtime.data?.page ?? 1}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={!overtime.data || overtime.data.page <= 1}
                    onClick={() =>
                      update({ page: String((overtime.data?.page ?? 1) - 1) })
                    }
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      !overtime.data ||
                      overtime.data.page * overtime.data.pageSize >=
                        overtime.data.total
                    }
                    onClick={() =>
                      update({ page: String((overtime.data?.page ?? 1) + 1) })
                    }
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      <CompensationSheet
        role={props.role}
        member={member}
        history={history}
        onClose={() => setMember(null)}
      />
      <FormSheet open={extraOpen} onOpenChange={setExtraOpen}>
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>Registrar bono</SheetTitle>
            <SheetDescription>
              Elige un importe fijo o calcula el valor con las horas y el
              salario vigente.
            </SheetDescription>
          </SheetHeader>
          {extraOpen && (
            <OvertimeForm
              data={props.data}
              orders={props.orders}
              onSaved={() => {
                setExtraOpen(false);
                toast.success("Bono registrado.");
              }}
            />
          )}
        </SheetContent>
      </FormSheet>
      <FormSheet
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>{dialog?.title}</SheetTitle>
            <SheetDescription>{dialog?.description}</SheetDescription>
          </SheetHeader>
          {dialog && (
            <OperationForm
              dialog={dialog}
              submit={async (input) => {
                await command.mutateAsync({ kind: "overtime-void", input });
                setDialog(null);
                toast.success("Registro anulado.");
              }}
            />
          )}
        </SheetContent>
      </FormSheet>
    </div>
  );
}
