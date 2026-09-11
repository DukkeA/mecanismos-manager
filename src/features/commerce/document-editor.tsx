"use client";
import { useState } from "react";
import Decimal from "decimal.js";
import { Plus, Trash2 } from "lucide-react";
import { useCommercialCommand } from "./hooks";
import { useFormSheet } from "@/components/form-sheet";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Choice, DateField } from "@/components/workshop-controls";
import { cop, todayInBogota } from "@/features/cash/summary";
import {
  lineTotal,
  type CommercialRow,
  type DocumentLineInput,
} from "@/domain/commercial";
import type { OperationsView } from "@/domain/operations-view";
import type { OrderView } from "@/domain/workshop-view";

export function DocumentEditor({
  mode,
  source,
  data,
  orders,
  locations,
  onSaved,
}: {
  mode: "quote" | "sale";
  source?: CommercialRow;
  data: OperationsView;
  orders: OrderView[];
  locations: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const command = useCommercialCommand(),
    draft = useFormSheet();
  const [requestId] = useState(() => crypto.randomUUID()),
    [error, setError] = useState("");
  const [customerId, setCustomerId] = useState(source?.customerId ?? ""),
    [orderId, setOrderId] = useState(source?.orderId ?? "");
  const [title, setTitle] = useState(source?.title ?? ""),
    [terms, setTerms] = useState(source?.terms ?? "");
  const fromQuote = mode === "sale" && !!source;
  const emptyLine: DocumentLineInput = {
    itemId: "",
    description: "",
    quantity: "1",
    unitPrice: "0",
    discount: "0",
    condition: "NEW",
  };
  const [lines, setLines] = useState<DocumentLineInput[]>(
    source?.lines?.map((l) => ({
      ...l,
      estimatedUnitCost: l.estimatedUnitCost ?? undefined,
    })) ?? [{ ...emptyLine }],
  );
  const sum = lines.reduce((s, l) => {
    try {
      return s.plus(lineTotal(l));
    } catch {
      return s;
    }
  }, new Decimal(0));
  function update(index: number, patch: Partial<DocumentLineInput>) {
    draft.change();
    setLines((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }
  return (
    <form
      className="sheet-body operation-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (command.isPending) return;
        setError("");
        const form = new FormData(event.currentTarget);
        try {
          await command.mutateAsync({
            kind: mode,
            input: {
              requestId,
              customerId,
              orderId: orderId || undefined,
              title,
              terms,
              lines,
              ...(mode === "quote"
                ? {
                    previousId: source?.id,
                    validUntil: String(form.get("dueOn")),
                  }
                : {
                    quoteId: source?.id,
                    locationId: String(form.get("locationId")),
                    issuedOn: String(form.get("issuedOn")),
                    dueOn: String(form.get("dueOn")),
                    invoiceReference: String(
                      form.get("invoiceReference") ?? "",
                    ),
                  }),
            },
          });
          draft.saved();
          onSaved();
        } catch (e) {
          setError(e instanceof Error ? e.message : "No se pudo guardar.");
        }
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="document-customer">Cliente</FieldLabel>
          <Choice
            id="document-customer"
            disabled={fromQuote}
            label="Cliente"
            value={customerId}
            onChange={(id) => {
              setCustomerId(id);
              setOrderId("");
            }}
            options={[
              { id: "", label: "Seleccionar cliente" },
              ...data.customers
                .filter((c) => !c.deletedAt)
                .map((c) => ({ id: c.id, label: c.name })),
            ]}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="document-order">Orden de trabajo</FieldLabel>
          <Choice
            id="document-order"
            disabled={fromQuote}
            label="Orden de trabajo"
            value={orderId}
            onChange={setOrderId}
            options={[
              {
                id: "",
                label:
                  mode === "sale" ? "Venta de mostrador" : "Sin orden todavía",
              },
              ...orders
                .filter(
                  (o) =>
                    o.customerId === customerId && o.status !== "CANCELLED",
                )
                .map((o) => ({
                  id: o.id,
                  label: `OT-${o.number} · ${o.title}`,
                })),
            ]}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="document-title">Descripción</FieldLabel>
          <Input
            id="document-title"
            readOnly={fromQuote}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={3}
            maxLength={250}
          />
        </Field>
        {mode === "sale" && (
          <Field>
            <FieldLabel htmlFor="document-location">Sede de salida</FieldLabel>
            <Choice
              id="document-location"
              name="locationId"
              options={locations.map((l) => ({ id: l.id, label: l.name }))}
            />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {mode === "sale" && (
            <Field>
              <FieldLabel htmlFor="document-issued">Fecha de venta</FieldLabel>
              <DateField
                id="document-issued"
                name="issuedOn"
                defaultValue={todayInBogota()}
                required
              />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="document-due">
              {mode === "quote" ? "Válida hasta" : "Vencimiento"}
            </FieldLabel>
            <DateField
              id="document-due"
              name="dueOn"
              defaultValue={source?.dueOn ?? todayInBogota()}
              required
            />
          </Field>
        </div>
        <Separator />
        {fromQuote && (
          <Alert>
            <AlertTitle>
              Se conservarán las líneas y condiciones de la versión aprobada.
            </AlertTitle>
          </Alert>
        )}
        {lines.map((line, index) => (
          <FieldGroup key={index} className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <strong>Línea {index + 1}</strong>
              {!fromQuote && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar línea ${index + 1}`}
                  disabled={lines.length === 1}
                  onClick={() => {
                    draft.change();
                    setLines((rows) => rows.filter((_, i) => i !== index));
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
            <Field>
              <FieldLabel htmlFor={`line-item-${index}`}>
                Repuesto o servicio
              </FieldLabel>
              <Choice
                id={`line-item-${index}`}
                disabled={fromQuote}
                value={line.itemId}
                onChange={(id) => {
                  const item = data.items.find((i) => i.id === id);
                  update(index, { itemId: id, description: item?.name ?? "" });
                }}
                options={[
                  { id: "", label: "Seleccionar" },
                  ...data.items.map((i) => ({
                    id: i.id,
                    label: `${i.kind === "SERVICE" ? "Servicio" : "Repuesto"} · ${i.name}${i.reference ? ` · ${i.reference}` : ""}`,
                  })),
                ]}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`line-description-${index}`}>
                Detalle acordado
              </FieldLabel>
              <Input
                id={`line-description-${index}`}
                value={line.description}
                onChange={(e) => update(index, { description: e.target.value })}
                required
                readOnly={fromQuote}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["quantity", "Cantidad"],
                  ["unitPrice", "Precio unitario (COP)"],
                  ["discount", "Descuento total (COP)"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key}>
                  <FieldLabel htmlFor={`line-${key}-${index}`}>
                    {label}
                  </FieldLabel>
                  <Input
                    id={`line-${key}-${index}`}
                    inputMode="decimal"
                    value={line[key]}
                    onChange={(e) => update(index, { [key]: e.target.value })}
                    required
                    readOnly={fromQuote}
                  />
                </Field>
              ))}
            </div>
            {mode === "quote" && (
              <Field>
                <FieldLabel htmlFor={`line-cost-${index}`}>
                  Costo previsto por unidad (COP)
                </FieldLabel>
                <Input
                  id={`line-cost-${index}`}
                  inputMode="decimal"
                  placeholder="Sin estimar"
                  value={line.estimatedUnitCost ?? ""}
                  onChange={(e) =>
                    update(index, {
                      estimatedUnitCost: e.target.value || undefined,
                    })
                  }
                />
              </Field>
            )}
            {data.items.find((i) => i.id === line.itemId)?.kind === "PART" && (
              <Field>
                <FieldLabel htmlFor={`line-condition-${index}`}>
                  Condición
                </FieldLabel>
                <Choice
                  id={`line-condition-${index}`}
                  disabled={fromQuote}
                  value={line.condition}
                  onChange={(v) =>
                    update(index, {
                      condition: v as DocumentLineInput["condition"],
                    })
                  }
                  options={[
                    { id: "NEW", label: "Nuevo" },
                    { id: "USED", label: "Usado" },
                    { id: "REBUILT", label: "Reconstruido" },
                  ]}
                />
              </Field>
            )}
          </FieldGroup>
        ))}
        {!fromQuote && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              draft.change();
              setLines((rows) => [...rows, { ...emptyLine }]);
            }}
          >
            <Plus data-icon="inline-start" />
            Añadir línea
          </Button>
        )}
        <Field>
          <FieldLabel htmlFor="document-terms">
            Alcance y condiciones
          </FieldLabel>
          <Textarea
            id="document-terms"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            readOnly={fromQuote}
            maxLength={5000}
          />
        </Field>
        {mode === "sale" && (
          <Field>
            <FieldLabel htmlFor="document-invoice">
              Referencia de factura
            </FieldLabel>
            <Input
              id="document-invoice"
              name="invoiceReference"
              placeholder="Opcional"
              maxLength={200}
            />
          </Field>
        )}
      </FieldGroup>
      <div className="flex items-center justify-between gap-4 border-t pt-4">
        <span>Total</span>
        <strong className="text-xl tabular-nums">{cop(sum.toString())}</strong>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}
      <div className="sheet-actions">
        <Button
          type="button"
          variant="outline"
          onClick={draft.cancel}
          disabled={command.isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={command.isPending}>
          {command.isPending
            ? "Guardando…"
            : mode === "quote"
              ? "Guardar versión"
              : "Registrar venta"}
        </Button>
      </div>
    </form>
  );
}
