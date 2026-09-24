"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
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
import { GripVertical } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Button } from "@/components/ui/button";

export type KanbanColumnDefinition<State extends string = string> = {
  id: State;
  label: string;
};

type CardContext = {
  dragHandle: ReactNode;
  dragging: boolean;
};

type WorkshopKanbanProps<Item, State extends string> = {
  id: string;
  ariaLabel: string;
  columns: readonly KanbanColumnDefinition<State>[];
  items: readonly Item[];
  getItemId: (item: Item) => string;
  getItemLabel: (item: Item) => string;
  getItemState: (item: Item) => State;
  canDrag: (item: Item) => boolean;
  canMove?: (item: Item, state: State) => boolean;
  onMove: (item: Item, state: State) => void | Promise<void>;
  renderCard: (item: Item, context: CardContext) => ReactNode;
  renderOverlay: (item: Item) => ReactNode;
  renderColumnTitle?: (
    column: KanbanColumnDefinition<State>,
    count: number,
  ) => ReactNode;
  renderEmpty?: (column: KanbanColumnDefinition<State>) => ReactNode;
  disabled?: boolean;
  help?: string;
};

export function WorkshopKanban<Item, State extends string>({
  id,
  ariaLabel,
  columns,
  items,
  getItemId,
  getItemLabel,
  getItemState,
  canDrag,
  canMove = () => true,
  onMove,
  renderCard,
  renderOverlay,
  renderColumnTitle,
  renderEmpty,
  disabled = false,
  help = "Arrastra una tarjeta para cambiarla de estado.",
}: WorkshopKanbanProps<Item, State>) {
  const reducedMotion = useReducedMotion();
  const [activeId, setActiveId] = useState<string | null>(null);
  const busy = useRef(false);
  const columnIds = useMemo(
    () => columns.map((column) => column.id),
    [columns],
  );
  const keyboardCoordinates = useCallback<KeyboardCoordinateGetter>(
    (event, { context }) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.code)) return;
      const current = String(
        context.over?.id ?? context.active?.data.current?.columnId,
      ) as State;
      const index = columnIds.indexOf(current);
      const step = event.code === "ArrowRight" ? 1 : -1;
      const activeItem = items.find(
        (item) => getItemId(item) === context.active?.id,
      );
      for (let next = index + step; columnIds[next]; next += step) {
        const nextState = columnIds[next];
        if (
          activeItem &&
          getItemState(activeItem) !== nextState &&
          !canMove(activeItem, nextState)
        )
          continue;
        const target = context.droppableRects.get(nextState);
        if (!target) continue;
        event.preventDefault();
        return {
          x: target.left + target.width / 2,
          y: target.top + Math.min(72, target.height / 2),
        };
      }
    },
    [canMove, columnIds, getItemId, getItemState, items],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );
  const activeItem = activeId
    ? items.find((item) => getItemId(item) === activeId)
    : undefined;

  async function finishDrag({ active, over }: DragEndEvent) {
    const item = items.find((candidate) => getItemId(candidate) === active.id);
    const next = String(over?.id ?? "") as State;
    setActiveId(null);
    if (
      !item ||
      !over ||
      busy.current ||
      !columnIds.includes(next) ||
      getItemState(item) === next ||
      !canMove(item, next)
    )
      return;
    busy.current = true;
    try {
      await onMove(item, next);
    } finally {
      busy.current = false;
    }
  }

  return (
    <div className="workshop-kanban-wrap">
      <p className="workshop-kanban-help">
        <GripVertical aria-hidden="true" />
        {help}
      </p>
      <DndContext
        id={id}
        sensors={sensors}
        collisionDetection={(args) => {
          const collisions = pointerWithin(args);
          return collisions.length ? collisions : rectIntersection(args);
        }}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        autoScroll={{
          acceleration: 10,
          threshold: { x: 0.15, y: 0.15 },
        }}
        onDragStart={({ active }) => setActiveId(String(active.id))}
        onDragEnd={finishDrag}
        onDragCancel={() => setActiveId(null)}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "Pulsa espacio para levantar la tarjeta, usa las flechas izquierda y derecha para cambiar de columna, espacio para soltar y Escape para cancelar.",
          },
          announcements: {
            onDragStart: ({ active }) => {
              const item = items.find(
                (candidate) => getItemId(candidate) === active.id,
              );
              return item
                ? `${getItemLabel(item)} seleccionada para mover.`
                : "Tarjeta seleccionada para mover.";
            },
            onDragOver: ({ over }) => {
              const column = columns.find((candidate) => candidate.id === over?.id);
              return column ? `Destino ${column.label}.` : undefined;
            },
            onDragEnd: ({ active, over }) => {
              const item = items.find(
                (candidate) => getItemId(candidate) === active.id,
              );
              const column = columns.find((candidate) => candidate.id === over?.id);
              return item &&
                column &&
                getItemState(item) !== column.id &&
                canMove(item, column.id)
                ? `${getItemLabel(item)} movida a ${column.label}.`
                : "Movimiento cancelado.";
            },
            onDragCancel: () => "Movimiento cancelado.",
          },
        }}
      >
        <div
          className="workshop-kanban"
          role="region"
          aria-label={ariaLabel}
          data-dragging={!!activeItem}
        >
          {columns.map((column) => {
            const columnItems = items.filter(
              (item) => getItemState(item) === column.id,
            );
            const targetDisabled = !!activeItem &&
              getItemState(activeItem) !== column.id &&
              !canMove(activeItem, column.id);
            return (
              <KanbanColumn
                key={column.id}
                column={column}
                count={columnItems.length}
                disabled={disabled || targetDisabled}
                renderTitle={renderColumnTitle}
              >
                {columnItems.map((item) => (
                  <KanbanItem
                    key={getItemId(item)}
                    id={getItemId(item)}
                    label={getItemLabel(item)}
                    columnId={column.id}
                    disabled={disabled || !canDrag(item)}
                    render={(context) => renderCard(item, context)}
                  />
                ))}
                {!columnItems.length && renderEmpty?.(column)}
              </KanbanColumn>
            );
          })}
        </div>
        <DragOverlay
          zIndex={60}
          dropAnimation={
            reducedMotion
              ? null
              : {
                  duration: 180,
                  easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
                }
          }
        >
          {activeItem ? (
            <div className="workshop-kanban-overlay">
              {renderOverlay(activeItem)}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function KanbanColumn<State extends string>({
  column,
  count,
  disabled,
  renderTitle,
  children,
}: {
  column: KanbanColumnDefinition<State>;
  count: number;
  disabled: boolean;
  renderTitle?: (
    column: KanbanColumnDefinition<State>,
    count: number,
  ) => ReactNode;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    disabled,
  });
  return (
    <section
      ref={setNodeRef}
      className="workshop-kanban-lane"
      aria-label={column.label}
      data-kanban-state={column.id}
      data-over={isOver}
      data-drop-disabled={disabled}
    >
      <header className="workshop-kanban-lane-header">
        {renderTitle ? (
          renderTitle(column, count)
        ) : (
          <>
            <h3>{column.label}</h3>
            <span className="workshop-kanban-count">{count}</span>
          </>
        )}
      </header>
      <div className="workshop-kanban-lane-content">{children}</div>
    </section>
  );
}

function KanbanItem({
  id,
  label,
  columnId,
  disabled,
  render,
}: {
  id: string;
  label: string;
  columnId: string;
  disabled: boolean;
  render: (context: CardContext) => ReactNode;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id,
    data: { columnId },
    disabled,
  });
  const dragHandle = disabled ? null : (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      {...attributes}
      onPointerDown={(event) => {
        event.stopPropagation();
        listeners?.onPointerDown?.(event);
      }}
      onKeyDown={(event) => listeners?.onKeyDown?.(event)}
      aria-label={`Mover ${label}`}
      className="workshop-kanban-drag-handle"
    >
      <GripVertical />
    </Button>
  );
  return (
    <div
      ref={setNodeRef}
      className="workshop-kanban-item"
      data-dragging={isDragging}
      data-disabled={disabled}
      onPointerDown={
        disabled
          ? undefined
          : (event) => {
              if (
                (event.target as HTMLElement).closest(
                  "button, a, input, select, textarea",
                )
              )
                return;
              listeners?.onPointerDown?.(event);
            }
      }
    >
      {render({ dragHandle, dragging: isDragging })}
    </div>
  );
}
