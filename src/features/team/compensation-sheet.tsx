"use client";
import { toast } from "sonner";
import { FormSheet } from "@/components/form-sheet";
import { OperationForm } from "@/components/operation-form";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { useCompensationHistory, useTeamMutation } from "./hooks";
import type { OperationsView } from "@/domain/operations-view";
import { todayInBogota, cop } from "@/features/cash/summary";
import { dateLabel } from "@/components/workshop-controls";

export function CompensationSheet({
  role,
  member,
  history,
  onClose,
}: {
  role: import("@/domain/permissions").Role;
  member: OperationsView["members"][number] | null;
  history: ReturnType<typeof useCompensationHistory>;
  onClose: () => void;
}) {
  const command = useTeamMutation();
  const latest = history.data?.[0];
  let nextDate = todayInBogota();
  if (latest && latest.effectiveOn >= nextDate) {
    const date = new Date(`${latest.effectiveOn}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    nextDate = date.toISOString().slice(0, 10);
  }
  return (
    <FormSheet
      open={!!member}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="dossier-sheet">
        <SheetHeader>
          <SheetTitle>Editar empleado</SheetTitle>
          <SheetDescription>
            El costo por hora se obtiene del salario y los costos adicionales,
            divididos entre las horas mensuales.
          </SheetDescription>
        </SheetHeader>
        {member &&
          (history.isPending ? (
            <Skeleton className="m-6 h-52" />
          ) : history.isError ? (
            <Alert variant="destructive">
              <AlertTitle>{history.error.message}</AlertTitle>
            </Alert>
          ) : (
            <>
              <OperationForm
                key={`${member.id}-${latest?.id ?? "new"}`}
                dialog={{
                  kind: "compensation",
                  title: "Salario mensual",
                  submitLabel: "Guardar cambios",
                  extra: {
                    ...member,
                    monthlySalary: latest?.monthlySalary ?? "",
                    monthlyEmployerCost: latest?.monthlyEmployerCost ?? "0",
                    monthlyHours: latest?.monthlyHours ?? "210",
                    effectiveOn: nextDate,
                  },
                  fields: [
                    { key: "name", label: "Nombre" },
                    ...(role === "ADMIN"
                      ? [
                          {
                            key: "email",
                            label: "Correo",
                            type: "email" as const,
                          },
                        ]
                      : []),
                    {
                      key: "role",
                      label: "Rol",
                      type: "select",
                      options:
                        role === "OFFICE"
                          ? [
                              {
                                id: member.role!,
                                label:
                                  member.role === "ADMIN"
                                    ? "Administrador"
                                    : member.role === "OFFICE"
                                      ? "Oficina"
                                      : "Mecánico",
                              },
                            ]
                          : [
                              { id: "ADMIN", label: "Administrador" },
                              { id: "OFFICE", label: "Oficina" },
                              { id: "MECHANIC", label: "Mecánico" },
                            ],
                    },
                    {
                      key: "monthlySalary",
                      label: "Salario mensual (COP)",
                      optional: !latest,
                      type: "money",
                      allowZero: true,
                      hint: latest
                        ? "Usa 0 si la persona no recibe salario fijo."
                        : "Puedes dejarlo pendiente. Usa 0 si no recibe salario fijo.",
                    },
                    {
                      key: "monthlyEmployerCost",
                      label: "Otros costos mensuales de la empresa (COP)",
                      type: "money",
                      allowZero: true,
                      hint: "Aportes, prestaciones, auxilios y otros costos que quieras incluir.",
                    },
                    {
                      key: "monthlyHours",
                      label: "Horas mensuales para el cálculo",
                      type: "quantity",
                      hint: "Divisor del salario para obtener el valor de una hora. Ajustable por empleado.",
                    },
                    {
                      key: "effectiveOn",
                      label: "Vigente desde",
                      type: "date",
                    },
                    {
                      key: "note",
                      label: "Motivo del cambio salarial",
                      optional: true,
                      hint: "Obligatorio si cambias el salario o sus costos.",
                      type: "textarea",
                    },
                  ],
                }}
                submit={async (input) => {
                  const changed =
                    String(input.monthlySalary ?? "").trim() !== "" &&
                    [
                      "monthlySalary",
                      "monthlyEmployerCost",
                      "monthlyHours",
                    ].some(
                      (key) =>
                        Number(input[key]) !==
                        Number(latest?.[key as "monthlySalary"] ?? -1),
                    );
                  await command.mutateAsync({
                    kind: "member",
                    input: {
                      id: member.id,
                      name: input.name,
                      email: input.email,
                      role: input.role,
                      active: member.active,
                      ...(changed
                        ? {
                            compensation: {
                              monthlySalary: input.monthlySalary,
                              monthlyEmployerCost: input.monthlyEmployerCost,
                              monthlyHours: input.monthlyHours,
                              effectiveOn: input.effectiveOn,
                              note: input.note,
                            },
                          }
                        : {}),
                    },
                  });
                  onClose();
                  toast.success("Empleado actualizado.");
                }}
              />
              <section className="mx-6 mb-6 border-t pt-5">
                <h3 className="mb-3 font-semibold">Historial salarial</h3>
                {history.data?.length ? (
                  <ul className="detail-list">
                    {history.data.map((rate) => (
                      <li key={rate.id}>
                        <strong>Desde {dateLabel(rate.effectiveOn)}</strong>
                        <p>
                          {rate.monthlySalary !== null
                            ? `${cop(rate.monthlySalary)} al mes · ${rate.monthlyHours} horas`
                            : `Tarifa histórica: ${cop(rate.hourlyCost)} por hora`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {rate.monthlyEmployerCost !== null &&
                            `${cop(rate.monthlyEmployerCost)} de costos adicionales. `}
                          {rate.note}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Aún no tiene salario registrado.
                  </p>
                )}
              </section>
            </>
          ))}
      </SheetContent>
    </FormSheet>
  );
}
