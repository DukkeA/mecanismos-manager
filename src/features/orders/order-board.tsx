"use client";

import { useState, type ReactNode } from "react";
import {
  CalendarDays,
  ClipboardList,
  Clock3,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { orderTransitions } from "@/domain/order-lifecycle";
import { statusLabels, type OrderView } from "@/domain/workshop-view";
import {
  WorkshopKanban,
  type KanbanColumnDefinition,
} from "@/components/workshop-kanban";
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
import { useOrderTransition } from "./hooks";

const columns = Object.entries(statusLabels).map(([id, label]) => ({
  id,
  label,
})) as KanbanColumnDefinition[];

function OrderCard({
  order,
  open,
  dragHandle,
  preview = false,
}: {
  order: OrderView;
  open?: () => void;
  dragHandle?: ReactNode;
  preview?: boolean;
}) {
  const minutes = order.tasks.reduce((sum, task) => sum + task.minutes, 0);
  return (
    <Card size="sm" className="workshop-kanban-card">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="workshop-kanban-eyebrow">
            OT-{String(order.number).padStart(4, "0")}
          </span>
          <CardTitle>
            {preview || !open ? (
              order.title
            ) : (
              <Button variant="link" onClick={open}>
                {order.title}
              </Button>
            )}
          </CardTitle>
        </div>
        {dragHandle}
      </CardHeader>
      <CardContent className="workshop-kanban-card-content">
        <p>{order.customer}</p>
        <span>{order.reference}</span>
        <p className="workshop-kanban-next-step">{order.nextStep}</p>
      </CardContent>
      <CardFooter className="workshop-kanban-card-footer">
        <span title="Responsable">
          <UserRound aria-hidden="true" />
          {order.responsible || "Sin asignar"}
        </span>
        <span title="Entrega prevista">
          <CalendarDays aria-hidden="true" />
          {order.dueAt ? dateLabel(order.dueAt) : "Sin fecha"}
        </span>
        <span title="Tiempo registrado">
          <Clock3 aria-hidden="true" />
          {minutes ? `${minutes} min` : "Sin tiempo"}
        </span>
      </CardFooter>
    </Card>
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
  const [optimistic, setOptimistic] = useState<{
    id: string;
    status: string;
  } | null>(null);
  const visibleOrders = orders.map((order) =>
    optimistic?.id === order.id
      ? { ...order, status: optimistic.status }
      : order,
  );

  async function moveOrder(order: OrderView, status: string) {
    setOptimistic({ id: order.id, status });
    try {
      await command.mutateAsync({
        kind: "order-status",
        input: {
          requestId: crypto.randomUUID(),
          orderId: order.id,
          version: order.version ?? 0,
          status,
        },
      });
      toast.success(
        `OT-${String(order.number).padStart(4, "0")} movida a ${statusLabels[status].toLowerCase()}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo mover la orden. Conserva su estado anterior.",
      );
    } finally {
      setOptimistic(null);
    }
  }

  return (
    <WorkshopKanban
      id="workshop-orders"
      ariaLabel="Órdenes por estado"
      columns={columns}
      items={visibleOrders}
      getItemId={(order) => order.id}
      getItemLabel={(order) =>
        `Orden ${String(order.number).padStart(4, "0")}`
      }
      getItemState={(order) => order.status}
      canDrag={(order) =>
        editable && !!orderTransitions[order.status]?.length
      }
      canMove={(order, status) =>
        orderTransitions[order.status]?.includes(status) ?? false
      }
      onMove={moveOrder}
      disabled={command.isPending}
      help="Arrastra una orden a uno de los estados habilitados. El cambio se guarda al soltar."
      renderColumnTitle={(column, count) => (
        <>
          <Badge variant="secondary" data-status={column.id}>
            {column.label}
          </Badge>
          <span className="workshop-kanban-count">{count}</span>
        </>
      )}
      renderCard={(order, { dragHandle }) => (
        <OrderCard
          order={order}
          open={() => openOrder(order.id)}
          dragHandle={dragHandle}
        />
      )}
      renderOverlay={(order) => <OrderCard order={order} preview />}
      renderEmpty={() => (
        <DataEmpty
          compact
          icon={ClipboardList}
          title="Sin órdenes"
          description="Las órdenes en este estado aparecerán aquí."
        />
      )}
    />
  );
}
