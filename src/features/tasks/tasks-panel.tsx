"use client";
import { TaskActions, TaskDetail } from "./task-detail";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { FormSheet } from "@/components/form-sheet";
import { DataTable } from "@/components/data-table";
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
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { Clock3, GripVertical, LayoutGrid, List, Plus } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useOrders } from "../orders/hooks";
import { useTeam } from "../team/hooks";
import { useTaskMutation, useTasks } from "./hooks";

type Task = OperationsView["tasks"][number];
const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.code)) return;
  const columns = Object.keys(states);
  const current = String(
    context.over?.id ?? context.active?.data.current?.status,
  );
  const next =
    columns.indexOf(current) + (event.code === "ArrowRight" ? 1 : -1);
  const target = context.droppableRects.get(columns[next]);
  if (target) {
    event.preventDefault();
    return { x: target.left + 12, y: target.top + 50 };
  }
};
export function TasksPanel({
  role,
  openOrder,
}: {
  role: Role;
  openOrder: (id: string) => void;
}) {
  const reducedMotion = useReducedMotion();
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
    [active, setActive] = useState<Task | null>(null),
    [optimistic, setOptimistic] = useState<{
      id: string;
      status: string;
    } | null>(null);
  const busy = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );
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
  async function drop({ active, over }: DragEndEvent) {
    setActive(null);
    if (!over || busy.current || !Object.keys(states).includes(String(over.id)))
      return;
    const task = tasks.find((t) => t.id === active.id);
    if (!task || locked(task) || task.status === over.id) return;
    busy.current = true;
    setOptimistic({ id: task.id, status: String(over.id) });
    try {
      await mutation.mutateAsync({
        kind: "task-status",
        input: { taskId: task.id, status: String(over.id) },
      });
      toast.success(
        `Tarea ${states[String(over.id) as keyof typeof states].toLowerCase()}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo mover. La tarea conserva su estado anterior.",
      );
    } finally {
      setOptimistic(null);
      busy.current = false;
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
          mobileRows={filtered.map((t) => (
            <li
              key={t.id}
              className="mobile-task-row"
              data-task-state={t.status}
            >
              <div className="mobile-task-heading">
                <TaskStatusDropdown task={t} locked={locked(t)} />
                {t.orderId && (
                  <Button variant="link" onClick={() => openOrder(t.orderId!)}>
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
          ))}
          empty="No hay tareas con estos filtros."
        >
          {filtered.map((t) => (
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
                  <Button variant="link" onClick={() => openOrder(t.orderId!)}>
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
          ))}
        </DataTable>
      </TabsContent>
      <TabsContent value="kanban">
        <p className="kanban-help">
          Arrastra desde el asa para cambiar de estado. Con teclado: espacio,
          flechas y espacio para soltar.
        </p>
        <DndContext
          id="workshop-tasks"
          sensors={sensors}
          collisionDetection={(args) => {
            const collisions = pointerWithin(args);
            return collisions.length ? collisions : rectIntersection(args);
          }}
          onDragStart={(event) =>
            setActive(tasks.find((t) => t.id === event.active.id) ?? null)
          }
          onDragEnd={drop}
          onDragCancel={() => setActive(null)}
          accessibility={{
            screenReaderInstructions: {
              draggable:
                "Pulsa espacio para levantar la tarea, flechas izquierda o derecha para cambiar de columna, espacio para soltar y Escape para cancelar.",
            },
            announcements: {
              onDragStart: ({ active }) =>
                `Tarea ${tasks.find((t) => t.id === active.id)?.title} seleccionada.`,
              onDragOver: ({ over }) =>
                over
                  ? `Columna ${states[String(over.id) as keyof typeof states]}.`
                  : undefined,
              onDragEnd: ({ over }) =>
                over
                  ? `Soltada en ${states[String(over.id) as keyof typeof states]}. Guardando cambio.`
                  : "Movimiento cancelado.",
              onDragCancel: () => "Movimiento cancelado.",
            },
          }}
        >
          <div className="kanban-board">
            {Object.entries(states).map(([state, label]) => (
              <TaskColumn
                key={state}
                state={state}
                label={label}
                count={filtered.filter((t) => t.status === state).length}
              >
                {filtered
                  .filter((t) => t.status === state)
                  .map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      names={names(t)}
                      order={orders.find((o) => o.id === t.orderId)}
                      disabled={
                        !!t.deletedAt || locked(t) || mutation.isPending
                      }
                      actions={actions(t)}
                      onOpen={() => setSelectedId(t.id)}
                      openOrder={openOrder}
                    />
                  ))}
                {!filtered.some((t) => t.status === state) && (
                  <p className="kanban-empty">Sin tareas</p>
                )}
              </TaskColumn>
            ))}
          </div>
          <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
            {active && (
              <div className="task-drag-preview">
                <TaskBadge status={active.status} />
                <strong>{active.title}</strong>
              </div>
            )}
          </DragOverlay>
        </DndContext>
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
function TaskColumn({
  state,
  label,
  count,
  children,
}: {
  state: string;
  label: string;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: state });
  return (
    <section
      ref={setNodeRef}
      data-task-state={state}
      data-over={isOver}
      className="kanban-column"
      aria-label={label}
    >
      <h3>
        <TaskBadge status={state} />
        <span>{count}</span>
      </h3>
      {children}
    </section>
  );
}
function TaskCard({
  task,
  names,
  order,
  disabled,
  actions,
  onOpen,
  openOrder,
}: {
  task: Task;
  names: string;
  order?: { id: string; number: number; reference: string };
  disabled: boolean;
  actions: ReactNode;
  onOpen: () => void;
  openOrder: (id: string) => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: task.id,
    data: { status: task.status },
    disabled,
  });
  return (
    <article
      ref={setNodeRef}
      className="kanban-task"
      data-task-state={task.status}
      data-dragging={isDragging}
    >
      <div className="kanban-card-heading">
        <Button variant="link" onClick={onOpen}>
          {task.title}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          {...attributes}
          {...listeners}
          disabled={disabled}
          aria-label={`Mover tarea: ${task.title}`}
          className="drag-handle"
        >
          <GripVertical />
        </Button>
      </div>
      <p>{names}</p>
      {order ? (
        <Button variant="link" onClick={() => openOrder(order.id)}>
          OT-{order.number} · {order.reference}
        </Button>
      ) : (
        <small>Tarea general</small>
      )}
      <div className="kanban-card-footer">
        <span>
          <Clock3 aria-hidden="true" />
          {task.dueAt ? dateLabel(task.dueAt) : "Sin fecha límite"}
        </span>
        {actions}
      </div>
    </article>
  );
}
