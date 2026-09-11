"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useContactMutation, useContacts } from "./hooks";
import { Choice } from "@/components/workshop-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertTitle } from "@/components/ui/alert";

export function CustomerFormField({
  id,
  defaultValue = "",
}: {
  id: string;
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return <CustomerPicker id={id} value={value} onChange={setValue} />;
}

export function CustomerPicker({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const { data } = useContacts();
  const mutation = useContactMutation();
  const [creating, setCreating] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState({
    name: "",
    phone: "",
    email: "",
    document: "",
  });
  const [error, setError] = useState("");
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={id}>Cliente</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-48 flex-1">
            <Choice
              id={id}
              name="customerId"
              value={value}
              onChange={onChange}
              disabled={disabled}
              options={[
                { id: "", label: "Seleccionar cliente" },
                ...(data?.customers ?? [])
                  .filter((c) => !c.deletedAt)
                  .map((c) => ({ id: c.id, label: c.name })),
              ]}
              required
            />
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreating((v) => !v)}
            >
              <Plus data-icon="inline-start" />
              Nuevo cliente
            </Button>
          )}
        </div>
      </Field>
      {creating && (
        <FieldGroup className="rounded-lg border p-4">
          <p className="font-semibold">Datos del nuevo cliente</p>
          {(
            [
              ["name", "Nombre o empresa"],
              ["phone", "Teléfono"],
              ["document", "Documento"],
              ["email", "Correo"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key}>
              <FieldLabel htmlFor={`${id}-${key}`}>
                {label}
                {key !== "name" ? " (opcional)" : ""}
              </FieldLabel>
              <Input
                id={`${id}-${key}`}
                type={key === "email" ? "email" : "text"}
                value={draft[key]}
                maxLength={key === "name" ? 180 : key === "email" ? 254 : 40}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [key]: e.target.value }))
                }
              />
            </Field>
          ))}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={mutation.isPending}
              onClick={async () => {
                setError("");
                try {
                  const result = await mutation.mutateAsync({
                    kind: "customer",
                    input: { ...draft, requestId },
                  });
                  if (!result?.id)
                    throw Error(
                      "No se pudo seleccionar el cliente. Revisa el listado.",
                    );
                  onChange(result.id);
                  setCreating(false);
                  setDraft({ name: "", phone: "", email: "", document: "" });
                  setRequestId(crypto.randomUUID());
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Revisa los datos del cliente.",
                  );
                }
              }}
            >
              {mutation.isPending ? "Guardando…" : "Guardar y seleccionar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => setCreating(false)}
            >
              Cancelar
            </Button>
          </div>
        </FieldGroup>
      )}
    </FieldGroup>
  );
}
