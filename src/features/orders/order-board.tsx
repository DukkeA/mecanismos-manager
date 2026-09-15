"use client";
import { useState } from "react";
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { GripVertical, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { orderTransitions } from "@/domain/order-lifecycle";
import { statusLabels, type OrderView } from "@/domain/workshop-view";
import { useOrderTransition } from "./hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { DataEmpty } from "@/components/data-empty";
import { dateLabel } from "@/components/workshop-controls";
import { FormSheet } from "@/components/form-sheet";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { OperationForm } from "@/components/operation-form";

function OrderCard({
  order,
  open,
  editable,
}: {
  order: OrderView;
  open: () => void;
  editable: boolean;
}) {
  const drag = useDraggable({
    id: order.id,
    disabled: !editable || !orderTransitions[order.status]?.length,
  });
  return (
    <Card
      ref={drag.setNodeRef}
      className="gap-3"
      style={{ opacity: drag.isDragging ? 0.45 : 1 }}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <CardTitle>
          <Button variant="link" onClick={open}>
            OT-{order.number}
          </Button>
        </CardTitle>
        {editable && !!orderTransitions[order.status]?.length && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Mover orden ${order.number}`}
            {...drag.listeners}
            {...drag.attributes}
            className="touch-none"
          >
            <GripVertical />
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <strong>{order.title}</strong>
        <span className="text-sm text-muted-foreground">
          {order.customer} · {order.reference}
        </span>
        <Badge variant="secondary" data-status={order.status}>
          {statusLabels[order.status]}
        </Badge>
        <p className="text-sm">{order.nextStep}</p>
      </CardContent>
      <CardFooter className="mt-auto flex-col items-start gap-1 text-sm text-muted-foreground">
        <span>{order.responsible}</span>
        <span>Entrega: {dateLabel(order.dueAt)}</span>
        <span>
          {order.tasks.reduce((sum, t) => sum + t.minutes, 0)} min registrados
        </span>
      </CardFooter>
    </Card>
  );
}
function Column({
  status,
  orders,
  openOrder,
  editable,
}: {
  status: string;
  orders: OrderView[];
  openOrder: (id: string) => void;
  editable: boolean;
}) {
  const drop = useDroppable({ id: status, disabled: !editable });
  return (
    <section
      ref={drop.setNodeRef}
      aria-label={statusLabels[status]}
      className="flex min-w-72 flex-1 flex-col gap-3 rounded-xl bg-muted/50 p-3"
      style={{ outline: drop.isOver ? "2px solid var(--primary)" : undefined }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{statusLabels[status]}</h3>
        <Badge variant="outline">{orders.length}</Badge>
      </div>
      {orders.map((o) => (
        <OrderCard
          key={o.id}
          order={o}
          open={() => openOrder(o.id)}
          editable={editable}
        />
      ))}
      {!orders.length && (
        <DataEmpty
          compact
          icon={ClipboardList}
          title="Sin órdenes"
          description="Las órdenes en este estado aparecerán aquí."
        />
      )}
    </section>
  );
}
export function OrderBoard({
  orders,
  openOrder,
  editable,
}: {
  orders: OrderView[];
  openOrder: (id: string) => void;
  editable: boolean;
}) {
  const command = useOrderTransition();
  const [move, setMove] = useState<{ order: OrderView; status: string } | null>(
    null,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );
  return (
    <>
      <DndContext
        sensors={sensors}
        onDragEnd={({ active, over }) => {
          const order = orders.find((o) => o.id === active.id),
            status = String(over?.id ?? "");
          if (!order || !over || order.status === status) return;
          if (!orderTransitions[order.status]?.includes(status)) {
            toast.error(
              "Ese cambio de estado no está permitido. Abre la orden para ver el siguiente paso.",
            );
            return;
          }
          setMove({ order, status });
        }}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Object.keys(statusLabels).map((status) => (
            <Column
              key={status}
              status={status}
              orders={orders.filter((o) => o.status === status)}
              openOrder={openOrder}
              editable={editable}
            />
          ))}
        </div>
      </DndContext>
      <FormSheet
        open={!!move}
        onOpenChange={(open) => {
          if (!open) setMove(null);
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Cambiar estado de OT-{move?.order.number}</SheetTitle>
            <SheetDescription>
              {move &&
                `${statusLabels[move.order.status]} → ${statusLabels[move.status]}`}
            </SheetDescription>
          </SheetHeader>
          {move && (
            <OperationForm
              key={`${move.order.id}-${move.status}`}
              dialog={{
                kind: "order-status",
                title: "Cambiar estado",
                submitLabel: "Confirmar cambio",
                fields: [
                  {
                    key: "reason",
                    label: "Motivo del cambio",
                    type: "textarea",
                  },
                ],
              }}
              submit={async (input) => {
                await command.mutateAsync({
                  kind: "order-status",
                  input: {
                    ...input,
                    orderId: move.order.id,
                    version: move.order.version ?? 0,
                    status: move.status,
                  },
                });
                setMove(null);
                toast.success("Estado actualizado.");
              }}
            />
          )}
        </SheetContent>
      </FormSheet>
    </>
  );
}
