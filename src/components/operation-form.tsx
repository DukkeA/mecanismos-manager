"use client";
import {SalePicker} from "@/features/commerce/sale-picker";
import { validateForm, type FormField } from "@/domain/form-validation";
export type { FormField } from "@/domain/form-validation";
import { useFormSheet } from "./form-sheet";
import { useId, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  Field,
  FieldError,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "./ui/field";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Choice, DateField } from "./workshop-controls";
export type Option = { id: string; label: string };
export type Dialog = {
  kind: string;
  title: string;
  fields: FormField[];
  extra?: Record<string, unknown>;
  submitLabel?: string;
  description?: string;
};
export function OperationForm({
  dialog,
  submit,
}: {
  dialog: Dialog;
  submit: (input: Record<string, unknown>) => Promise<void>;
}) {
  const formId = useId();
  const draft = useFormSheet();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());

  return (
    <form
      className="sheet-body operation-form"
      noValidate
      aria-busy={pending}
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending) return;
        const form = new FormData(event.currentTarget);

        const values: Record<string, unknown> = { ...dialog.extra, requestId };

        for (const field of dialog.fields) {
          const value =
            field.type === "members"
              ? form.getAll(field.key)
              : String(form.get(field.key) ?? "").replace("__none", "");
          if (
            field.optional &&
            value === "" &&
            (field.key.endsWith("Id") || field.type === "date")
          )
            delete values[field.key];
          else values[field.key] = value;
        }

        const invalid = validateForm(dialog.fields, values);
        setFieldErrors(invalid);
        if (Object.keys(invalid).length) {
          setError("Revisa los campos señalados.");
          document
            .getElementById(`${formId}-${Object.keys(invalid)[0]}`)
            ?.focus();
          return;
        }
        setPending(true);
        setError("");
        try {
          await submit(values);
          draft.saved();
        } catch (e) {
          setError(e instanceof Error ? e.message : "No se pudo guardar.");
          if (e && typeof e === "object" && "fields" in e) {
            const fields = e.fields as Record<string, string>;
            setFieldErrors(fields);
            document
              .getElementById(`${formId}-${Object.keys(fields)[0]}`)
              ?.focus();
          }
        } finally {
          setPending(false);
        }
      }}
    >
      <FieldGroup>
        {dialog.fields.map((field) =>
          field.type === "members" ? (
            <FieldSet
              key={field.key}
              id={`${formId}-${field.key}`}
              tabIndex={-1}
              data-invalid={!!fieldErrors[field.key]}
            >
              <FieldLegend>{field.label}</FieldLegend>
              {field.options?.map((option) => (
                <Field key={option.id} orientation="horizontal">
                  <Checkbox
                    id={`${formId}-${option.id}`}
                    onCheckedChange={draft.change}
                    name={field.key}
                    value={option.id}
                    defaultChecked={Array.isArray(dialog.extra?.[field.key]) && (dialog.extra[field.key] as string[]).includes(option.id)}
                  />
                  <FieldLabel htmlFor={`${formId}-${option.id}`}>
                    {option.label}
                  </FieldLabel>
                </Field>
              ))}
              <FieldError>{fieldErrors[field.key]}</FieldError>
              {!fieldErrors[field.key] && (
                <FieldDescription>
                  Selecciona al menos un responsable.
                </FieldDescription>
              )}
            </FieldSet>
          ) : (
            <Field key={field.key} data-invalid={!!fieldErrors[field.key]}>
              <FieldLabel htmlFor={`${formId}-${field.key}`}>
                {field.label}
                {field.optional ? " (opcional)" : ""}
              </FieldLabel>
              {field.type === "sale" ? (<SalePicker id={`${formId}-${field.key}`} name={field.key} customerId={field.customerId}/>) : field.type === "select" ? (
                <Choice
                  id={`${formId}-${field.key}`}
                  name={field.key}
                  required={!field.optional}
                  aria-invalid={!!fieldErrors[field.key]}
                  aria-describedby={`${formId}-${field.key}-help ${formId}-${field.key}-error`}
                  defaultValue={String(
                    dialog.extra?.[field.key] ??
                      (field.optional ? "" : (field.options?.[0]?.id ?? "")),
                  )}
                  options={[
                    ...(field.optional
                      ? [{ id: "", label: "Sin asociar" }]
                      : []),
                    ...(field.options ?? []),
                  ]}
                />
              ) : field.type === "date" ? (
                <DateField
                  id={`${formId}-${field.key}`}
                  name={field.key}
                  label={field.label}
                  required={!field.optional}
                  aria-invalid={!!fieldErrors[field.key]}
                  aria-describedby={`${formId}-${field.key}-help ${formId}-${field.key}-error`}
                  defaultValue={String(dialog.extra?.[field.key] ?? "")}
                />
              ) : field.type === "textarea" ? (
                <Textarea
                  id={`${formId}-${field.key}`}
                  name={field.key}
                  required={!field.optional}
                  aria-invalid={!!fieldErrors[field.key]}
                  aria-describedby={`${formId}-${field.key}-help ${formId}-${field.key}-error`}
                  maxLength={1000}
                  defaultValue={String(dialog.extra?.[field.key] ?? "")}
                />
              ) : (
                <Input
                  id={`${formId}-${field.key}`}
                  name={field.key}
                  type={
                    field.type === "money" || field.type === "quantity"
                      ? "text"
                      : (field.type ?? "text")
                  }
                  inputMode={
                    field.type === "money" || field.type === "quantity"
                      ? "decimal"
                      : undefined
                  }
                  required={!field.optional}
                  aria-invalid={!!fieldErrors[field.key]}
                  aria-describedby={`${formId}-${field.key}-help ${formId}-${field.key}-error`}
                  maxLength={200}
                  defaultValue={String(dialog.extra?.[field.key] ?? "")}
                />
              )}{" "}
              {(field.hint ||
                field.type === "money" ||
                field.type === "quantity") && (
                <FieldDescription id={`${formId}-${field.key}-help`}>
                  {field.hint ??
                    (field.type === "money"
                      ? "Sin separadores de miles. Ej. 250000."
                      : "Usa punto para decimales. Ej. 1.5.")}
                </FieldDescription>
              )}
              <FieldError id={`${formId}-${field.key}-error`}>
                {fieldErrors[field.key]}
              </FieldError>
            </Field>
          ),
        )}
        {error && (
          <Alert variant="destructive">
            <AlertTitle>No se pudo guardar</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="form-actions">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={draft.cancel}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : (dialog.submitLabel ?? "Guardar cambios")}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
