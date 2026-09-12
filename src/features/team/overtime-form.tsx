"use client";
import { useState } from "react";
import { useFormSheet } from "@/components/form-sheet";
import { Choice, DateField } from "@/components/workshop-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { useCompensationHistory, useTeamCommand } from "./hooks";
import { todayInBogota, cop } from "@/features/cash/summary";
import { overtimePay } from "@/domain/team";
import Decimal from "decimal.js";
import type { OperationsView } from "@/domain/operations-view";
import type { OrderView } from "@/domain/workshop-view";

export function OvertimeForm({
  data,
  orders,
  onSaved,
}: {
  data: OperationsView;
  orders: OrderView[];
  onSaved: () => void;
}) {
  const draft = useFormSheet(),
    command = useTeamCommand();
  const [memberId, setMemberId] = useState(""),
    [workedOn, setWorkedOn] = useState(todayInBogota()),
    [kind, setKind] = useState("FIXED"),
    [fixedPay, setFixedPay] = useState("");
  const [taskId, setTaskId] = useState(""),
    [minutes, setMinutes] = useState("60"),
    [surcharge, setSurcharge] = useState("25"),
    [employerCost, setEmployerCost] = useState("0"),
    [note, setNote] = useState(""),
    [error, setError] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const history = useCompensationHistory(memberId);
  const rate = history.data?.find((r) => r.effectiveOn <= workedOn);
  const hourly =
    rate?.monthlySalary && rate.monthlyHours && Number(rate.monthlySalary) > 0
      ? new Decimal(rate.monthlySalary).div(rate.monthlyHours).toFixed(6)
      : null;
  const validAmount =
    hourly &&
    Number(minutes) > 0 &&
    Number.isFinite(Number(surcharge)) &&
    Number(surcharge) >= 0;
  const amount =
    kind === "FIXED"
      ? Number(fixedPay) > 0
        ? fixedPay
        : null
      : validAmount
        ? overtimePay(hourly, Number(minutes), Number(surcharge))
        : null;
  const tasks = data.tasks.filter(
    (t) =>
      t.members.includes(memberId) &&
      (!t.orderId ||
        !orders.some(
          (o) =>
            o.id === t.orderId && ["CLOSED", "CANCELLED"].includes(o.status),
        )),
  );
  return (
    <form
      className="sheet-body operation-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (command.isPending) return;
        setError("");
        try {
          await command.mutateAsync({
            kind: "overtime",
            input: {
              requestId,
              memberId,
              workedOn,
              kind,
              ...(taskId && taskId !== "__none" ? { taskId } : {}),
              minutes: kind === "FIXED" ? 0 : Number(minutes),
              ...(kind === "FIXED" ? { pay: fixedPay } : {}),
              surchargePercent: kind === "FIXED" ? 0 : Number(surcharge),
              employerCost,
              note,
            },
          });
          draft.saved();
          onSaved();
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "No se pudo guardar el bono.",
          );
        }
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="extra-person">Empleado</FieldLabel>
          <Choice
            id="extra-person"
            value={memberId}
            onChange={(id) => {
              setMemberId(id);
              setTaskId("");
              draft.change();
            }}
            options={data.members
              .filter((m) => m.active)
              .map((m) => ({ id: m.id, label: m.name }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="extra-date">Fecha</FieldLabel>
          <DateField
            id="extra-date"
            value={workedOn}
            onChange={(date) => {
              setWorkedOn(date);
              draft.change();
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="extra-task">Tarea relacionada</FieldLabel>
          <Choice
            id="extra-task"
            value={taskId}
            onChange={(id) => {
              setTaskId(id);
              draft.change();
            }}
            options={[
              { id: "", label: "Trabajo general del taller" },
              ...tasks.map((t) => ({ id: t.id, label: t.title })),
            ]}
          />
          <FieldDescription>
            Si eliges una tarea, el valor se suma al costo de su orden.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="extra-mode">Cálculo del bono</FieldLabel>
          <Choice
            id="extra-mode"
            value={kind === "FIXED" ? "FIXED" : "HOURLY"}
            onChange={(v) => {
              setKind(v === "FIXED" ? "FIXED" : "DAY");
              setSurcharge("25");
              draft.change();
            }}
            options={[
              { id: "FIXED", label: "Importe fijo" },
              { id: "HOURLY", label: "Horas según salario" },
            ]}
          />
        </Field>
        {kind === "FIXED" ? (
          <Field>
            <FieldLabel htmlFor="extra-fixed">Valor del bono (COP)</FieldLabel>
            <Input
              id="extra-fixed"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={fixedPay}
              onChange={(e) => setFixedPay(e.target.value)}
            />
            <FieldDescription>
              No depende del salario ni suma horas trabajadas.
            </FieldDescription>
          </Field>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="extra-minutes">Minutos extra</FieldLabel>
                <Input
                  id="extra-minutes"
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  required
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="extra-kind">Tipo</FieldLabel>
                <Choice
                  id="extra-kind"
                  value={kind}
                  onChange={(value) => {
                    setKind(value);
                    setSurcharge(value === "NIGHT" ? "75" : "25");
                    draft.change();
                  }}
                  options={[
                    { id: "DAY", label: "Diurnas" },
                    { id: "NIGHT", label: "Nocturnas" },
                  ]}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="extra-surcharge">Recargo (%)</FieldLabel>
              <Input
                id="extra-surcharge"
                type="number"
                min={0}
                max={300}
                step="0.01"
                value={surcharge}
                onChange={(e) => setSurcharge(e.target.value)}
                required
              />
              <FieldDescription>
                Se suma al valor de la hora ordinaria. Ajusta el porcentaje
                cuando corresponda otro recargo.
              </FieldDescription>
            </Field>
          </>
        )}
        <Field>
          <FieldLabel htmlFor="extra-employer">
            Costo adicional de la empresa (COP)
          </FieldLabel>
          <Input
            id="extra-employer"
            type="number"
            min={0}
            step="0.01"
            value={employerCost}
            onChange={(e) => setEmployerCost(e.target.value)}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="extra-note">
            Motivo del bono o trabajo adicional
          </FieldLabel>
          <Textarea
            id="extra-note"
            minLength={5}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
          />
        </Field>
      </FieldGroup>
      {memberId && (
        <div className="rounded-lg bg-muted p-4" aria-live="polite">
          {kind !== "FIXED" && history.isPending ? (
            "Consultando salario…"
          ) : kind !== "FIXED" && history.isError ? (
            history.error.message
          ) : amount !== null ? (
            <>
              <p className="text-sm">Valor a reconocer</p>
              <strong className="text-2xl tabular-nums">{cop(amount)}</strong>
              <p className="text-sm text-muted-foreground">
                {kind !== "FIXED" &&
                  `${cop(hourly!)} por hora + ${surcharge}% de recargo. `}
                Costo adicional: {cop(employerCost || 0)}.
              </p>
            </>
          ) : (
            "Falta un salario mensual mayor que cero para esa fecha. Configúralo en Personal y salarios."
          )}
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}
      <div className="form-actions">
        <Button variant="outline" type="button" onClick={draft.cancel}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={command.isPending || !amount || !memberId}
        >
          {command.isPending ? "Guardando…" : "Registrar bono"}
        </Button>
      </div>
    </form>
  );
}
