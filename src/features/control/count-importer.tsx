"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { assertConnected, useWorkshopScope } from "@/features/workshop/query";
import { useFormSheet } from "@/components/form-sheet";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Choice } from "@/components/workshop-controls";
export function CountImporter({
  locations,
  onSaved,
}: {
  locations: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [requestId] = useState(() => crypto.randomUUID()),
    draft = useFormSheet(),
    client = useQueryClient(),
    { actorId } = useWorkshopScope();
  const command = useMutation({
    mutationFn: async (data: FormData) => {
      assertConnected();
      data.set("requestId", requestId);
      const response = await fetch("/api/inventory-import", {
          method: "POST",
          body: data,
        }),
        body = await response.json();
      if (!response.ok) throw new Error(body.error);
      return body;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["control", actorId] });
      draft.saved();
      onSaved();
    },
  });
  return (
    <form
      className="sheet-body operation-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!command.isPending) command.mutate(new FormData(e.currentTarget));
      }}
    >
      <FieldGroup>
        <p className="text-sm">
          Descarga la plantilla, cuenta los repuestos por sede y completa una
          fila por código y condición. Un costo vacío queda sin valorar; cero
          significa costo conocido de $0.
        </p>
        <Button asChild variant="outline">
          <a href="/api/inventory-import">Descargar plantilla Excel</a>
        </Button>
        <Field>
          <FieldLabel htmlFor="count-location">Sede</FieldLabel>
          <Choice
            id="count-location"
            name="locationId"
            options={locations.map((l) => ({ id: l.id, label: l.name }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="count-file">Archivo de conteo</FieldLabel>
          <Input
            id="count-file"
            type="file"
            name="file"
            accept=".xlsx"
            required
          />
          <FieldDescription>
            Hasta 2 MB y 2.000 filas. Las fórmulas deben convertirse a valores.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="count-note">
            Responsable del conteo y observaciones
          </FieldLabel>
          <Textarea
            id="count-note"
            name="note"
            required
            minLength={5}
            maxLength={2000}
          />
        </Field>
      </FieldGroup>
      {command.isError && (
        <Alert variant="destructive">
          <AlertTitle className="whitespace-pre-wrap">
            {command.error.message}
          </AlertTitle>
        </Alert>
      )}
      <div className="sheet-actions">
        <Button variant="outline" type="button" onClick={draft.cancel}>
          Cancelar
        </Button>
        <Button disabled={command.isPending}>
          {command.isPending ? "Revisando archivo…" : "Preparar vista previa"}
        </Button>
      </div>
    </form>
  );
}
