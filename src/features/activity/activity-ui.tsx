"use client";
import { Bell as EmptyBell, History as EmptyHistory } from "lucide-react";
import { DataEmpty } from "@/components/data-empty";
import { useState } from "react";
import { Bell, History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivity, useReadNotifications } from "./hooks";
import {
  entityLabels,
  type ChangeStamp,
  type ActivityChange,
  type NotificationPage,
} from "@/domain/activity";

const stampDate = (date: string) =>
  new Date(date).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "short",
    timeStyle: "short",
  });
const fields: Record<string, string> = {
  name: "Nombre",
  email: "Correo",
  role: "Rol",
  active: "Acceso activo",
  monthlySalary: "Salario mensual",
  monthlyEmployerCost: "Costos adicionales",
  monthlyHours: "Horas mensuales",
  effectiveOn: "Vigente desde",
  note: "Observación",
  reason: "Motivo",
  title: "Concepto",
  amount: "Importe",
  balance: "Saldo",
  openingBalance: "Saldo inicial",
  direction: "Movimiento",
  kind: "Tipo",
  occurredOn: "Fecha",
  reference: "Referencia",
  counterparty: "Persona o empresa",
  period: "Mes",
  dueOn: "Vencimiento",
  estimated: "Estimado",
  category: "Categoría",
  dueDay: "Día de pago",
  minutes: "Minutos",
  pay: "Pago",
  employerCost: "Costo adicional",
  workedOn: "Día trabajado",
  surchargePercent: "Recargo (%)",
  treatment: "Descuento del permiso",
  startsAt: "Inicio",
  endsAt: "Fin",
  days: "Días de vacaciones",
  voidedAt: "Anulado el",
  voidReason: "Motivo de anulación",
  disbursedOn: "Entrega del anticipo",
  appliedOn: "Cuota aplicada el",
  cancelledAt: "Cuota reemplazada el",
  startedAt: "Entrada",
  endedAt: "Salida",
  expectedStart: "Entrada prevista",
  expectedEnd: "Salida prevista",
  correctedAt: "Corregido el",
  correctionNote: "Motivo de corrección",
  throughOn: "Cierre hasta",
  expected: "Saldo esperado",
  counted: "Saldo contado",
  difference: "Diferencia",
  reopenedAt: "Reabierto el",
  reopenReason: "Motivo de reapertura",
};
const values: Record<string, string> = {
  ADMIN: "Administrador",
  OFFICE: "Oficina",
  MECHANIC: "Mecánico",
  HOURS: "Horas del salario",
  VACATION: "Vacaciones",
  PAID: "Sin descuento",
  IN: "Entrada",
  OUT: "Salida",
  SALARY_PAYMENT: "Pago de salario",
  SALARY_ADVANCE: "Anticipo de salario",
  REVERSAL: "Reversión",
  PAYROLL: "Nómina",
  OTHER: "Otros",
  RENT: "Arriendo",
  UTILITIES: "Servicios públicos",
  FIXED: "Bono fijo",
  DAY: "Horas diurnas",
  NIGHT: "Horas nocturnas",
};
const display = (v: unknown) =>
  v === null || v === undefined
    ? "Sin valor"
    : typeof v === "boolean"
      ? v
        ? "Sí"
        : "No"
      : (values[String(v)] ?? String(v));

const moneyFields = new Set([
  "amount",
  "balance",
  "openingBalance",
  "monthlySalary",
  "monthlyEmployerCost",
  "pay",
  "employerCost",
  "expected",
  "counted",
  "difference",
]);
const dayFields = new Set([
  "effectiveOn",
  "occurredOn",
  "dueOn",
  "workedOn",
  "disbursedOn",
  "appliedOn",
  "throughOn",
]);
const fieldValue = (key: string, value: unknown) => {
  if (moneyFields.has(key) && value !== null && value !== undefined)
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 2,
    }).format(Number(value));
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value))
    return dayFields.has(key)
      ? new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString(
          "es-CO",
          { timeZone: "America/Bogota", dateStyle: "medium" },
        )
      : stampDate(value);
  return display(value);
};
function Changes({ params }: { params: URLSearchParams }) {
  const [page, setPage] = useState(1);
  const query = useActivity<ActivityChange[]>(
    new URLSearchParams({ ...Object.fromEntries(params), page: String(page) }),
  );
  if (query.isPending) return <Skeleton className="h-32" />;
  if (query.error)
    return (
      <Alert variant="destructive">
        <AlertTitle>{query.error.message}</AlertTitle>
      </Alert>
    );
  return (
    <div className="flex flex-col gap-5">
      {!query.data.length && (
        <DataEmpty
          icon={EmptyHistory}
          compact
          title="Sin cambios registrados"
          description="Las actualizaciones mostrarán su autor, fecha y detalle."
        />
      )}
      {query.data.map((c) => {
        const changed = Object.keys(c.after).filter(
          (k) =>
            fields[k] &&
            JSON.stringify(c.before?.[k]) !== JSON.stringify(c.after[k]),
        );
        return (
          <section key={c.id} className="flex flex-col gap-2 border-b pb-4">
            <div>
              <strong>
                {entityLabels[c.entityType] ?? "Registro"} ·{" "}
                {c.operation === "INSERT"
                  ? "Creado"
                  : c.operation === "BASELINE"
                    ? "Registro anterior"
                    : "Actualizado"}{" "}
                {c.subject && `· ${c.subject}`}
              </strong>
              <p className="text-sm text-muted-foreground">
                {c.author} · {stampDate(c.at)}
              </p>
            </div>
            <dl className="flex flex-col gap-2 text-sm">
              {changed.map((key) => (
                <div key={key}>
                  <dt className="font-medium">{fields[key]}</dt>
                  <dd className="break-words">
                    {c.before && (
                      <>
                        <span className="text-muted-foreground">
                          {fieldValue(key, c.before[key])}
                        </span>{" "}
                        →{" "}
                      </>
                    )}
                    {fieldValue(key, c.after[key])}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Anterior
        </Button>
        <span className="text-sm">Página {page}</span>
        <Button
          variant="outline"
          disabled={query.data.length < 50}
          onClick={() => setPage(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
export function RecordStamp({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const latest = useActivity<Record<string, ChangeStamp>>(
    new URLSearchParams({ resource: "latest" }),
  );
  const stamp = latest.data?.[id];
  return (
    <>
      <Button
        variant="link"
        className="h-auto max-w-full whitespace-normal p-0 text-left text-xs text-muted-foreground"
        onClick={() => setOpen(true)}
        aria-label="Ver historial de cambios"
      >
        <History data-icon="inline-start" />
        {stamp
          ? stamp.author === "Carga de datos"
            ? "Registro anterior · sin autor conservado"
            : `Último cambio: ${stamp.author} · ${stampDate(stamp.at)}`
          : latest.isPending
            ? "Consultando autor…"
            : latest.error
              ? "No se pudo consultar el autor"
              : "Sin autor registrado"}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>Historial de cambios</SheetTitle>
            <SheetDescription>
              Quién cambió el registro, cuándo y qué valores modificó.
            </SheetDescription>
          </SheetHeader>
          <div className="sheet-body">
            {open && (
              <Changes
                params={new URLSearchParams({ resource: "history", id })}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
export function AdminNotifications() {
  const [open, setOpen] = useState(false),
    [page, setPage] = useState(1),
    [batch, setBatch] = useState<string | null>(null);
  const query = useActivity<NotificationPage>(
      new URLSearchParams({ resource: "notifications", page: String(page) }),
    ),
    read = useReadNotifications();
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Notificaciones${query.data?.unread ? `: ${query.data.unread} sin leer` : ""}`}
        onClick={() => setOpen(true)}
        className="relative"
      >
        <Bell />
        {!!query.data?.unread && (
          <Badge className="absolute -right-1 -top-1 px-1 text-[10px]">
            {query.data.unread > 99 ? "99+" : query.data.unread}
          </Badge>
        )}
      </Button>
      <Sheet
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) setBatch(null);
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>
              {batch ? "Detalle del cambio" : "Notificaciones"}
            </SheetTitle>
            <SheetDescription>
              Registros creados o modificados por oficina en Dinero y Equipo.
            </SheetDescription>
          </SheetHeader>
          <div className="sheet-body flex flex-col gap-4">
            {batch ? (
              <>
                <Button variant="outline" onClick={() => setBatch(null)}>
                  Volver a notificaciones
                </Button>
                <Changes
                  key={batch}
                  params={
                    new URLSearchParams({ resource: "batch", batchId: batch })
                  }
                />
              </>
            ) : (
              <>
                {query.error && (
                  <Alert variant="destructive">
                    <AlertTitle>{query.error.message}</AlertTitle>
                  </Alert>
                )}
                {query.isPending ? (
                  <Skeleton className="h-32" />
                ) : query.data?.rows.length ? (
                  <>
                    {query.data.rows.some((n) => !n.readAt) && (
                      <Button
                        variant="outline"
                        disabled={read.isPending}
                        onClick={() =>
                          read.mutate(
                            query.data.rows
                              .filter((n) => !n.readAt)
                              .map((n) => n.id),
                            { onError: (e) => toast.error(e.message) },
                          )
                        }
                      >
                        Marcar esta página como leída
                      </Button>
                    )}
                    {query.data.rows.map((n) => (
                      <Button
                        key={n.id}
                        variant="ghost"
                        className="h-auto flex-col items-start gap-1 whitespace-normal border-b py-4 text-left"
                        onClick={() => {
                          setBatch(n.batchId);
                          if (!n.readAt)
                            read.mutate([n.id], {
                              onError: (e) => toast.error(e.message),
                            });
                        }}
                      >
                        <span className="flex items-center gap-2">
                          {!n.readAt && <Badge>Nueva</Badge>}
                          {n.title}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {n.author} · {stampDate(n.at)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {n.count} registros en esta operación · Ver cambios
                        </span>
                      </Button>
                    ))}
                  </>
                ) : (
                  <DataEmpty
                    icon={EmptyBell}
                    compact
                    title="Sin notificaciones"
                    description="Aquí recibirás los avisos de actividad del taller."
                  />
                )}
                <div className="flex justify-between gap-3">
                  <Button
                    variant="outline"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm">Página {page}</span>
                  <Button
                    variant="outline"
                    disabled={page * 20 >= (query.data?.total ?? 0)}
                    onClick={() => setPage(page + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
