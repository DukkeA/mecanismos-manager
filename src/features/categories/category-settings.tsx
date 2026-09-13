"use client";
import { useState } from "react";
import { toast } from "sonner";
import {
  useCategories,
  useCategoryCommand,
  type BusinessCategory,
} from "./hooks";
import { Badge } from "@/components/ui/badge";
import { RowActions } from "@/components/row-actions";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { FormSheet } from "@/components/form-sheet";
import { OperationForm } from "@/components/operation-form";
export function CategorySettings() {
  const query = useCategories(),
    command = useCategoryCommand(),
    [editing, setEditing] = useState<BusinessCategory | null>(null);
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Categorías del taller</h2>
          <p className="mt-1 text-muted-foreground">
            Crea categorías desde los formularios de órdenes, repuestos,
            servicios o proveedores.
          </p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Desactivar una categoría impide asignarla a nuevos registros. Su
        historial se conserva. Al cambiar el nombre, también cambia en los
        informes anteriores.
      </p>
      {query.error && <p role="alert">{query.error.message}</p>}
      <ul className="divide-y">
        {query.data?.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between gap-3 py-3"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium">{c.name}</span>
              {!c.active && <Badge variant="secondary">Inactiva</Badge>}
            </div>
            <RowActions
              name={c.name}
              actions={[
                { label: "Editar", run: () => setEditing(c) },
                {
                  label: c.active ? "Desactivar" : "Reactivar",
                  run: async () => {
                    try {
                      await command.mutateAsync({
                        kind: "save",
                        input: {
                          ...c,
                          active: !c.active,
                          requestId: crypto.randomUUID(),
                        },
                      });
                      toast.success(
                        c.active
                          ? "Categoría desactivada."
                          : "Categoría reactivada.",
                      );
                    } catch {
                      /* Shown below. */
                    }
                  },
                },
              ]}
            />
          </li>
        ))}
      </ul>
      {command.error && (
        <p role="alert" className="text-destructive">
          {command.error.message}
        </p>
      )}
      <FormSheet
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <SheetContent className="dossier-sheet">
          <SheetHeader>
            <SheetTitle>Editar categoría</SheetTitle>
            <SheetDescription>
              Nombre usado en el catálogo y los informes.
            </SheetDescription>
          </SheetHeader>
          <OperationForm
            dialog={{
              kind: "category",
              title: "Categoría",
              extra: editing ? { ...editing } : undefined,
              fields: [
                {
                  key: "name",
                  label: "Nombre",
                  hint: "Por ejemplo, Bombas de inyección.",
                },
              ],
            }}
            submit={async (input) => {
              await command.mutateAsync({ kind: "save", input });
              setEditing(null);
              toast.success("Categoría guardada.");
            }}
          />
        </SheetContent>
      </FormSheet>
    </section>
  );
}
