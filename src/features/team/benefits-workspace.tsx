"use client";
import { PayrollWorkspace } from "./payroll-workspace";
import { RecordStamp } from "@/features/activity/activity-ui";
import type { Role } from "@/domain/permissions";
import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Decimal from "decimal.js";
import { ArrowUpDown, Plus, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { FormSheet } from "@/components/form-sheet";
import { RowActions } from "@/components/row-actions";
import {
  Choice,
  DateRangePicker,
  MonthField,
  dateLabel,
} from "@/components/workshop-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  leaveTreatments,
  type AdvanceRow,
  type LeaveRow,
  type BenefitPage,
  type VacationAccount,
  type PayrollPreview,
} from "@/domain/employee-benefits";
import type { OperationsView } from "@/domain/operations-view";
import { useTeamRequest } from "./hooks";
import {
  BenefitForm,
  benefitTitles,
  benefitDescription,
  type BenefitDialog,
} from "./benefit-forms";
import { todayInBogota, cop } from "@/features/cash/summary";

const hours = (minutes: number) =>
  `${(minutes / 60).toLocaleString("es-CO", { maximumFractionDigits: 2 })} h`;
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
function Pages({
  total,
  page,
  change,
}: {
  total: number;
  page: number;
  change: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / 10));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3">
      <span className="text-sm text-muted-foreground">
        {total} registros · Página {page} de {pages}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => change(page - 1)}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          disabled={page >= pages}
          onClick={() => change(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <TableRow>
      <TableCell
        colSpan={8}
        className="py-12 text-center text-muted-foreground"
      >
        {children}
      </TableCell>
    </TableRow>
  );
}
function Feedback({
  error,
  pending,
}: {
  error: Error | null;
  pending: boolean;
}) {
  return error ? (
    <Alert variant="destructive">
      <AlertTitle>{error.message}</AlertTitle>
    </Alert>
  ) : pending ? (
    <Skeleton className="h-48" />
  ) : null;
}

export function BenefitsWorkspace({
  role,
  tab,
  data,
}: {
  tab: "leaves" | "advances" | "payroll";
  data: OperationsView;
  role: Role;
}) {
  const params = useSearchParams();
  const [dialog, setDialog] = useState<BenefitDialog | null>(null),
    [detail, setDetail] = useState<LeaveRow | AdvanceRow | null>(null),
    [vacations, setVacations] = useState(false);
  const q = new URLSearchParams();
  for (const key of [
    "q",
    "memberId",
    "status",
    "from",
    "to",
    "treatment",
    "page",
    "orderBy",
    "direction",
  ])
    if (params.get(key)) q.set(key, params.get(key)!);
  q.set("resource", tab);
  const query = useTeamRequest<BenefitPage<LeaveRow | AdvanceRow>>(
    q,
    tab !== "payroll",
  );
  function update(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    next.delete("page");
    for (const [key, value] of Object.entries(values))
      value ? next.set(key, value) : next.delete(key);
    window.history.replaceState(null, "", `?${next}`);
  }
  const sort = (key: string) =>
    update({
      orderBy: key,
      direction:
        q.get("orderBy") === key && q.get("direction") === "asc"
          ? "desc"
          : "asc",
    });
  const header = (key: string, label: string) => (
    <TableHead
      aria-sort={
        q.get("orderBy") === key
          ? q.get("direction") === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <Button variant="ghost" size="sm" onClick={() => sort(key)}>
        {label}
        <ArrowUpDown className="size-3.5" />
      </Button>
    </TableHead>
  );
  const selected = detail
    ? (query.data?.rows.find((r) => r.id === detail.id) ?? detail)
    : null;
  const action = (d: BenefitDialog) => {
    setDetail(null);
    setDialog(d);
  };
  return (
    <div className="space-y-5">
      {tab === "payroll" ? (
        <PayrollWorkspace
          data={data}
          role={role}
          onAdvances={(id) =>
            window.history.pushState(
              null,
              "",
              `?view=Equipo&teamTab=advances&memberId=${id}`,
            )
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">
                {tab === "leaves"
                  ? "Permisos del equipo"
                  : "Anticipos de salario"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {tab === "leaves"
                  ? "Ausencias autorizadas, descuentos y vacaciones."
                  : "Dinero entregado y cuotas acordadas con cada empleado."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {tab === "leaves" && (
                <Button variant="outline" onClick={() => setVacations(true)}>
                  <CalendarDays />
                  Vacaciones
                </Button>
              )}
              <Button
                onClick={() =>
                  setDialog({ kind: tab === "leaves" ? "leave" : "advance" })
                }
              >
                <Plus />
                {tab === "leaves" ? "Registrar permiso" : "Entregar anticipo"}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-52 flex-1 space-y-2 lg:max-w-md">
              <Label htmlFor="benefit-search">Buscar</Label>
              <Input
                id="benefit-search"
                placeholder="Empleado o motivo"
                value={q.get("q") ?? ""}
                onChange={(e) => update({ q: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="benefit-member-filter">Empleado</Label>
              <Choice
                id="benefit-member-filter"
                value={q.get("memberId") ?? ""}
                onChange={(v) => update({ memberId: v })}
                options={[
                  { id: "", label: "Todo el equipo" },
                  ...data.members.map((m) => ({ id: m.id, label: m.name })),
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="benefit-status">Estado</Label>
              <Choice
                id="benefit-status"
                value={q.get("status") ?? "active"}
                onChange={(v) => update({ status: v })}
                options={[
                  { id: "active", label: "Vigentes" },
                  { id: "voided", label: "Anulados" },
                  { id: "all", label: "Todos" },
                ]}
              />
            </div>
            {tab === "leaves" && (
              <div className="space-y-2">
                <Label htmlFor="benefit-treatment-filter">Descuento</Label>
                <Choice
                  id="benefit-treatment-filter"
                  value={q.get("treatment") ?? ""}
                  onChange={(v) => update({ treatment: v })}
                  options={[
                    { id: "", label: "Todos" },
                    ...Object.entries(leaveTreatments).map(([id, label]) => ({
                      id,
                      label,
                    })),
                  ]}
                />
              </div>
            )}
            <div className="w-full space-y-2 sm:w-auto sm:min-w-64">
              <span className="text-sm font-medium">Fechas</span>
              <DateRangePicker
                from={q.get("from") ?? ""}
                to={q.get("to") ?? ""}
                onChange={(from, to) => update({ from, to })}
              />
            </div>
            {q.size > 1 && (
              <Button
                variant="ghost"
                onClick={() =>
                  window.history.replaceState(
                    null,
                    "",
                    `?view=Equipo&teamTab=${tab}`,
                  )
                }
              >
                Limpiar filtros
              </Button>
            )}
          </div>
          <Feedback pending={query.isPending} error={query.error} />
          {query.data && (
            <div className="data-panel">
              <Table>
                <TableHeader>
                  <TableRow>
                    {header("name", "Empleado")}
                    {header(
                      "date",
                      tab === "leaves" ? "Permiso" : "Desembolso",
                    )}
                    <TableHead>
                      {tab === "leaves" ? "Tratamiento" : "Cuenta"}
                    </TableHead>
                    {header(
                      "amount",
                      tab === "leaves" ? "Descuento" : "Anticipo",
                    )}
                    <TableHead>
                      {tab === "leaves" ? "Horas" : "Por descontar"}
                    </TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!query.data.rows.length && (
                    <Empty>
                      No hay {tab === "leaves" ? "permisos" : "anticipos"} con
                      estos filtros.
                    </Empty>
                  )}
                  {query.data.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Button
                          variant="link"
                          className="h-auto p-0 text-left font-medium"
                          onClick={() => setDetail(row)}
                        >
                          {row.name}
                        </Button>
                        <div>
                          <RecordStamp id={row.id} />
                        </div>
                        <p className="mt-1 max-w-64 truncate text-xs text-muted-foreground">
                          {row.note}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {"treatment" in row ? (
                          <>
                            {dateLabel(row.startsAt)}
                            <p className="text-xs text-muted-foreground">
                              {row.startsAt.slice(0, 10) ===
                              row.endsAt.slice(0, 10)
                                ? time(row.startsAt) === "00:00"
                                  ? "Jornada completa"
                                  : `${time(row.startsAt)}–${time(row.endsAt)}`
                                : `hasta ${dateLabel(row.endsAt)}`}
                            </p>
                          </>
                        ) : (
                          dateLabel(row.disbursedOn)
                        )}
                      </TableCell>
                      <TableCell>
                        {"treatment" in row ? (
                          <Badge
                            variant="outline"
                            className={
                              row.treatment === "HOURS"
                                ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                                : row.treatment === "VACATION"
                                  ? "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                            }
                          >
                            {leaveTreatments[row.treatment]}
                          </Badge>
                        ) : (
                          row.account
                        )}
                      </TableCell>
                      <TableCell className="money-cell">
                        {"treatment" in row
                          ? row.treatment === "VACATION"
                            ? `${Number(row.vacationDays).toLocaleString("es-CO")} ${Number(row.vacationDays) === 1 ? "día" : "días"}`
                            : cop(row.salaryDeduction)
                          : cop(row.amount)}
                      </TableCell>
                      <TableCell className="money-cell">
                        {"treatment" in row
                          ? hours(row.minutes)
                          : cop(row.balance)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {row.voidedAt
                            ? "Anulado"
                            : "treatment" in row
                              ? "Autorizado"
                              : Number(row.balance) === 0
                                ? "Descontado"
                                : "Por descontar"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <RowActions
                          name={row.name}
                          actions={[
                            { label: "Ver detalle", run: () => setDetail(row) },
                            ...(!row.voidedAt &&
                            !("treatment" in row) &&
                            role === "OFFICE"
                              ? [
                                  {
                                    label: "Cambiar cuotas",
                                    run: () =>
                                      action({
                                        kind: "advance-plan",
                                        advance: row,
                                      }),
                                  },
                                ]
                              : []),
                            ...(!row.voidedAt && role === "ADMIN"
                              ? "treatment" in row
                                ? [
                                    {
                                      label: "Anular permiso",
                                      danger: true,
                                      run: () =>
                                        action({
                                          kind: "leave-void",
                                          leave: row,
                                        }),
                                    },
                                  ]
                                : [
                                    {
                                      label: "Cambiar cuotas",
                                      disabled: Number(row.balance) === 0,
                                      run: () =>
                                        action({
                                          kind: "advance-plan",
                                          advance: row,
                                        }),
                                    },
                                    {
                                      label: "Anular y devolver dinero",
                                      danger: true,
                                      disabled: row.installments.some(
                                        (i) => !!i.appliedOn,
                                      ),
                                      run: () =>
                                        action({
                                          kind: "advance-void",
                                          advance: row,
                                        }),
                                    },
                                  ]
                              : []),
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pages
                total={query.data.total}
                page={query.data.page}
                change={(page) => update({ page: String(page) })}
              />
            </div>
          )}
        </>
      )}
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>{selected?.name}</SheetTitle>
            <SheetDescription>
              {selected && "treatment" in selected
                ? "Detalle del permiso autorizado"
                : "Anticipo y descuentos del salario"}
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="sheet-body space-y-6">
              {"treatment" in selected ? (
                <>
                  <dl className="grid grid-cols-2 gap-5 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Desde</dt>
                      <dd>
                        {dateLabel(selected.startsAt)} ·{" "}
                        {time(selected.startsAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Hasta</dt>
                      <dd>
                        {dateLabel(selected.endsAt)} · {time(selected.endsAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Horario autorizado
                      </dt>
                      <dd>{hours(selected.minutes)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Tratamiento</dt>
                      <dd>{leaveTreatments[selected.treatment]}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Descuento salarial
                      </dt>
                      <dd>{cop(selected.salaryDeduction)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Vacaciones</dt>
                      <dd>{Number(selected.vacationDays)} días</dd>
                    </div>
                  </dl>
                  <p className="whitespace-pre-wrap">{selected.note}</p>
                  <RecordStamp id={selected.id} />
                  {selected.voidedAt ? (
                    <p className="text-destructive">
                      Anulado: {selected.voidReason}
                    </p>
                  ) : (
                    role === "ADMIN" && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          action({ kind: "leave-void", leave: selected })
                        }
                      >
                        Anular permiso
                      </Button>
                    )
                  )}
                </>
              ) : (
                <AdvanceDetail row={selected} onAction={action} role={role} />
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
      <Sheet open={vacations} onOpenChange={setVacations}>
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>Vacaciones</SheetTitle>
            <SheetDescription>
              Saldo registrado menos permisos de vacaciones autorizados,
              incluidos los futuros.
            </SheetDescription>
          </SheetHeader>
          {vacations && (
            <VacationBalances
              onAdjust={(memberId) => {
                setVacations(false);
                setDialog({ kind: "vacation", memberId });
              }}
            />
          )}
        </SheetContent>
      </Sheet>
      <FormSheet
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>
              {dialog?.reverse
                ? "Revertir descuento"
                : dialog
                  ? benefitTitles[dialog.kind]
                  : ""}
            </SheetTitle>
            <SheetDescription>
              {dialog ? benefitDescription(dialog) : ""}
            </SheetDescription>
          </SheetHeader>
          {dialog && (
            <BenefitForm
              key={`${dialog.kind}-${dialog.installmentId ?? dialog.memberId ?? ""}`}
              dialog={dialog}
              data={data}
              onSaved={() => {
                setDialog(null);
                toast.success("Registro guardado.");
              }}
            />
          )}
        </SheetContent>
      </FormSheet>
    </div>
  );
}

function AdvanceDetail({
  role,
  row,
  onAction,
}: {
  row: AdvanceRow;
  role: Role;
  onAction: (d: BenefitDialog) => void;
}) {
  const history = useTeamRequest<
    {
      id: string;
      action: string;
      createdAt: string;
      actor: string;
      details: { reason?: string; reverse?: boolean };
    }[]
  >(new URLSearchParams({ resource: "advance-history", id: row.id }));
  const labels: Record<string, string> = {
    SALARY_ADVANCE: "Anticipo entregado",
    SALARY_ADVANCE_PLAN: "Cuotas modificadas",
    SALARY_ADVANCE_DEDUCTION: "Descuento registrado",
    SALARY_ADVANCE_VOID: "Anticipo anulado",
    SALARY_ADVANCE_PAYROLL: "Cuota aplicada con el pago del salario",
  };
  return (
    <>
      <div className="flex justify-between gap-4 rounded-lg bg-muted p-4">
        <div>
          <p className="text-sm text-muted-foreground">Dinero entregado</p>
          <p className="text-xl font-semibold tabular-nums">
            {cop(row.amount)}
          </p>
          <p className="mt-1 text-xs">
            {dateLabel(row.disbursedOn)} · {row.account}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Por descontar</p>
          <p className="text-xl font-semibold tabular-nums">
            {cop(row.balance)}
          </p>
        </div>
      </div>
      <p className="whitespace-pre-wrap">{row.note}</p>
      <section className="space-y-3">
        <h3 className="font-semibold">Plan de descuentos</h3>
        {row.installments
          .filter((i) => !i.cancelledAt)
          .map((i) => (
            <div
              key={i.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"
            >
              <div>
                <p className="font-medium">
                  {i.period} · {cop(i.amount)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {i.appliedOn
                    ? `Descontado el ${dateLabel(i.appliedOn)}`
                    : "Pendiente de descontar"}
                </p>
              </div>
              {!row.voidedAt && (!i.appliedOn || role === "ADMIN") && (
                <Button
                  variant="outline"
                  disabled={
                    !i.appliedOn && i.period > todayInBogota().slice(0, 7)
                  }
                  onClick={() =>
                    onAction({
                      kind: "advance-deduction",
                      advance: row,
                      installmentId: i.id,
                      reverse: !!i.appliedOn,
                    })
                  }
                >
                  {i.appliedOn ? "Revertir descuento" : "Registrar descuento"}
                </Button>
              )}
            </div>
          ))}
        {row.voidedAt && (
          <p className="text-destructive">Anulado: {row.voidReason}</p>
        )}
      </section>
      {!row.voidedAt && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={Number(row.balance) === 0}
            onClick={() => onAction({ kind: "advance-plan", advance: row })}
          >
            Cambiar cuotas
          </Button>
          {role === "ADMIN" && (
            <Button
              variant="ghost"
              disabled={
                role !== "ADMIN" || row.installments.some((i) => !!i.appliedOn)
              }
              onClick={() => onAction({ kind: "advance-void", advance: row })}
            >
              Anular y devolver dinero
            </Button>
          )}
        </div>
      )}
      <section className="space-y-3">
        <h3 className="font-semibold">Historial</h3>
        <Feedback pending={history.isPending} error={history.error} />
        {history.data?.map((e) => (
          <div key={e.id} className="border-l-2 pl-3">
            <p className="text-sm font-medium">
              {e.details.reverse
                ? "Descuento revertido"
                : (labels[e.action] ?? e.action)}
            </p>
            <p className="text-xs text-muted-foreground">
              {dateLabel(e.createdAt)} · {time(e.createdAt)} · {e.actor}
            </p>
            {e.details.reason && (
              <p className="mt-1 text-sm">{e.details.reason}</p>
            )}
          </div>
        ))}
        {row.installments.some((i) => i.cancelledAt) && (
          <details className="text-sm">
            <summary className="cursor-pointer">
              Ver cuotas reemplazadas o anuladas
            </summary>
            <ul className="mt-2 space-y-2">
              {row.installments
                .filter((i) => i.cancelledAt)
                .map((i) => (
                  <li key={i.id}>
                    {i.period} · {cop(i.amount)} · retirada{" "}
                    {dateLabel(i.cancelledAt)}
                  </li>
                ))}
            </ul>
          </details>
        )}
      </section>
    </>
  );
}
function VacationBalances({ onAdjust }: { onAdjust: (id: string) => void }) {
  const query = useTeamRequest<VacationAccount[]>(
    new URLSearchParams({ resource: "vacations" }),
  );
  const [member, setMember] = useState(""),
    [page, setPage] = useState(1);
  const row = query.data?.find((r) => r.memberId === member);
  return (
    <div className="sheet-body space-y-5">
      <Feedback pending={query.isPending} error={query.error} />
      {query.data && (
        <>
          <Choice
            label="Ver empleado"
            value={member}
            onChange={(v) => {
              setMember(v);
              setPage(1);
            }}
            options={[
              { id: "", label: "Todo el equipo" },
              ...query.data.map((m) => ({ id: m.memberId, label: m.name })),
            ]}
          />
          {row ? (
            <>
              <p className="text-3xl font-semibold tabular-nums">
                {Number(row.balance).toLocaleString("es-CO")} días disponibles
              </p>
              <p className="text-sm text-muted-foreground">
                {Number(row.adjustments)} registrados · {Number(row.used)}{" "}
                usados o reservados
              </p>
              <Button variant="outline" onClick={() => onAdjust(row.memberId)}>
                Ajustar saldo
              </Button>
              <h3 className="font-semibold">Ajustes registrados</h3>
              {!row.history.length && (
                <p className="text-sm text-muted-foreground">
                  No hay saldo inicial registrado.
                </p>
              )}
              {row.history.map((h) => (
                <div key={h.id} className="border-b pb-3">
                  <p className="font-medium">
                    {Number(h.days) > 0 ? "+" : ""}
                    {Number(h.days)} días · {dateLabel(h.createdAt)}
                  </p>
                  <p className="text-sm text-muted-foreground">{h.note}</p>
                </div>
              ))}
            </>
          ) : (
            <div className="data-panel">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Días disponibles</TableHead>
                    <TableHead>
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.slice((page - 1) * 10, page * 10).map((r) => (
                    <TableRow key={r.memberId}>
                      <TableCell>
                        <Button
                          variant="link"
                          className="h-auto p-0"
                          onClick={() => setMember(r.memberId)}
                        >
                          {r.name}
                        </Button>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {Number(r.balance)}
                        <div>
                          <RecordStamp id={r.memberId} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <RowActions
                          name={r.name}
                          actions={[
                            {
                              label: "Ver saldo e historial",
                              run: () => setMember(r.memberId),
                            },
                            {
                              label: "Ajustar vacaciones",
                              run: () => onAdjust(r.memberId),
                            },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pages page={page} total={query.data.length} change={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
