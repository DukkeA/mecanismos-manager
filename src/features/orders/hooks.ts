"use client";
import { addObservation, addTime, createOrder } from "@/app/actions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  assertConnected,
  snapshotKey,
  useOperationMutation,
  useWorkshopQuery,
  useWorkshopScope,
  type WorkshopSnapshot,
} from "../workshop/query";
export const useOrders = () => useWorkshopQuery((data) => data.orders);
export const useOrderTransition = () => useOperationMutation("orders");
export function useOrderCommand() {
  const scope = useWorkshopScope();
  const client = useQueryClient();
  const key = snapshotKey(scope.actorId);
  return useMutation({
    mutationKey: ["orders", "command"],
    mutationFn: async (command: {
      kind: "note" | "time" | "create";
      input: Record<string, unknown>;
    }) => {
      if (scope.demo) {
        client.setQueryData<WorkshopSnapshot>(key, (current) => {
          if (!current) return current;
          const next = structuredClone(current);
          const input = command.input;
          if (command.kind === "note") {
            next.orders
              .find((o) => o.id === input.orderId)
              ?.notes.unshift({
                id: crypto.randomUUID(),
                body: String(input.body),
                author: "Administrador",
                date: "Ahora",
              });
          }
          if (command.kind === "time") {
            for (const o of next.orders) {
              const t = o.tasks.find((t) => t.id === input.taskId);
              if (t) t.minutes += Number(input.minutes);
            }
          }
          if (command.kind === "create") {
            const number = Math.max(0, ...next.orders.map((o) => o.number)) + 1;
            next.orders.unshift({
              id: crypto.randomUUID(),
              number,
              title: String(input.title),
              reference: String(input.reference),
              customer:
                next.operations.customers.find((c) => c.id === input.customerId)
                  ?.name ??
                String(input.customer ?? "Mecanismos · unidad propia"),
              kind: input.kind as "VEHICLE" | "COMPONENT",
              status: "RECEIVED",
              family: "Recepción",
              responsible: "Sin asignar",
              nextStep: "Asignar tarea",
              problem: String(input.problem),
              location:
                next.locations.find((l) => l.id === input.locationId)?.name ??
                "Taller",
              receivedAt: new Date().toISOString(),
              tasks: [],
              notes: [],
            });
          }
          return next;
        });
        return;
      }
      assertConnected();
      if (command.kind === "note")
        await addObservation(
          String(command.input.orderId),
          String(command.input.body),
        );
      else if (command.kind === "time") await addTime(command.input);
      else await createOrder(command.input);
    },
    onSuccess: async () => {
      if (!scope.demo) await Promise.all([client.invalidateQueries({ queryKey: key }),...(["control","commerce","records","observations"] as const).map(feature=>client.invalidateQueries({queryKey:[feature,scope.actorId]}))]);
    },
  });
}
