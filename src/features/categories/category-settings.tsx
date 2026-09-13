"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  useCategories,
  useCategoryCommand,
  type BusinessCategory,
} from "./hooks";
import { Button } from "@/components/ui/button";
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
    [editing, setEditing] = useState<BusinessCategory | "new" | null>(null);
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Categorías del taller</h2>
          <p className="mt-1 text-muted-foreground">
            Agrupan repuestos, servicios y trabajos en Rentabilidad.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus />
          Nueva categoría
        </Button>
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
            <SheetTitle>
              {editing === "new" ? "Nueva categoría" : "Editar categoría"}
            </SheetTitle>
            <SheetDescription>
              Nombre usado en el catálogo y los informes.
            </SheetDescription>
          </SheetHeader>
          <OperationForm
            dialog={{
              kind: "category",
              title: "Categoría",
              extra:
                editing && editing !== "new"
                  ? { ...editing }
                  : { active: true },
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
