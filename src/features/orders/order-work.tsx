"use client";
import { useState } from "react";
import { Package, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormSheet } from "@/components/form-sheet";
import { OperationForm, type Dialog } from "@/components/operation-form";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useWorkshopCommands } from "@/features/workshop/commands";
import type { OrderView } from "@/domain/workshop-view";
import type { OperationsView } from "@/domain/operations-view";

export function OrderWork({
  order,
  data,
  locations,
}: {
  order: OrderView;
  data: OperationsView;
  locations: { id: string; name: string }[];
}) {
  const run = useWorkshopCommands();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const editable = !["CLOSED", "CANCELLED"].includes(order.status);
  const mechanics = data.members.filter(
    (member) => member.active && member.role === "MECHANIC",
  );
  const available = data.balances.filter(
    (balance) => Number(balance.quantity) > Number(balance.reserved),
  );
  const used = data.movements.filter(
    (movement) =>
      movement.orderId === order.id &&
      movement.kind === "CONSUMPTION" &&
      !movement.reversed,
  );
  const stockKey = (balance: OperationsView["balances"][number]) =>
    `${balance.itemId}/${balance.locationId}/${balance.condition}`;
  return (
    <section className="flex flex-col gap-3 border-t pt-4">
      <h3>Repuestos y mano de obra</h3>
      {editable && (
        <>
          <p className="text-sm text-muted-foreground">
            Añade los repuestos utilizados y asigna el trabajo por tarea.
            Registra después el tiempo de cada mecánico.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!available.length}
              onClick={() =>
                setDialog({
                  kind: "stock",
                  title: "Añadir repuesto al trabajo",
                  submitLabel: "Registrar repuesto utilizado",
                  extra: {
                    orderId: order.id,
                    kind: "CONSUMPTION",
                    unitCost: "0",
                    quantity: "1",
                  },
                  fields: [
                    {
                      key: "stockKey",
                      label: "Repuesto disponible",
                      type: "select",
                      options: available.map((balance) => ({
                        id: stockKey(balance),
                        label: `${data.items.find((item) => item.id === balance.itemId)?.name} · ${locations.find((location) => location.id === balance.locationId)?.name} · ${{ NEW: "Nuevo", USED: "Usado", REBUILT: "Reconstruido" }[balance.condition] ?? balance.condition} · ${Number(balance.quantity) - Number(balance.reserved)} ${Number(balance.quantity) - Number(balance.reserved) === 1 ? "disponible" : "disponibles"}`,
                      })),
                    },
                    {
                      key: "quantity",
                      label: "Cantidad utilizada",
                      type: "quantity",
                    },
                    {
                      key: "details",
                      label: "Detalles",
                      type: "textarea",
                      optional: true,
                      maxLength: 800,
                    },
                  ],
                })
              }
            >
              <Package data-icon="inline-start" />
              Añadir repuesto
            </Button>
            <Button
              variant="outline"
              disabled={!mechanics.length}
              onClick={() =>
                setDialog({
                  kind: "task",
                  title: "Añadir mano de obra",
                  submitLabel: "Asignar tarea",
                  extra: {
                    orderId: order.id,
                    memberIds:
                      order.memberIds?.filter((id) =>
                        mechanics.some((member) => member.id === id),
                      ) ?? [],
                  },
                  fields: [
                    {
                      key: "title",
                      label: "Trabajo por realizar",
                      minLength: 3,
                      maxLength: 250,
                    },
                    {
                      key: "memberIds",
                      label: "Mecánicos que realizan la tarea",
                      type: "members",
                      options: mechanics.map((member) => ({
                        id: member.id,
                        label: member.name,
                      })),
                    },
                    {
                      key: "plannedMinutes",
                      label: "Minutos previstos",
                      type: "quantity",
                      optional: true,
                    },
                    {
                      key: "description",
                      label: "Instrucciones",
                      type: "textarea",
                      optional: true,
                    },
                  ],
                })
              }
            >
              <Wrench data-icon="inline-start" />
              Añadir mano de obra
            </Button>
          </div>
          {!available.length && (
            <p className="text-sm text-muted-foreground">
              Registra existencias en Inventario para añadir repuestos.
            </p>
          )}
          {!mechanics.length && (
            <p className="text-sm text-muted-foreground">
              Añade un mecánico activo en Equipo para asignar mano de obra.
            </p>
          )}
        </>
      )}
      {used.length > 0 && (
        <ul className="detail-list">
          {used.map((movement) => (
            <li key={movement.id}>
              {data.items.find((item) => item.id === movement.itemId)?.name} ·{" "}
              {Math.abs(Number(movement.quantity))}{" "}
              {Math.abs(Number(movement.quantity)) === 1
                ? "unidad utilizada"
                : "unidades utilizadas"}
            </li>
          ))}
        </ul>
      )}
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
              OT-{order.number} · {order.title}
            </SheetDescription>
          </SheetHeader>
          {dialog && (
            <OperationForm
              dialog={dialog}
              submit={async (input) => {
                const balance =
                  dialog.kind === "stock"
                    ? available.find((row) => stockKey(row) === input.stockKey)
                    : undefined;
                await run(dialog.kind, {
                  ...input,
                  ...(balance
                    ? {
                        itemId: balance.itemId,
                        locationId: balance.locationId,
                        condition: balance.condition,
                        reason: `Repuesto utilizado en OT-${order.number}${input.details ? `: ${input.details}` : ""}`,
                      }
                    : {}),
                });
                setDialog(null);
                toast.success("Trabajo actualizado.");
              }}
            />
          )}
        </SheetContent>
      </FormSheet>
    </section>
  );
}
