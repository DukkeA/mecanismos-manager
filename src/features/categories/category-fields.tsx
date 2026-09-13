"use client";
import { useState } from "react";
import { Choice, useQueryState } from "@/components/workshop-controls";
import { Field, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useCategories, useCategoryCommand } from "./hooks";
import type { OrderView } from "@/domain/workshop-view";

export function CategoryFilter() {
  const query = useCategories(),
    [value, setValue] = useQueryState("businessCategoryId", "ALL");
  return (
    <label>
      Categoría
      <Choice
        value={value}
        onChange={setValue}
        options={[
          { id: "ALL", label: "Todas las categorías" },
          { id: "NONE", label: "Sin categoría" },
          ...(query.data ?? []).map((c) => ({ id: c.id, label: c.name })),
        ]}
      />
    </label>
  );
}
export function CategoryField({ defaultValue }: { defaultValue?: string }) {
  const query = useCategories();
  return (
    <Field>
      <FieldLabel htmlFor="business-category">Categoría del trabajo</FieldLabel>
      <Choice
        id="business-category"
        name="businessCategoryId"
        required
        defaultValue={defaultValue ?? ""}
        options={[
          { id: "", label: "Seleccionar categoría" },
          ...(query.data ?? [])
            .filter((c) => c.active || c.id === defaultValue)
            .map((c) => ({ id: c.id, label: c.name })),
        ]}
      />
      {query.error && <p role="alert">{query.error.message}</p>}
    </Field>
  );
}
export function OrderCategory({
  order,
  canEdit,
}: {
  order: OrderView;
  canEdit: boolean;
}) {
  const query = useCategories(),
    command = useCategoryCommand(),
    [value, setValue] = useState(order.businessCategoryId ?? "");
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">
        Categoría del trabajo
      </span>
      {canEdit &&
      !order.businessCategoryLocked &&
      !["CLOSED", "CANCELLED"].includes(order.status) ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Choice
              label="Categoría del trabajo"
              value={value}
              onChange={setValue}
              options={[
                { id: "", label: "Seleccionar categoría" },
                ...(query.data ?? [])
                  .filter((c) => c.active || c.id === order.businessCategoryId)
                  .map((c) => ({ id: c.id, label: c.name })),
              ]}
            />
            <Button
              variant="outline"
              disabled={
                !value ||
                value === order.businessCategoryId ||
                command.isPending
              }
              onClick={() =>
                command.mutate({
                  kind: "order",
                  input: {
                    requestId: crypto.randomUUID(),
                    orderId: order.id,
                    version: order.version ?? 0,
                    businessCategoryId: value,
                  },
                })
              }
            >
              Guardar categoría
            </Button>
          </div>
          {command.error && (
            <p role="alert" className="text-sm text-destructive">
              {command.error.message}
            </p>
          )}
        </>
      ) : (
        <strong>{order.businessCategory ?? "Sin categoría"}</strong>
      )}
    </div>
  );
}
