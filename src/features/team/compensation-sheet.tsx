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
import { useCompensationHistory, useTeamCommand } from "./hooks";
import type { OperationsView } from "@/domain/operations-view";
import { todayInBogota, cop } from "@/features/cash/summary";
import { dateLabel } from "@/components/workshop-controls";

export function CompensationSheet({
  member,
  history,
  onClose,
}: {
  member: OperationsView["members"][number] | null;
  history: ReturnType<typeof useCompensationHistory>;
  onClose: () => void;
}) {
  const command = useTeamCommand();
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
          <SheetTitle>Salario de {member?.name}</SheetTitle>
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
                  submitLabel: "Guardar salario",
                  extra: {
                    memberId: member.id,
                    monthlySalary: latest?.monthlySalary ?? "",
                    monthlyEmployerCost: latest?.monthlyEmployerCost ?? "0",
                    monthlyHours: latest?.monthlyHours ?? "210",
                    effectiveOn: nextDate,
                  },
                  fields: [
                    {
                      key: "monthlySalary",
                      label: "Salario mensual (COP)",
                      type: "money",
                      allowZero: true,
                      hint: "Usa 0 si la persona no recibe salario fijo.",
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
                      label: "Motivo u observaciones",
                      type: "textarea",
                    },
                  ],
                }}
                submit={async (input) => {
                  await command.mutateAsync({ kind: "compensation", input });
                  onClose();
                  toast.success("Salario guardado.");
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
