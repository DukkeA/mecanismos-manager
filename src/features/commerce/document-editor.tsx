"use client";
import { useState } from "react";
import Decimal from "decimal.js";
import { Package, Plus, Trash2, Wrench } from "lucide-react";
import { useCommercialCommand, useCommercialPage } from "./hooks";
import { CustomerPicker } from "@/features/contacts/customer-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { useFormSheet } from "@/components/form-sheet";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

type EditorLine = DocumentLineInput & { kind: "PART" | "SERVICE" };

export function DocumentEditor({
  mode,
  source,
  context,
  data,
  orders,
  locations,
  onSaved,
}: {
  mode: "quote" | "sale";
  source?: CommercialRow;
  context?: { customerId: string; orderId: string; title: string };
  data: OperationsView;
  orders: OrderView[];
  locations: { id: string; name: string }[];
  onSaved: (id: string) => void;
}) {
  const command = useCommercialCommand(),
    draft = useFormSheet();
  const [requestId] = useState(() => crypto.randomUUID()),
    [error, setError] = useState("");
  const [customerId, setCustomerId] = useState(
      source?.customerId ?? context?.customerId ?? "",
    ),
    [orderId, setOrderId] = useState(source?.orderId ?? context?.orderId ?? "");
  const [title, setTitle] = useState(source?.title ?? context?.title ?? ""),
    [terms, setTerms] = useState(source?.terms ?? "");
  const fromQuote = mode === "sale" && !!source;
  const [paymentMode, setPaymentMode] = useState("full");
  const [applyCredit, setApplyCredit] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const credit = useCommercialPage(
    new URLSearchParams({ resource: "payments", customerId }),
    mode === "sale" && !!customerId,
  );
  const emptyLine: EditorLine = {
    kind: "PART",
    itemId: "",
    description: "",
    quantity: "1",
    unitPrice: "0",
    discount: "0",
    condition: "NEW",
  };
  const [lines, setLines] = useState<EditorLine[]>(
    source?.lines?.map((line) => ({
      kind: line.kind,
      itemId: line.itemId,
      assignedMemberId: line.assignedMemberId ?? undefined,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discount,
      condition: line.condition,
    })) ?? [{ ...emptyLine }],
  );
  const sum = lines.reduce((s, l) => {
    try {
      return s.plus(lineTotal(l));
    } catch {
      return s;
    }
  }, new Decimal(0));
  const creditUsed = applyCredit
    ? Decimal.min(sum, credit.data?.summary.advances ?? "0")
    : new Decimal(0);
  const afterCredit = Decimal.max(0, sum.minus(creditUsed));
  let collected = paymentMode === "full" ? afterCredit : new Decimal(0);
  if (paymentMode === "partial") {
    try {
      collected = new Decimal(partialAmount || "0");
    } catch {
      /* Validated on submit. */
    }
  }
  function update(index: number, patch: Partial<EditorLine>) {
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
          if (
            mode === "sale" &&
            paymentMode === "partial" &&
            (!/^\d+(\.\d{1,2})?$/.test(partialAmount) || collected.lte(0))
          )
            throw new Error("Escribe el valor del abono.");
          if (mode === "sale" && collected.gt(afterCredit))
            throw new Error("El abono supera lo que falta por cobrar.");
          const result = await command.mutateAsync({
            kind: mode,
            input: {
              requestId,
              customerId,
              orderId: orderId || undefined,
              title,
              terms,
              lines: lines.map(({ kind: _kind, ...line }) => line),
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
                    applyCredit,
                    settleInFull: paymentMode === "full",
                    payment: collected.gt(0)
                      ? {
                          accountId: String(form.get("paymentAccountId")),
                          amount: collected.toFixed(2),
                        }
                      : undefined,
                  }),
            },
          });
          draft.saved();
          onSaved(result.id);
        } catch (e) {
          if (mode === "sale" && applyCredit) void credit.refetch();
          setError(e instanceof Error ? e.message : "No se pudo guardar.");
        }
      }}
    >
      <FieldGroup>
        <CustomerPicker
          id="document-customer"
          disabled={!!source || !!context}
          value={customerId}
          onChange={(id) => {
            setCustomerId(id);
            setOrderId("");
            setApplyCredit(false);
          }}
        />
        <Field>
          <FieldLabel htmlFor="document-order">Orden de trabajo</FieldLabel>
          <Choice
            id="document-order"
            disabled={!!source || !!context}
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
              defaultValue={
                mode === "quote"
                  ? (source?.dueOn ?? todayInBogota())
                  : todayInBogota()
              }
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
              <FieldLabel>Tipo de línea</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                value={line.kind}
                disabled={fromQuote}
                onValueChange={(value) => {
                  if (!value || value === line.kind) return;
                  update(index, {
                    kind: value as EditorLine["kind"],
                    itemId: "",
                    assignedMemberId: undefined,
                    description: "",
                    quantity: "1",
                    unitPrice: "0",
                    discount: "0",
                    condition: "NEW",
                  });
                }}
              >
                <ToggleGroupItem value="PART" aria-label="Venta de repuesto">
                  <Package data-icon="inline-start" />
                  Repuesto
                </ToggleGroupItem>
                <ToggleGroupItem value="SERVICE" aria-label="Mano de obra">
                  <Wrench data-icon="inline-start" />
                  Mano de obra
                </ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>
                Una cotización puede combinar repuestos y horas de trabajo.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`line-item-${index}`}>
                {line.kind === "SERVICE" ? "Servicio" : "Repuesto"}
              </FieldLabel>
              <Choice
                id={`line-item-${index}`}
                disabled={fromQuote}
                value={line.itemId}
                onChange={(id) => {
                  const item = data.items.find((i) => i.id === id);
                  update(index, {
                    itemId: id,
                    description: item?.name ?? "",
                    unitPrice: item?.salePrice ?? "0",
                    assignedMemberId:
                      item?.kind === "SERVICE"
                        ? line.assignedMemberId
                        : undefined,
                  });
                }}
                options={[
                  { id: "", label: "Seleccionar" },
                  ...data.items
                    .filter((item) => item.kind === line.kind)
                    .map((i) => ({
                    id: i.id,
                    label: `${i.name}${i.reference ? ` · ${i.reference}` : ""}`,
                  })),
                ]}
              />
              <FieldDescription>
                {line.kind === "SERVICE"
                  ? "La tarifa sugerida se precarga y sigue siendo editable."
                  : "El precio de venta sugerido se precarga y sigue siendo editable."}
              </FieldDescription>
            </Field>
            <p className="text-sm text-muted-foreground">
              Categoría:{" "}
              {mode === "sale" && orderId
                ? (orders.find((o) => o.id === orderId)?.businessCategory ??
                  "Sin categoría")
                : fromQuote
                  ? (source?.lines?.[index]?.businessCategory?.name ??
                    "Sin categoría")
                  : (data.items.find((i) => i.id === line.itemId)
                      ?.businessCategory ?? "Sin categoría")}
            </p>
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
                    {key === "quantity" && line.kind === "SERVICE"
                      ? "Horas estimadas"
                      : key === "unitPrice" && line.kind === "SERVICE"
                        ? "Tarifa por hora (COP)"
                        : key === "unitPrice"
                          ? "Precio de venta unitario (COP)"
                          : label}
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
            {line.kind === "SERVICE" && (
              <Field>
                <FieldLabel htmlFor={`line-member-${index}`}>
                  Responsable tentativo
                </FieldLabel>
                <Choice
                  id={`line-member-${index}`}
                  disabled={fromQuote}
                  value={line.assignedMemberId ?? ""}
                  onChange={(assignedMemberId) =>
                    update(index, {
                      assignedMemberId: assignedMemberId || undefined,
                    })
                  }
                  options={[
                    { id: "", label: "Asignar después" },
                    ...data.members
                      .filter(
                        (member) =>
                          member.active && member.role === "MECHANIC",
                      )
                      .map((member) => ({ id: member.id, label: member.name })),
                  ]}
                />
                <FieldDescription>
                  Si el cliente aprueba la cotización, esta asignación se
                  propondrá al crear la orden y sus tareas.
                </FieldDescription>
              </Field>
            )}
            {line.kind === "PART" && (
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
      {mode === "sale" && (
        <FieldGroup className="border-t pt-4">
          <h3 className="font-semibold">Cobro</h3>
          {credit.isError && (
            <Alert variant="destructive">
              <AlertTitle>
                No se pudo consultar el saldo a favor del cliente.{" "}
                <Button
                  type="button"
                  variant="link"
                  onClick={() => credit.refetch()}
                >
                  Reintentar
                </Button>
              </AlertTitle>
            </Alert>
          )}
          {Number(credit.data?.summary.advances ?? 0) > 0 && (
            <Field orientation="horizontal">
              <Checkbox
                id="use-credit"
                checked={applyCredit}
                onCheckedChange={(value) => {
                  setApplyCredit(value === true);
                  draft.change();
                }}
              />
              <FieldLabel htmlFor="use-credit">
                Usar saldo a favor: {cop(credit.data!.summary.advances)}
              </FieldLabel>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="payment-mode">¿Cuánto paga hoy?</FieldLabel>
            <Choice
              id="payment-mode"
              value={paymentMode}
              onChange={(value) => {
                setPaymentMode(value);
                draft.change();
              }}
              options={[
                { id: "full", label: `Todo · ${cop(afterCredit.toString())}` },
                { id: "partial", label: "Deja un abono" },
                { id: "later", label: "Queda pendiente de pago" },
              ]}
            />
          </Field>
          {paymentMode === "partial" && (
            <Field>
              <FieldLabel htmlFor="partial-amount">
                Abono de hoy (COP)
              </FieldLabel>
              <Input
                id="partial-amount"
                inputMode="decimal"
                value={partialAmount}
                onChange={(event) => setPartialAmount(event.target.value)}
                required
              />
            </Field>
          )}
          {paymentMode !== "later" && afterCredit.gt(0) && (
            <Field>
              <FieldLabel htmlFor="payment-account">
                ¿En qué cuenta se recibe?
              </FieldLabel>
              <Choice
                id="payment-account"
                name="paymentAccountId"
                defaultValue={
                  data.accounts.find((account) => account.name === "Oficina")
                    ?.id ?? data.accounts[0]?.id
                }
                options={data.accounts.map((account) => ({
                  id: account.id,
                  label: account.name,
                }))}
                required
              />
            </Field>
          )}
          <dl className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-4 text-sm">
            <dt>Saldo a favor aplicado</dt>
            <dd className="text-right tabular-nums">
              {cop(creditUsed.toString())}
            </dd>
            <dt>Cobro de hoy</dt>
            <dd className="text-right tabular-nums">
              {cop(collected.toString())}
            </dd>
            <dt className="font-semibold">Queda por cobrar</dt>
            <dd className="text-right font-semibold tabular-nums">
              {cop(Decimal.max(0, afterCredit.minus(collected)).toString())}
            </dd>
          </dl>
        </FieldGroup>
      )}
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
        <Button
          type="submit"
          disabled={
            command.isPending ||
            (applyCredit && (credit.isFetching || credit.isError))
          }
        >
          {command.isPending
            ? "Guardando…"
            : mode === "quote"
              ? source
                ? "Guardar nueva versión"
                : "Guardar cotización"
              : collected.gt(0)
                ? "Guardar venta y cobro"
                : "Guardar venta"}
        </Button>
      </div>
    </form>
  );
}
