"use client";
import { ClipboardList as EmptyClipboardList } from "lucide-react";
import { DataEmpty } from "@/components/data-empty";
import { TaskActions, TaskDetail } from "./task-detail";
import { FormSheet } from "@/components/form-sheet";
import { DataTable } from "@/components/data-table";
import {
  WorkshopKanban,
  type KanbanColumnDefinition,
} from "@/components/workshop-kanban";
import { OperationForm, type Dialog } from "@/components/operation-form";
import { TaskBadge, TaskStatusDropdown, states } from "./task-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FilterBar,
  ClearFilters,
  Choice,
  DateRangePicker,
  dateLabel,
  inDates,
  matches,
  useQueryState,
} from "@/components/workshop-controls";
import type { OperationsView } from "@/domain/operations-view";
import type { Role } from "@/domain/permissions";
import { Clock3, LayoutGrid, List, Plus, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useOrders } from "../orders/hooks";
import { useTeam } from "../team/hooks";
import { useTaskMutation, useTasks } from "./hooks";
import { useOrderCommand } from "../orders/hooks";
import { useWorkshopScope } from "../workshop/query";
import { todayInBogota } from "../cash/summary";

type Task = OperationsView["tasks"][number];
const taskColumns = Object.entries(states).map(([id, label]) => ({
  id,
  label,
})) as KanbanColumnDefinition[];
export function TasksPanel({
  role,
  openOrder,
}: {
  role: Role;
  openOrder: (id: string) => void;
}) {
  const timeMutation = useOrderCommand();
  const { actorId } = useWorkshopScope();
  const [archiveView, setArchiveView] = useQueryState("archive", "active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: tasks = [] } = useTasks(
      role === "ADMIN" && archiveView === "deleted",
    ),
    { data: orders = [] } = useOrders(),
    { data: members = [] } = useTeam();
  const mutation = useTaskMutation();
  const [q, setQ] = useQueryState("q"),
    [status, setStatus] = useQueryState("status", "ALL"),
    [responsible, setResponsible] = useQueryState("responsible", "ALL"),
    [from, setFrom] = useQueryState("from"),
    [to, setTo] = useQueryState("to"),
    [layout, setLayout] = useQueryState("layout", "list");
  const [dialog, setDialog] = useState<Dialog | null>(null),
    [optimistic, setOptimistic] = useState<{
      id: string;
      status: string;
    } | null>(null);
  const names = (t: Task) =>
    t.members
      .map((id) => members.find((m) => m.id === id)?.name ?? "Sin nombre")
      .join(", ");
  const locked = (t: Task) =>
    orders.some(
      (o) => o.id === t.orderId && ["CLOSED", "CANCELLED"].includes(o.status),
    );
  const filtered = tasks
    .filter((t) => {
      const o = orders.find((o) => o.id === t.orderId);
      return (
        matches(
          `${t.title} ${names(t)} ${o ? `OT-${o.number} OT-${String(o.number).padStart(4, "0")} ${o.reference} ${o.title} ${o.customer}` : "General"}`,
          q,
        ) &&
        (status === "ALL" || t.status === status) &&
        (responsible === "ALL" || t.members.includes(responsible)) &&
        inDates(t.createdAt, from, to)
      );
    })
    .map((t) =>
      optimistic?.id === t.id ? { ...t, status: optimistic.status } : t,
    );
  const changeStatus = (t: Task) =>
    setDialog({
      kind: "task-status",
      title: "Cambiar estado de tarea",
      submitLabel: "Actualizar estado",
      extra: { taskId: t.id, status: t.status },
      fields: [
        {
          key: "status",
          label: "Estado",
          type: "select",
          options: Object.entries(states).map(([id, label]) => ({ id, label })),
        },
      ],
    });
  const assign = () =>
    setDialog({
      kind: "task",
      title: "Asignar tarea",
      submitLabel: "Asignar tarea",
      fields: [
        { key: "title", label: "Trabajo por realizar" },
        {
          key: "description",
          label: "Instrucciones",
          type: "textarea",
          optional: true,
        },
        {
          key: "orderId",
          label: "Orden",
          type: "select",
          optional: true,
          options: orders
            .filter((o) => !["CLOSED", "CANCELLED"].includes(o.status))
            .map((o) => ({ id: o.id, label: `OT-${o.number} · ${o.title}` })),
        },
        { key: "dueAt", label: "Fecha límite", type: "date", optional: true },
        {
          key: "plannedMinutes",
          label: "Tiempo previsto (minutos)",
          type: "quantity",
          optional: true,
          hint: "Tiempo total estimado del trabajo, sumando a sus responsables.",
        },
        {
          key: "memberIds",
          label: "Responsables",
          type: "members",
          options: members
            .filter((m) => m.active)
            .map((m) => ({ id: m.id, label: m.name })),
        },
      ],
    });
  const edit = (t: Task) => {
    setSelectedId(null);
    setDialog({
      kind: "task-edit",
      title: "Editar tarea",
      extra: {
        taskId: t.id,
        version: t.version ?? 0,
        title: t.title,
        description: t.description ?? "",
        plannedMinutes: t.plannedMinutes ?? undefined,
        dueAt: t.dueAt?.slice(0, 10),
        memberIds: t.members,
      },
      fields: [
        { key: "title", label: "Trabajo por realizar" },
        {
          key: "description",
          label: "Instrucciones",
          type: "textarea",
          optional: true,
        },
        { key: "dueAt", label: "Fecha límite", type: "date", optional: true },
        {
          key: "plannedMinutes",
          label: "Tiempo previsto (minutos)",
          type: "quantity",
          optional: true,
          hint: "Tiempo total estimado del trabajo, sumando a sus responsables.",
        },
        {
          key: "memberIds",
          label: "Responsables",
          type: "members",
          options: members
            .filter((m) => m.active)
            .map((m) => ({ id: m.id, label: m.name })),
        },
      ],
    });
  };
  const archive = (t: Task) => {
    setSelectedId(null);
    setDialog({
      kind: "task-archive",
      title: t.deletedAt ? "Restaurar tarea" : "Eliminar tarea",
      description:
        "Se conserva el historial. Las tareas eliminadas se pueden restaurar.",
      submitLabel: t.deletedAt ? "Restaurar tarea" : "Eliminar tarea",
      extra: { taskId: t.id, restore: !!t.deletedAt },
      fields: [{ key: "reason", label: "Motivo", type: "textarea" }],
    });
  };
  const actions = (t: Task, inline = false) => (
    <TaskActions
      task={t}
      role={role}
      presentation={inline ? "buttons" : "menu"}
      showStatus={layout === "kanban"}
      locked={locked(t) || mutation.isPending}
      onOpen={() => setSelectedId(t.id)}
      onEdit={() => edit(t)}
      onStatus={() => {
        setSelectedId(null);
        changeStatus(t);
      }}
      onArchive={() => archive(t)}
    />
  );
  const selected = tasks.find((t) => t.id === selectedId);
  async function moveTask(task: Task, status: string) {
    setOptimistic({ id: task.id, status });
    try {
      await mutation.mutateAsync({
        kind: "task-status",
        input: { taskId: task.id, status },
      });
      toast.success(
        `Tarea ${states[status as keyof typeof states].toLowerCase()}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo mover. La tarea conserva su estado anterior.",
      );
    } finally {
      setOptimistic(null);
    }
  }
  return (
    <Tabs
      value={layout === "kanban" ? "kanban" : "list"}
      onValueChange={setLayout}
      className="tasks-feature"
    >
      <div className="task-view-header">
        <div>
          <p>{filtered.length} tareas con estos filtros</p>
        </div>
        <div className="task-view-actions">
          {role === "ADMIN" && (
            <Choice
              label="Tareas activas o eliminadas"
              value={archiveView}
              onChange={setArchiveView}
              options={[
                { id: "active", label: "Activas" },
                { id: "deleted", label: "Eliminadas" },
              ]}
            />
          )}
          <TabsList aria-label="Presentación de tareas">
            <TabsTrigger value="list">
              <List />
              Lista
            </TabsTrigger>
            <TabsTrigger value="kanban">
              <LayoutGrid />
              Kanban
            </TabsTrigger>
          </TabsList>
          {role !== "MECHANIC" && (
            <Button onClick={assign}>
              <Plus data-icon="inline-start" />
              Asignar tarea
            </Button>
          )}
        </div>
      </div>
      <FilterBar>
        <label className="search-filter">
          Buscar
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tarea, orden, placa o responsable"
          />
        </label>
        <label>
          Estado
          <Choice
            value={status}
            onChange={setStatus}
            options={[
              { id: "ALL", label: "Todos" },
              ...Object.entries(states).map(([id, label]) => ({ id, label })),
            ]}
          />
        </label>
        <label>
          Responsable
          <Choice
            value={responsible}
            onChange={setResponsible}
            options={[
              { id: "ALL", label: "Todos" },
              ...members
                .filter((m) => m.active)
                .map((m) => ({ id: m.id, label: m.name })),
            ]}
          />
        </label>
        <label className="range-filter">
          Fecha de creación
          <DateRangePicker
            from={from}
            to={to}
            onChange={(a, b) => {
              setFrom(a);
              setTo(b);
            }}
          />
        </label>
        <ClearFilters
          active={
            !!(q || from || to || status !== "ALL" || responsible !== "ALL")
          }
          onClear={() => {
            setQ("");
            setStatus("ALL");
            setResponsible("ALL");
            setFrom("");
            setTo("");
          }}
        />
      </FilterBar>
      <TabsContent value="list">
        <DataTable
          tableKey="tasks"
          headers={[
            "Tarea",
            "Orden",
            "Responsables",
            "Estado",
            "Fecha límite",
            "Acciones",
          ]}
          empty="No hay tareas con estos filtros."
          renderRow={(row) => {
            const t = row as OperationsView["tasks"][number];
            return (
              <TableRow key={t.id} data-task-state={t.status}>
                <TableCell>
                  <Button variant="link" onClick={() => setSelectedId(t.id)}>
                    {t.title}
                  </Button>
                  <small className="cell-detail">
                    {t.createdAt ? `Creada ${dateLabel(t.createdAt)}` : ""}
                  </small>
                </TableCell>
                <TableCell>
                  {t.orderId ? (
                    <Button
                      variant="link"
                      onClick={() => openOrder(t.orderId!)}
                    >
                      OT-{orders.find((o) => o.id === t.orderId)?.number}
                    </Button>
                  ) : (
                    "General"
                  )}
                </TableCell>
                <TableCell>{names(t)}</TableCell>
                <TableCell>
                  <TaskStatusDropdown task={t} locked={locked(t)} />
                </TableCell>
                <TableCell>{dateLabel(t.dueAt)}</TableCell>
                <TableCell>{actions(t)}</TableCell>
              </TableRow>
            );
          }}
          renderMobileRow={(row) => {
            const t = row as OperationsView["tasks"][number];
            return (
              <li
                key={t.id}
                className="mobile-task-row"
                data-task-state={t.status}
              >
                <div className="mobile-task-heading">
                  <TaskStatusDropdown task={t} locked={locked(t)} />
                  {t.orderId && (
                    <Button
                      variant="link"
                      onClick={() => openOrder(t.orderId!)}
                    >
                      OT-{orders.find((o) => o.id === t.orderId)?.number}
                    </Button>
                  )}
                </div>
                <Button variant="link" onClick={() => setSelectedId(t.id)}>
                  {t.title}
                </Button>
                <p>{names(t) || "Sin responsables"}</p>
                <div className="mobile-task-footer">
                  <span>
                    {t.dueAt
                      ? `Límite: ${dateLabel(t.dueAt)}`
                      : "Sin fecha límite"}
                  </span>
                  {actions(t)}
                </div>
                {locked(t) && <small>La orden está cerrada o cancelada.</small>}
              </li>
            );
          }}
          fallbackRows={filtered}
        ></DataTable>
      </TabsContent>
      <TabsContent value="kanban">
        <WorkshopKanban
          id="workshop-tasks"
          ariaLabel="Tareas por estado"
          columns={taskColumns}
          items={filtered}
          getItemId={(task) => task.id}
          getItemLabel={(task) => `Tarea ${task.title}`}
          getItemState={(task) => task.status}
          canDrag={(task) => !task.deletedAt && !locked(task)}
          onMove={moveTask}
          disabled={mutation.isPending}
          renderColumnTitle={(column, count) => (
            <>
              <TaskBadge status={column.id} />
              <span className="workshop-kanban-count">{count}</span>
            </>
          )}
          renderCard={(task, { dragHandle }) => (
            <TaskKanbanCard
              task={task}
              names={names(task)}
              order={orders.find((order) => order.id === task.orderId)}
              dragHandle={dragHandle}
              actions={actions(task)}
              onOpen={() => setSelectedId(task.id)}
              openOrder={openOrder}
            />
          )}
          renderOverlay={(task) => (
            <TaskKanbanCard
              task={task}
              names={names(task)}
              order={orders.find((order) => order.id === task.orderId)}
              preview
            />
          )}
          renderEmpty={() => (
            <DataEmpty
              icon={EmptyClipboardList}
              compact
              title="Sin tareas"
              description="Las tareas en este estado aparecerán aquí."
            />
          )}
        />
      </TabsContent>
      <TaskDetail
        task={selected}
        names={selected ? names(selected) : ""}
        orderLabel={
          selected?.orderId
            ? `OT-${orders.find((o) => o.id === selected.orderId)?.number}`
            : "Tarea general"
        }
        locked={selected ? locked(selected) : true}
        onClose={() => setSelectedId(null)}
        actions={selected ? actions(selected, true) : null}
        timeForm={
          selected &&
          !selected.deletedAt &&
          (!locked(selected) || role === "ADMIN") ? (
            <OperationForm
              key={`${selected.id}-${selected.timeEntries?.length ?? 0}`}
              dialog={{
                kind: "time",
                title: "Tiempo dedicado",
                submitLabel: "Guardar tiempo",
                extra: {
                  taskId: selected.id,
                  workedOn: todayInBogota(),
                  memberId: role === "MECHANIC" ? actorId : selected.members[0],
                },
                fields: [
                  ...(role === "MECHANIC"
                    ? []
                    : [
                        {
                          key: "memberId",
                          label: "Quién hizo el trabajo",
                          type: "select" as const,
                          options: members
                            .filter((m) => selected.members.includes(m.id))
                            .map((m) => ({ id: m.id, label: m.name })),
                        },
                      ]),
                  {
                    key: "minutes",
                    label: "Minutos trabajados",
                    type: "quantity",
                    hint: "Ejemplo: una hora y media son 90 minutos. Registra solo el tiempo que falta.",
                  },
                  { key: "workedOn", label: "Día trabajado", type: "date" },
                  { key: "note", label: "Qué se hizo", type: "textarea" },
                ],
              }}
              submit={async ({ requestId, ...input }) => {
                await timeMutation.mutateAsync({
                  kind: "time",
                  input: {
                    ...input,
                    minutes: Number(input.minutes),
                    idempotencyKey: requestId,
                  },
                });
                toast.success(
                  "Tiempo guardado. Los costos del trabajo se actualizaron.",
                );
              }}
            />
          ) : null
        }
        onNote={async (input) => {
          await mutation.mutateAsync({ kind: "task-note", input });
          toast.success("Observación guardada.");
        }}
      />
      <FormSheet
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>{dialog?.title}</SheetTitle>
            <SheetDescription>
              {dialog?.description ?? "Registra el trabajo y sus responsables."}
            </SheetDescription>
          </SheetHeader>
          {dialog && (
            <OperationForm
              key={dialog.title}
              dialog={dialog}
              submit={async (input) => {
                await mutation.mutateAsync({ kind: dialog.kind, input });
                setDialog(null);
                toast.success("Tarea guardada.");
              }}
            />
          )}
        </SheetContent>
      </FormSheet>
    </Tabs>
  );
}
function TaskKanbanCard({
  task,
  names,
  order,
  dragHandle,
  actions,
  onOpen,
  openOrder,
  preview = false,
}: {
  task: Task;
  names: string;
  order?: { id: string; number: number; reference: string };
  dragHandle?: ReactNode;
  actions?: ReactNode;
  onOpen?: () => void;
  openOrder?: (id: string) => void;
  preview?: boolean;
}) {
  return (
    <article className="workshop-kanban-card task-kanban-card">
      <div className="workshop-kanban-card-heading">
        <div className="min-w-0">
          <span className="workshop-kanban-eyebrow">
            {order ? `OT-${String(order.number).padStart(4, "0")}` : "General"}
          </span>
          {preview || !onOpen ? (
            <strong>{task.title}</strong>
          ) : (
            <Button variant="link" onClick={onOpen}>
              {task.title}
            </Button>
          )}
        </div>
        {dragHandle}
      </div>
      <p className="workshop-kanban-assignee">
        <UserRound aria-hidden="true" />
        {names || "Sin responsables"}
      </p>
      {order && !preview && openOrder ? (
        <Button variant="link" onClick={() => openOrder(order.id)}>
          OT-{order.number} · {order.reference}
        </Button>
      ) : (
        <small>{order ? order.reference : "Tarea general"}</small>
      )}
      <div className="workshop-kanban-card-footer task-kanban-footer">
        <span>
          <Clock3 aria-hidden="true" />
          {task.dueAt ? dateLabel(task.dueAt) : "Sin fecha límite"}
        </span>
        {actions}
      </div>
    </article>
  );
}
