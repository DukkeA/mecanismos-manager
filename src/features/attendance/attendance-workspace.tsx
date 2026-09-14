"use client";
import { SearchX as EmptySearchX } from "lucide-react";
import { DataEmpty } from "@/components/data-empty";
import { RecordStamp } from "@/features/activity/activity-ui";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpDown, ScanLine, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FormSheet } from "@/components/form-sheet";
import { OperationForm, type Dialog } from "@/components/operation-form";
import { RowActions } from "@/components/row-actions";
import {
  Choice,
  DateRangePicker,
  dateLabel,
} from "@/components/workshop-controls";
import { todayInBogota } from "@/features/cash/summary";
import type { OperationsView } from "@/domain/operations-view";
import type { AttendanceRow } from "@/domain/attendance";
import { useAttendance, useAttendanceCommand } from "./hooks";
import { QrScanner } from "./qr-scanner";
import { StationDisplay } from "./station-display";
const clock = (date: string | null) =>
  date
    ? new Date(date).toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/Bogota",
      })
    : "Sin salida";
const duration = (minutes: number | null) =>
  minutes === null
    ? "—"
    : minutes < 60
      ? `${minutes} min`
      : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
import { timeOfDay } from "@/domain/workshop-settings";
export function AttendanceWorkspace({
  team = false,
  members = [],
  locations,
}: {
  team?: boolean;
  members?: OperationsView["members"];
  locations: { id: string; name: string }[];
}) {
  const params = useSearchParams(),
    today = todayInBogota(),
    q = new URLSearchParams({ scope: team ? "team" : "own" });
  for (const key of [
    "from",
    "to",
    "q",
    "memberId",
    "page",
    "orderBy",
    "direction",
  ])
    if (params.get(`attendance_${key}`))
      q.set(key, params.get(`attendance_${key}`)!);
  if (!q.has("from")) q.set("from", `${today.slice(0, 7)}-01`);
  if (!q.has("to")) q.set("to", today);
  const query = useAttendance(q),
    command = useAttendanceCommand(),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [scan, setScan] = useState<"IN" | "OUT" | null>(null),
    [station, setStation] = useState("");
  function update(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    next.delete("attendance_page");
    for (const [key, value] of Object.entries(values))
      value
        ? next.set(`attendance_${key}`, value)
        : next.delete(`attendance_${key}`);
    window.history.pushState(null, "", `?${next}`);
  }
  function correct(row?: AttendanceRow) {
    setDialog({
      kind: "correct",
      title: row ? "Corregir marcación" : "Registrar jornada",
      description:
        "La corrección queda en el historial. Usa las horas de Bogotá.",
      extra: {
        id: row?.id,
        memberId: row?.memberId,
        locationId: row?.locationId,
        workedOn: row?.workedOn ?? today,
        start: row ? clock(row.startedAt) : "",
        end: row?.endedAt ? clock(row.endedAt) : "",
        endDate: row?.endedAt
          ? new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/Bogota",
            }).format(new Date(row.endedAt))
          : "",
        breakMinutes: row?.breakMinutes ?? 0,
      },
      fields: [
        {
          key: "memberId",
          label: "Empleado",
          type: "select",
          options: members.map((m) => ({ id: m.id, label: m.name })),
        },
        {
          key: "locationId",
          label: "Sede",
          type: "select",
          options: locations.map((l) => ({ id: l.id, label: l.name })),
        },
        { key: "workedOn", label: "Día de entrada", type: "date" },
        { key: "start", label: "Hora de entrada", type: "time" },
        {
          key: "endDate",
          label: "Día de salida",
          type: "date",
          optional: true,
        },
        {
          key: "end",
          label: "Hora de salida",
          type: "time",
          optional: true,
          hint: "Déjala vacía si la jornada sigue abierta.",
        },
        { key: "note", label: "Motivo de la corrección", type: "textarea" },
      ],
    });
  }
  return (
    <div className="space-y-5">
      {team ? (
        <div className="operations-heading">
          <p>Entradas, salidas y tiempo adicional por revisar.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setStation(locations[0]?.id ?? "")}
              disabled={!locations.length}
            >
              Mostrar QR
            </Button>
            <Button onClick={() => correct()}>
              <Plus />
              Registrar jornada
            </Button>
          </div>
        </div>
      ) : (
        <section className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="text-lg font-semibold">
            {query.data?.open
              ? "Tu jornada está abierta"
              : query.data?.today?.endedAt
                ? "Tu jornada de hoy está registrada"
                : "Registra tu jornada"}
          </h3>
          <p>
            {query.data?.open
              ? `Entrada a las ${clock(query.data.open.startedAt)} · ${query.data.open.location}`
              : query.data?.today?.endedAt
                ? `Entrada a las ${clock(query.data.today.startedAt)} · Salida a las ${clock(query.data.today.endedAt)}`
                : "Escanea el código de la sede al llegar y al terminar el día. No necesitas marcar el almuerzo."}
          </p>
          {!query.data?.today?.endedAt && (
            <Button
              disabled={!query.data || query.isFetching}
              onClick={() => setScan(query.data?.open ? "OUT" : "IN")}
            >
              <ScanLine />
              {query.data?.open ? "Registrar salida" : "Registrar entrada"}
            </Button>
          )}
        </section>
      )}
      {query.data && (
        <>
          <dl className="team-cost-summary">
            <div>
              <dt>Tiempo registrado</dt>
              <dd>{duration(query.data.summary.workedMinutes)}</dd>
              <p>Entre la entrada y la salida</p>
            </div>
            <div>
              <dt>Retrasos</dt>
              <dd>{duration(query.data.summary.lateMinutes)}</dd>
              <p>Según horario y tolerancia</p>
            </div>
            <div>
              <dt>Tiempo adicional por revisar</dt>
              <dd>{duration(query.data.summary.extraMinutes)}</dd>
              <p>Requiere revisión antes de reconocer un bono</p>
            </div>
          </dl>
          {query.data.summary.withoutSchedule > 0 && (
            <p className="text-sm text-muted-foreground">
              {query.data.summary.withoutSchedule} jornadas sin horario
              configurado. No se calculan retrasos ni tiempo adicional para
              ellas.
            </p>
          )}
        </>
      )}
      <div
        className="commercial-filters attendance-filters"
        role="search"
        aria-label="Filtros de asistencia"
      >
        <label>
          Fechas
          <DateRangePicker
            from={q.get("from") ?? ""}
            to={q.get("to") ?? ""}
            onChange={(from, to) => update({ from, to })}
          />
        </label>
        {team && (
          <>
            <label>
              Empleado
              <Choice
                value={q.get("memberId") ?? ""}
                onChange={(memberId) => update({ memberId })}
                options={[
                  { id: "", label: "Todo el equipo" },
                  ...members.map((m) => ({ id: m.id, label: m.name })),
                ]}
              />
            </label>
            <label>
              Buscar
              <Input
                value={q.get("q") ?? ""}
                onChange={(e) => update({ q: e.target.value })}
                placeholder="Empleado u observación"
              />
            </label>
          </>
        )}
      </div>
      {query.isError && <p role="alert">{query.error.message}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            {[
              ["name", "Empleado / fecha"],
              ["startedAt", "Entrada"],
              ["endedAt", "Salida"],
              ["", "Tiempo"],
              ["", "Retraso"],
              ["", "Adicional"],
              ...[...(team ? [["", "Acciones"]] : [])],
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
            <TableRow key={row.id}>
              <TableCell>
                <strong>{row.name}</strong>
                {team && (
                  <div>
                    <RecordStamp id={row.id} />
                  </div>
                )}
                <small className="cell-detail">
                  {dateLabel(row.workedOn)} · {row.location}
                </small>
                <small className="cell-detail">
                  {row.source === "QR" ? "Código QR" : "Registro manual"}
                  {row.note ? ` · ${row.note}` : ""}
                </small>
              </TableCell>
              <TableCell>{clock(row.startedAt)}</TableCell>
              <TableCell>
                {row.endedAt ? (
                  clock(row.endedAt)
                ) : (
                  <Badge variant="outline">Sin salida</Badge>
                )}
                {row.endedAt &&
                  new Intl.DateTimeFormat("en-CA", {
                    timeZone: "America/Bogota",
                  }).format(new Date(row.endedAt)) !== row.workedOn && (
                    <small className="cell-detail">Día siguiente</small>
                  )}
              </TableCell>
              <TableCell>{duration(row.workedMinutes)}</TableCell>
              <TableCell className={row.lateMinutes ? "text-destructive" : ""}>
                {duration(row.lateMinutes)}
                {row.authorizedMinutes > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Permiso: {duration(row.authorizedMinutes)}
                  </p>
                )}
              </TableCell>
              <TableCell>{duration(row.extraMinutes)}</TableCell>
              {team && (
                <TableCell>
                  <RowActions
                    name={row.name}
                    actions={[
                      { label: "Corregir marcación", run: () => correct(row) },
                    ]}
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
          {!query.isError && !query.data?.rows.length && (
            <TableRow>
              <TableCell colSpan={team ? 7 : 6} className="p-0">
                {query.isPending ? (
                  <p role="status">Consultando asistencia…</p>
                ) : (
                  <DataEmpty
                    icon={EmptySearchX}
                    title="Sin marcaciones para esta consulta"
                    description="Revisa el período y los filtros seleccionados."
                  />
                )}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="flex flex-wrap justify-between items-center gap-3">
        <span className="text-sm">
          {query.data?.total ?? 0} jornadas · Página {query.data?.page ?? 1}
        </span>
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
      {query.data && (
        <p className="border-t pt-4 text-sm text-muted-foreground">
          Lunes a viernes: {timeOfDay(query.data.settings.startMinute)}–
          {timeOfDay(query.data.settings.endMinute)} · Tolerancia:{" "}
          {query.data.settings.graceMinutes} min. Administración puede cambiarlo
          en Configuración.
        </p>
      )}
      <Sheet
        open={!!scan || !!station}
        onOpenChange={(open) => {
          if (!open) {
            setScan(null);
            setStation("");
          }
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>
              {scan
                ? scan === "IN"
                  ? "Registrar entrada"
                  : "Registrar salida"
                : "Código de asistencia"}
            </SheetTitle>
            <SheetDescription>
              {scan
                ? "Tu marcación usa la hora del taller."
                : "Cada sede tiene su propio código."}
            </SheetDescription>
          </SheetHeader>
          <div className="sheet-body">
            {scan ? (
              <QrScanner action={scan} onDone={() => setScan(null)} />
            ) : (
              station && (
                <>
                  <label className="block mb-5">
                    Sede
                    <Choice
                      value={station}
                      onChange={setStation}
                      options={locations.map((l) => ({
                        id: l.id,
                        label: l.name,
                      }))}
                    />
                  </label>
                  <StationDisplay
                    locationId={station}
                    name={locations.find((l) => l.id === station)?.name ?? ""}
                  />
                </>
              )
            )}
          </div>
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
            <SheetTitle>{dialog?.title}</SheetTitle>
            <SheetDescription>{dialog?.description}</SheetDescription>
          </SheetHeader>
          {dialog && (
            <OperationForm
              key={`${dialog.kind}-${dialog.extra?.id ?? "new"}`}
              dialog={dialog}
              submit={async (values) => {
                await command.mutateAsync({
                  kind: "correct",
                  input: {
                    ...values,
                    startedAt: `${values.workedOn}T${values.start}:00-05:00`,
                    ...(values.end
                      ? {
                          endedAt: `${values.endDate || values.workedOn}T${values.end}:00-05:00`,
                        }
                      : {}),
                  },
                });
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
