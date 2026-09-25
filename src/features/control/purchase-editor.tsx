"use client";
import { useState } from "react";
import { useControlCommand } from "./hooks";
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
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Choice, DateField } from "@/components/workshop-controls";
import { Plus, Trash2 } from "lucide-react";
import { todayInBogota, cop } from "@/features/cash/summary";
import Decimal from "decimal.js";
import type { OperationsView } from "@/domain/operations-view";
export function PurchaseEditor({
  data,
  locations,
  onSaved,
}: {
  data: OperationsView;
  locations: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const command = useControlCommand(),
    draft = useFormSheet(),
    [requestId] = useState(() => crypto.randomUUID()),
    [error, setError] = useState("");
  const [lines, setLines] = useState([
    { itemId: "", quantity: "1", unitCost: "0", condition: "NEW" },
  ]);
  const change = (i: number, key: string, value: string) => {
    draft.change();
    setLines((rows) =>
      rows.map((r, n) => (n === i ? { ...r, [key]: value } : r)),
    );
  };
  const selectItem = (index: number, itemId: string) => {
    const item = data.items.find((candidate) => candidate.id === itemId);
    draft.change();
    setLines((rows) =>
      rows.map((row, position) =>
        position === index
          ? {
              ...row,
              itemId,
              unitCost: item?.purchasePrice ?? row.unitCost,
            }
          : row,
      ),
    );
  };
  return (
    <form
      className="sheet-body operation-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (command.isPending) return;
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          await command.mutateAsync({
            kind: "purchase",
            input: { requestId, ...Object.fromEntries(f), lines },
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
          <FieldLabel htmlFor="purchase-supplier">Proveedor</FieldLabel>
          <Choice
            id="purchase-supplier"
            name="supplierId"
            options={data.suppliers
              .filter((s) => !s.deletedAt)
              .map((s) => ({ id: s.id, label: s.name }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="purchase-location">Sede de recepción</FieldLabel>
          <Choice
            id="purchase-location"
            name="locationId"
            options={locations.map((l) => ({ id: l.id, label: l.name }))}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="purchase-date">Fecha del pedido</FieldLabel>
            <DateField
              id="purchase-date"
              name="orderedOn"
              defaultValue={todayInBogota()}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="purchase-due">Vencimiento</FieldLabel>
            <DateField
              id="purchase-due"
              name="dueOn"
              defaultValue={todayInBogota()}
              required
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="purchase-ref">
            Referencia del proveedor
          </FieldLabel>
          <Input id="purchase-ref" name="reference" maxLength={200} />
        </Field>
        {lines.map((l, i) => (
          <FieldGroup key={i} className="border-b pb-4">
            <div className="flex justify-between items-center">
              <strong>Repuesto {i + 1}</strong>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Quitar repuesto ${i + 1}`}
                disabled={lines.length === 1}
                onClick={() => {
                  draft.change();
                  setLines((rows) => rows.filter((_, n) => n !== i));
                }}
              >
                <Trash2 />
              </Button>
            </div>
            <Field>
              <FieldLabel htmlFor={`purchase-item-${i}`}>Repuesto</FieldLabel>
              <Choice
                id={`purchase-item-${i}`}
                value={l.itemId}
                onChange={(v) => selectItem(i, v)}
                options={[
                  { id: "", label: "Seleccionar repuesto" },
                  ...data.items
                    .filter((v) => v.kind === "PART")
                    .map((v) => ({
                      id: v.id,
                      label: `${v.name} · ${v.reference || v.code}`,
                    })),
                ]}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`purchase-qty-${i}`}>Cantidad</FieldLabel>
                <Input
                  id={`purchase-qty-${i}`}
                  inputMode="decimal"
                  value={l.quantity}
                  onChange={(e) => change(i, "quantity", e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`purchase-cost-${i}`}>
                  Precio de compra unitario (COP)
                </FieldLabel>
                <p className="text-xs text-muted-foreground">
                  Incluye el transporte e importación que corresponda a cada
                  unidad. Ese costo se recupera al vender o usar el repuesto; no
                  lo registres también como gasto corriente.
                </p>
                <Input
                  id={`purchase-cost-${i}`}
                  inputMode="decimal"
                  value={l.unitCost}
                  onChange={(e) => change(i, "unitCost", e.target.value)}
                />
                <FieldDescription>
                  Se precarga desde el catálogo. Ajusta el valor si este
                  proveedor ofreció otro precio.
                </FieldDescription>
              </Field>
            </div>
            <Choice
              label={`Condición del repuesto ${i + 1}`}
              value={l.condition}
              onChange={(v) => change(i, "condition", v)}
              options={[
                { id: "NEW", label: "Nuevo" },
                { id: "USED", label: "Usado" },
                { id: "REBUILT", label: "Reconstruido" },
              ]}
            />
          </FieldGroup>
        ))}
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            draft.change();
            setLines((rows) => [
              ...rows,
              { itemId: "", quantity: "1", unitCost: "0", condition: "NEW" },
            ]);
          }}
        >
          <Plus />
          Añadir repuesto
        </Button>
        <Field>
          <FieldLabel htmlFor="purchase-note">
            Condiciones y observaciones
          </FieldLabel>
          <Textarea
            id="purchase-note"
            name="note"
            required
            minLength={5}
            maxLength={2000}
          />
        </Field>
      </FieldGroup>
      <div className="flex justify-between border-t pt-4">
        <span>Total pedido</span>
        <strong>
          {cop(
            lines
              .reduce((s, l) => {
                try {
                  return s.plus(new Decimal(l.quantity).mul(l.unitCost));
                } catch {
                  return s;
                }
              }, new Decimal(0))
              .toFixed(2),
          )}
        </strong>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}
      <div className="sheet-actions">
        <Button type="button" variant="outline" onClick={draft.cancel}>
          Cancelar
        </Button>
        <Button disabled={command.isPending}>
          {command.isPending ? "Guardando…" : "Guardar pedido"}
        </Button>
      </div>
    </form>
  );
}
