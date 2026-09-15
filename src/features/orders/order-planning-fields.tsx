"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Choice } from "@/components/workshop-controls";
import type { OperationsView } from "@/domain/operations-view";

export function OrderPlanningFields({
  members,
}: {
  members: OperationsView["members"];
}) {
  const [responsible, setResponsible] = useState("");
  const [tasks, setTasks] = useState<
    { id: string; title: string; memberId: string; minutes: string }[]
  >([]);
  const options = members
    .filter((m) => m.active)
    .map((m) => ({ id: m.id, label: m.name }));
  function change(id: string, patch: Partial<(typeof tasks)[number]>) {
    setTasks((previous) =>
      previous.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
  }
  return (
    <FieldSet>
      <FieldLegend>Responsable y tareas</FieldLegend>
      <Field>
        <FieldLabel htmlFor="order-responsible">
          Responsable de la orden
        </FieldLabel>
        <Choice
          id="order-responsible"
          name="responsibleId"
          value={responsible}
          onChange={setResponsible}
          options={[{ id: "", label: "Sin asignar todavía" }, ...options]}
        />
        <FieldDescription>
          La orden aparecerá entre sus asignaciones al ingresar.
        </FieldDescription>
      </Field>
      <input
        type="hidden"
        name="initialTasks"
        value={JSON.stringify(
          tasks.map((t) => ({
            title: t.title,
            memberId: t.memberId || responsible,
            ...(t.minutes ? { plannedMinutes: Number(t.minutes) } : {}),
          })),
        )}
      />
      {tasks.map((t, index) => (
        <FieldSet key={t.id} className="rounded-lg border p-4">
          <FieldLegend>Tarea {index + 1}</FieldLegend>
          <Field>
            <FieldLabel htmlFor={`title-${t.id}`}>
              Trabajo a realizar
            </FieldLabel>
            <Input
              id={`title-${t.id}`}
              value={t.title}
              required
              minLength={3}
              maxLength={250}
              onChange={(e) => change(t.id, { title: e.target.value })}
              placeholder="Ej. Probar bomba en banco"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`member-${t.id}`}>Asignar a</FieldLabel>
            <Choice
              id={`member-${t.id}`}
              value={t.memberId || responsible}
              required
              onChange={(memberId) => change(t.id, { memberId })}
              options={[
                { id: "", label: "Selecciona un empleado" },
                ...options,
              ]}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`minutes-${t.id}`}>
              Minutos previstos (opcional)
            </FieldLabel>
            <Input
              id={`minutes-${t.id}`}
              type="number"
              min={1}
              max={43200}
              value={t.minutes}
              onChange={(e) => change(t.id, { minutes: e.target.value })}
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setTasks(tasks.filter((row) => row.id !== t.id))}
          >
            <Trash2 data-icon="inline-start" />
            Quitar tarea
          </Button>
        </FieldSet>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={!options.length || tasks.length >= 30}
        onClick={() =>
          setTasks([
            ...tasks,
            {
              id: crypto.randomUUID(),
              title: "",
              memberId: responsible,
              minutes: "",
            },
          ])
        }
      >
        <Plus data-icon="inline-start" />
        Añadir tarea
      </Button>
      {!options.length && (
        <FieldDescription>
          Registra un empleado en Equipo para asignar tareas.
        </FieldDescription>
      )}
    </FieldSet>
  );
}
