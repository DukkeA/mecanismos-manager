"use client";
import { useState } from "react";
import { ValidatedForm } from "@/components/validated-form";
import { Choice } from "@/components/workshop-controls";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { useOrderTransition } from "./hooks";
import type { OrderView } from "@/domain/workshop-view";
import type { OperationsView } from "@/domain/operations-view";

export function OrderTeam({
  order,
  members,
  editable,
}: {
  order: OrderView;
  members: OperationsView["members"];
  editable: boolean;
}) {
  const command = useOrderTransition();
  const [responsibleId, setResponsible] = useState(order.responsibleId ?? "");
  return (
    <ValidatedForm
      onSubmit={async (event) => {
        event.preventDefault();
        if (command.isPending) return;
        try {
          await command.mutateAsync({
            kind: "order-coordinator",
            input: {
              requestId: crypto.randomUUID(),
              orderId: order.id,
              version: order.version ?? 0,
              responsibleId: responsibleId || null,
            },
          });
        } catch {
          /* Mutation error stays visible below. */
        }
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="coordinator">
            Coordinador de la orden (opcional)
          </FieldLabel>
          <Choice
            id="coordinator"
            value={responsibleId}
            disabled={!editable || command.isPending}
            onChange={setResponsible}
            options={[
              { id: "", label: "Sin coordinador" },
              ...members
                .filter((m) => m.active || m.id === order.responsibleId)
                .map((m) => ({ id: m.id, label: m.name })),
            ]}
          />
          <FieldDescription>
            Da seguimiento al trabajo. Cada tarea puede asignarse a uno o varios
            mecánicos; todos ellos ven la orden entre sus trabajos.
          </FieldDescription>
        </Field>
        {editable && responsibleId !== (order.responsibleId ?? "") && (
          <Button variant="outline" disabled={command.isPending}>
            {command.isPending ? "Guardando…" : "Guardar coordinador"}
          </Button>
        )}
        {command.error && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>{command.error.message}</AlertTitle>
          </Alert>
        )}
      </FieldGroup>
    </ValidatedForm>
  );
}
