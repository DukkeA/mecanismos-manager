"use client";
import { useState } from "react";
import {
  Plus,
  Pin,
  StickyNote,
  ListTodo,
  CalendarDays,
  Lock,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useOrganizer, useOrganizerCommand } from "./hooks";
import { EntryEditor, type EntryDraft } from "./entry-editor";
import { CalendarView } from "./calendar-view";
import { NotePreview } from "./note-preview";
import { bogotaDate, type OrganizerItem } from "@/domain/organizer";
import type { OrderView } from "@/domain/workshop-view";
import type { Role } from "@/domain/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { DataEmpty } from "@/components/data-empty";
import { RowActions } from "@/components/row-actions";
import { Choice, TablePagination } from "@/components/workshop-controls";
import { FormSheet } from "@/components/form-sheet";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
export function OrganizerWorkspace({
  section,
  role,
  orders,
  openOrder,
}: {
  section: string;
  role: Role;
  orders: OrderView[];
  openOrder: (id: string) => void;
}) {
  const query = useOrganizer(),
    command = useOrganizerCommand();
  const [scope, setScope] = useState("PERSONAL"),
    [q, setQ] = useState(""),
    [status, setStatus] = useState("pending"),
    [page, setPage] = useState(1);
  const [editor, setEditor] = useState<EntryDraft | null>(null),
    [deleting, setDeleting] = useState<OrganizerItem | null>(null);
  const calendar = section === "Calendario",
    notes = section === "Notas",
    kind = notes ? "NOTE" : calendar ? "EVENT" : "TODO";
  const entries = (query.data ?? []).filter(
    (e) =>
      (!q ||
        `${e.title} ${e.body}`
          .toLocaleLowerCase("es")
          .includes(q.toLocaleLowerCase("es"))) &&
      (calendar || e.visibility === scope),
  );
  const rows = entries.filter(
    (e) =>
      e.kind === kind &&
      (notes || status === "all" || e.completed === (status === "done")),
  );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 12)));
  async function update(e: OrganizerItem, patch: Partial<OrganizerItem>) {
    try {
      await command.mutateAsync({
        kind: "save",
        input: { ...e, ...patch, requestId: crypto.randomUUID() },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }
  function actions(e: OrganizerItem) {
    return [
      { label: "Editar", run: () => setEditor(e) },
      ...(notes
        ? [
            {
              label: e.pinned ? "Desfijar" : "Fijar nota",
              run: () => {
                void update(e, { pinned: !e.pinned });
              },
              disabled: command.isPending,
            },
          ]
        : []),
      ...(e.orderId
        ? [{ label: "Abrir orden", run: () => openOrder(e.orderId!) }]
        : []),
      ...(role === "ADMIN" || e.visibility === "PERSONAL"
        ? [{ label: "Eliminar", danger: true, run: () => setDeleting(e) }]
        : []),
    ];
  }
  const create = (date?: string) =>
    setEditor({
      kind,
      visibility: calendar ? "GENERAL" : (scope as "PERSONAL" | "GENERAL"),
      ...(date ? { startsAt: `${date}T08:30:00-05:00` } : {}),
    });
  return (
    <section className="flex flex-col gap-5">
      <div className="operations-heading">
        <p>
          {notes
            ? "Apuntes, referencias y acuerdos de oficina."
            : calendar
              ? "Entregas previstas, eventos y pendientes programados. Hora de Bogotá."
              : "Llamadas, compras y gestiones pendientes de oficina."}
        </p>
        <Button onClick={() => create()}>
          <Plus data-icon="inline-start" />
          {notes ? "Nueva nota" : calendar ? "Nuevo evento" : "Nuevo pendiente"}
        </Button>
      </div>
      {!calendar && (
        <Tabs
          className="workspace-tabs"
          value={scope}
          onValueChange={(value) => {
            setScope(value);
            setPage(1);
          }}
        >
          <TabsList aria-label="Visibilidad">
            <TabsTrigger value="PERSONAL">
              <Lock />
              Personales
            </TabsTrigger>
            <TabsTrigger value="GENERAL">
              <Users />
              Generales
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-60 flex-1 flex-col gap-2 text-sm">
          Buscar
          <Input
            placeholder={
              notes ? "Buscar notas" : "Buscar por título o detalles"
            }
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
        {!notes && !calendar && (
          <label className="flex flex-col gap-2 text-sm">
            Estado
            <Choice
              value={status}
              onChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
              options={[
                { id: "pending", label: "Pendientes" },
                { id: "done", label: "Completados" },
                { id: "all", label: "Todos" },
              ]}
            />
          </label>
        )}
      </div>
      {query.isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : query.isError ? (
        <Alert variant="destructive">
          <AlertTitle>{query.error.message}</AlertTitle>
          <Button variant="outline" onClick={() => query.refetch()}>
            Reintentar
          </Button>
        </Alert>
      ) : calendar ? (
        <CalendarView
          entries={entries}
          orders={orders.filter(
            (o) =>
              !q ||
              `${o.title} ${o.number} ${o.customer}`
                .toLowerCase()
                .includes(q.toLowerCase()),
          )}
          edit={setEditor}
          openOrder={openOrder}
          create={create}
        />
      ) : (
        <>
          {rows.length ? (
            <div
              className={
                notes
                  ? "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
                  : "flex flex-col overflow-hidden rounded-xl border bg-card"
              }
            >
              {rows.slice((currentPage - 1) * 12, currentPage * 12).map((e) =>
                notes ? (
                  <Card key={e.id} className="gap-4">
                    <CardHeader className="flex flex-row items-start justify-between gap-3">
                      <CardTitle>
                        <Button
                          variant="link"
                          onClick={() => setEditor(e)}
                          className="h-auto whitespace-normal text-left"
                        >
                          {e.title}
                        </Button>
                      </CardTitle>
                      <RowActions name={e.title} actions={actions(e)} />
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <NotePreview content={e.richContent} text={e.body} />
                      <div className="flex gap-2">
                        {e.pinned && (
                          <Badge variant="outline">
                            <Pin />
                            Fijada
                          </Badge>
                        )}
                        {e.priority === "HIGH" && (
                          <Badge variant="destructive">Prioridad alta</Badge>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter className="mt-auto flex-col items-start gap-1 text-xs text-muted-foreground">
                      <span>Actualizó {e.updatedBy}</span>
                      <span>
                        {new Date(e.updatedAt).toLocaleString("es-CO", {
                          timeZone: "America/Bogota",
                        })}
                      </span>
                    </CardFooter>
                  </Card>
                ) : (
                  <div
                    key={e.id}
                    className="flex items-start gap-3 border-b p-4 last:border-0"
                  >
                    <Checkbox
                      className="mt-3"
                      checked={e.completed}
                      disabled={command.isPending}
                      aria-label={`Completar ${e.title}`}
                      onCheckedChange={(checked) => {
                        void update(e, { completed: !!checked });
                      }}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <Button
                        variant="link"
                        className="h-auto justify-start whitespace-normal text-left"
                        onClick={() => setEditor(e)}
                      >
                        <span
                          className={e.completed ? "line-through" : undefined}
                        >
                          {e.title}
                        </span>
                      </Button>
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {e.body}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {e.priority === "HIGH" && (
                          <Badge variant="destructive">Prioridad alta</Badge>
                        )}
                        {e.startsAt && (
                          <Badge variant="outline">
                            {e.calendar && <CalendarDays />}
                            {bogotaDate(e.startsAt)}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          Actualizó {e.updatedBy} ·{" "}
                          {new Date(e.updatedAt).toLocaleDateString("es-CO", {
                            timeZone: "America/Bogota",
                          })}
                        </span>
                      </div>
                    </div>
                    <RowActions name={e.title} actions={actions(e)} />
                  </div>
                ),
              )}
            </div>
          ) : (
            <div className="rounded-xl border bg-card">
              <DataEmpty
                icon={notes ? StickyNote : ListTodo}
                title={
                  q
                    ? "Sin resultados"
                    : notes
                      ? "Aún no hay notas"
                      : "No hay pendientes en esta vista"
                }
                description={
                  q
                    ? "Prueba otra búsqueda."
                    : "Usa el botón de arriba para crear el primero."
                }
              />
            </div>
          )}
          <TablePagination
            page={currentPage}
            pageSize={12}
            total={rows.length}
            onPageChange={setPage}
          />
        </>
      )}
      <FormSheet
        open={!!editor}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>
              {editor?.id ? "Editar" : "Crear"}{" "}
              {editor?.kind === "NOTE"
                ? "nota"
                : editor?.kind === "TODO"
                  ? "pendiente"
                  : "evento"}
            </SheetTitle>
            <SheetDescription>
              {editor?.visibility === "PERSONAL"
                ? "Personal · solo visible para ti."
                : "General · administración y oficina."}
            </SheetDescription>
          </SheetHeader>
          {editor && (
            <EntryEditor
              entry={editor}
              orders={orders}
              onSaved={() => setEditor(null)}
            />
          )}
        </SheetContent>
      </FormSheet>
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar {deleting?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              Se quitará de esta vista y del calendario. Se conservará el
              registro de quién lo eliminó.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={command.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={command.isPending}
              onClick={async (e) => {
                e.preventDefault();
                if (!deleting) return;
                try {
                  await command.mutateAsync({
                    kind: "delete",
                    input: {
                      id: deleting.id,
                      version: deleting.version,
                      requestId: crypto.randomUUID(),
                    },
                  });
                  setDeleting(null);
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "No se pudo eliminar.",
                  );
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
