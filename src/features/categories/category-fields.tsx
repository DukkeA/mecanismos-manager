"use client";
import { useState } from "react";
import { Choice, useQueryState } from "@/components/workshop-controls";
import { Field, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useCategories, useCategoryCommand } from "./hooks";
import { CategoryPicker, CategoryFormControl } from "./category-picker";
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
  return (
    <Field>
      <FieldLabel htmlFor="business-category">Categoría del trabajo</FieldLabel>
      <CategoryFormControl
        id="business-category"
        name="businessCategoryId"
        label="Categoría del trabajo"
        defaultValue={defaultValue}
      />
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
  const command = useCategoryCommand(),
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
            <CategoryPicker
              label="Categoría del trabajo"
              value={value ? [value] : []}
              onChange={(ids) => setValue(ids[0] ?? "")}
              disabled={command.isPending}
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
