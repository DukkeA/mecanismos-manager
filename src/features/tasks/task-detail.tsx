"use client";
import { TaskPhotos } from "./task-photos";
import {
  MoreVertical,
  Pencil,
  Trash2,
  RotateCcw,
  Eye,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormSheet, useFormSheet } from "@/components/form-sheet";
import { useState } from "react";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OperationForm } from "@/components/operation-form";
import { dateLabel } from "@/components/workshop-controls";
import { TaskStatusDropdown, states } from "./task-status";
import type { OperationsView } from "@/domain/operations-view";
import type { Role } from "@/domain/permissions";

type Task = OperationsView["tasks"][number];
export function TaskActions({
  task,
  role,
  locked,
  onOpen,
  onEdit,
  onStatus,
  onArchive,
  presentation = "menu",
  showStatus = true,
}: {
  task: Task;
  role: Role;
  locked: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onStatus: () => void;
  onArchive: () => void;
  presentation?: "menu" | "buttons";
  showStatus?: boolean;
}) {
  const draft = useFormSheet();
  if (presentation === "buttons")
    return (
      <div className="detail-actions">
        {role !== "MECHANIC" && !task.deletedAt && (
          <Button
            variant="outline"
            disabled={locked}
            onClick={() => draft.proceed(onEdit)}
          >
            <Pencil />
            Editar
          </Button>
        )}
        {role === "ADMIN" && (
          <Button
            variant="outline"
            disabled={locked}
            onClick={() => draft.proceed(onArchive)}
          >
            {task.deletedAt ? <RotateCcw /> : <Trash2 />}
            {task.deletedAt ? "Restaurar" : "Eliminar"}
          </Button>
        )}
      </div>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Acciones de ${task.title}`}
        >
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onOpen}>
            <Eye />
            Ver detalle
          </DropdownMenuItem>
          {!task.deletedAt && (
            <>
              {showStatus && (
                <DropdownMenuItem
                  disabled={locked}
                  onSelect={() => draft.proceed(onStatus)}
                >
                  <ListChecks />
                  Cambiar estado
                </DropdownMenuItem>
              )}
              {role !== "MECHANIC" && (
                <DropdownMenuItem
                  disabled={locked}
                  onSelect={() => draft.proceed(onEdit)}
                >
                  <Pencil />
                  Editar tarea
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuGroup>
        {role === "ADMIN" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={locked}
                onSelect={() => draft.proceed(onArchive)}
              >
                {task.deletedAt ? <RotateCcw /> : <Trash2 />}
                {task.deletedAt ? "Restaurar tarea" : "Eliminar tarea"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
const historyLabels: Record<string, string> = {
  TASK_PHOTO_ADDED: "Foto adjunta",
  TASK_ASSIGNED: "Tarea creada y asignada",
  TASK_EDITED: "Datos de la tarea actualizados",
  TASK_STATUS_CHANGED: "Estado actualizado",
  TASK_NOTE_ADDED: "Observación registrada",
  TASK_DELETED: "Tarea eliminada",
  TASK_RESTORED: "Tarea restaurada",
};
const timestamp = (value: string) =>
  new Date(value).toLocaleString("es-CO", { timeZone: "America/Bogota" });
function DetailTabs({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState("details");
  const draft = useFormSheet();
  return (
    <Tabs
      value={tab}
      onValueChange={(next) => draft.proceed(() => setTab(next))}
      className="detail-tabs"
    >
      {children}
    </Tabs>
  );
}
export function TaskDetail({
  task,
  names,
  orderLabel,
  locked,
  onClose,
  actions,
  onNote,
}: {
  task: Task | undefined;
  names: string;
  orderLabel: string;
  locked: boolean;
  onClose: () => void;
  actions: React.ReactNode;
  onNote: (input: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <FormSheet
      open={!!task}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="dossier-sheet">
        <SheetHeader>
          <SheetTitle>{task?.title ?? "Detalle de tarea"}</SheetTitle>
          <SheetDescription>{orderLabel}</SheetDescription>
        </SheetHeader>
        {task && (
          <div className="sheet-body">
            <div className="detail-actions">
              <TaskStatusDropdown task={task} locked={locked} />
              {task.deletedAt && <span>Eliminada</span>}
              {actions}
            </div>
            <DetailTabs key={task.id}>
              <TabsList aria-label="Ficha de tarea">
                <TabsTrigger value="details">Detalle</TabsTrigger>
                <TabsTrigger value="notes">
                  Observaciones ({task.notes?.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="photos">
                  Fotos ({task.photos?.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="history">Historial</TabsTrigger>
              </TabsList>
              <TabsContent value="details">
                <dl className="detail-facts">
                  <div>
                    <dt>Responsables</dt>
                    <dd>{names || "Sin responsables"}</dd>
                  </div>
                  <div>
                    <dt>Fecha límite</dt>
                    <dd>{dateLabel(task.dueAt)}</dd>
                  </div>
                  <div>
                    <dt>Creación</dt>
                    <dd>{dateLabel(task.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Tiempo registrado</dt>
                    <dd>
                      {(task.timeEntries ?? []).reduce(
                        (n, e) => n + e.minutes,
                        0,
                      )}{" "}
                      minutos
                    </dd>
                  </div>
                  <div>
                    <dt>Tiempo previsto</dt>
                    <dd>
                      {task.plannedMinutes
                        ? `${task.plannedMinutes} minutos`
                        : "Sin estimar"}
                    </dd>
                  </div>
                  {task.plannedMinutes && (
                    <div>
                      <dt>Diferencia con lo previsto</dt>
                      <dd>
                        {(task.timeEntries ?? []).reduce(
                          (n, e) => n + e.minutes,
                          0,
                        ) - task.plannedMinutes}{" "}
                        minutos
                      </dd>
                    </div>
                  )}
                </dl>
                <section className="detail-section">
                  <h3>Trabajo por realizar</h3>
                  <p className="whitespace-pre-wrap">
                    {task.description || "Sin instrucciones adicionales."}
                  </p>
                </section>
                {!!task.timeEntries?.length && (
                  <section className="detail-section">
                    <h3>Registro de tiempo</h3>
                    <ul className="detail-list">
                      {task.timeEntries.map((e) => (
                        <li key={e.id}>
                          <strong>
                            {e.minutes} minutos · {e.author}
                          </strong>
                          <p>{e.note}</p>
                          <small>{dateLabel(e.workedOn)}</small>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </TabsContent>
              <TabsContent value="notes">
                <ul className="detail-list">
                  {task.notes?.map((n) => (
                    <li key={n.id}>
                      <small>
                        {n.author} · {timestamp(n.createdAt)}
                      </small>
                      <p>{n.body}</p>
                    </li>
                  ))}
                </ul>
                {!task.notes?.length && (
                  <p>No hay observaciones registradas.</p>
                )}
                {!locked && !task.deletedAt && (
                  <OperationForm
                    key={task.notes?.[0]?.id ?? task.id}
                    dialog={{
                      kind: "task-note",
                      title: "Añadir observación",
                      submitLabel: "Guardar observación",
                      extra: { taskId: task.id },
                      fields: [
                        { key: "body", label: "Observación", type: "textarea" },
                      ],
                    }}
                    submit={onNote}
                  />
                )}
              </TabsContent>
              <TabsContent value="photos">
                <TaskPhotos task={task} locked={locked} />
              </TabsContent>
              <TabsContent value="history">
                <ul className="detail-list">
                  {task.history?.map((h) => (
                    <li key={h.id}>
                      <strong>
                        {historyLabels[h.action] ?? "Cambio registrado"}
                      </strong>
                      <p>
                        {h.details.from && h.details.to
                          ? `${states[String(h.details.from) as keyof typeof states] ?? h.details.from} → ${states[String(h.details.to) as keyof typeof states] ?? h.details.to}`
                          : ""}
                        {typeof h.details.reason === "string"
                          ? h.details.reason
                          : ""}
                      </p>
                      <small>
                        {h.author} · {timestamp(h.createdAt)}
                      </small>
                      {h.action === "TASK_EDITED" && (
                        <p>
                          {String(
                            (h.details.after as Record<string, unknown>)
                              ?.title ?? "",
                          )}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                {!task.history?.length && (
                  <p>No hay cambios registrados desde la creación.</p>
                )}
              </TabsContent>
            </DetailTabs>
          </div>
        )}
      </SheetContent>
    </FormSheet>
  );
}
