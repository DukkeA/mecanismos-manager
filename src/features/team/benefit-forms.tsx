"use client";
import { useState } from "react";
import Decimal from "decimal.js";
import { Plus, Trash2 } from "lucide-react";
import { useFormSheet } from "@/components/form-sheet";
import { Choice, DateField, MonthField } from "@/components/workshop-controls";
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
import {
  leaveTreatments,
  leaveSlices,
  type AdvanceRow,
  type LeaveRow,
} from "@/domain/employee-benefits";
import { useSettings } from "@/features/attendance/hooks";
import { useCompensationHistory, useTeamCommand } from "./hooks";
import { cop, todayInBogota } from "@/features/cash/summary";
import type { OperationsView } from "@/domain/operations-view";

export type BenefitDialog = {
  kind:
    | "leave"
    | "leave-void"
    | "vacation"
    | "advance"
    | "advance-plan"
    | "advance-deduction"
    | "advance-void";
  memberId?: string;
  leave?: LeaveRow;
  advance?: AdvanceRow;
  installmentId?: string;
  reverse?: boolean;
};
export const benefitTitles: Record<BenefitDialog["kind"], string> = {
  leave: "Registrar permiso",
  "leave-void": "Anular permiso",
  vacation: "Ajustar vacaciones",
  advance: "Entregar anticipo",
  "advance-plan": "Cambiar cuotas",
  "advance-deduction": "Registrar descuento",
  "advance-void": "Anular anticipo y devolver dinero",
};
const descriptions: Record<BenefitDialog["kind"], string> = {
  leave:
    "El permiso queda autorizado al guardarlo. Elige si afecta el salario, las vacaciones o ninguno de los dos.",
  "leave-void":
    "Se conservará el registro y se retirará su descuento del cálculo mensual o del saldo de vacaciones.",
  vacation:
    "Registra el saldo inicial o corrige el saldo con un ajuste positivo o negativo. Cada ajuste conserva su motivo.",
  advance:
    "El dinero saldrá de la cuenta elegida. Define cuánto se descontará del salario en cada mes.",
  "advance-plan":
    "Distribuye el saldo pendiente entre los meses que acuerden. Las cuotas ya descontadas se conservan.",
  "advance-deduction":
    "Confirma que esta cuota se descontó al pagar el salario. Esta acción no mueve dinero entre cuentas.",
  "advance-void":
    "Úsalo cuando el desembolso se registró por error o el empleado devolvió todo el dinero. Se devolverá a la cuenta de origen.",
};
export const benefitDescription = (d: BenefitDialog) =>
  d.reverse
    ? "La cuota volverá a quedar pendiente. Se conservará el registro de la corrección."
    : descriptions[d.kind];

export function BenefitForm({
  dialog: d,
  data,
  onSaved,
}: {
  dialog: BenefitDialog;
  data: OperationsView;
  onSaved: () => void;
}) {
  const command = useTeamCommand(),
    draft = useFormSheet(),
    today = todayInBogota();
  const [requestId] = useState(() => crypto.randomUUID());
  const [memberId, setMember] = useState(d.memberId ?? ""),
    [treatment, setTreatment] = useState("PAID");
  const [from, setFrom] = useState(today),
    [to, setTo] = useState(today),
    [partial, setPartial] = useState("full");
  const [start, setStart] = useState("08:30"),
    [end, setEnd] = useState("10:30"),
    [note, setNote] = useState("");
  const [amount, setAmount] = useState(""),
    [accountId, setAccount] = useState(""),
    [days, setDays] = useState("");
  const [date, setDate] = useState(today),
    [error, setError] = useState("");
  const [plan, setPlan] = useState(
    () =>
      d.advance?.installments
        .filter((i) => !i.appliedOn && !i.cancelledAt)
        .map((i) => ({ period: i.period, amount: i.amount })) ?? [
        { period: today.slice(0, 7), amount: "" },
      ],
  );
  const settings = useSettings(),
    rates = useCompensationHistory(d.kind === "leave" ? memberId : undefined);
  const isPlan = ["advance", "advance-plan"].includes(d.kind);
  const target = d.kind === "advance-plan" ? d.advance!.balance : amount;
  const total = plan.reduce(
    (s, p) => s.plus(/^\d+(\.\d{0,2})?$/.test(p.amount) ? p.amount : 0),
    new Decimal(0),
  );
  let preview: {
    minutes: number;
    vacation: string;
    deduction: string | null;
  } | null = null;
  if (d.kind === "leave" && settings.data && from && to) {
    try {
      const slices = leaveSlices(
        {
          requestId,
          memberId,
          treatment: treatment as "PAID",
          from,
          to,
          start: partial === "full" ? "00:00" : start,
          end: partial === "full" ? "23:59" : end,
          note,
        },
        settings.data,
      );
      let deduction: Decimal | null = new Decimal(0);
      for (const day of slices.days) {
        const rate = rates.data?.find(
          (r) => r.effectiveOn <= day.workedOn.toISOString().slice(0, 10),
        );
        if (
          !rate?.monthlySalary ||
          !rate.monthlyHours ||
          Number(rate.monthlySalary) <= 0
        ) {
          deduction = null;
          break;
        }
        deduction = deduction.plus(
          new Decimal(rate.monthlySalary)
            .div(rate.monthlyHours)
            .mul(day.minutes)
            .div(60)
            .toDecimalPlaces(2),
        );
      }
      preview = {
        minutes: slices.days.reduce((s, d) => s + d.minutes, 0),
        vacation: slices.days
          .reduce((s, d) => s.plus(d.vacationDays), new Decimal(0))
          .toString(),
        deduction: deduction?.toFixed(2) ?? null,
      };
    } catch {
      /* Dates are still being selected. The server validates the final range. */
    }
  }
  const setPlanRow = (index: number, key: "period" | "amount", value: string) =>
    setPlan((rows) =>
      rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)),
    );
  return (
    <form
      className="sheet-body operation-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (command.isPending) return;
        setError("");
        const common = { requestId, reason: note };
        const input =
          d.kind === "leave"
            ? {
                requestId,
                memberId,
                treatment,
                from,
                to,
                start: partial === "full" ? "00:00" : start,
                end: partial === "full" ? "23:59" : end,
                note,
              }
            : d.kind === "vacation"
              ? { requestId, memberId, days, note }
              : d.kind === "leave-void"
                ? { ...common, id: d.leave!.id }
                : d.kind === "advance"
                  ? {
                      requestId,
                      memberId,
                      accountId,
                      amount,
                      disbursedOn: date,
                      note,
                      installments: plan,
                    }
                  : {
                      ...common,
                      id: d.advance!.id,
                      version: d.advance!.version,
                      ...(d.kind === "advance-plan"
                        ? { installments: plan }
                        : d.kind === "advance-void"
                          ? { occurredOn: date }
                          : {
                              installmentId: d.installmentId,
                              reverse: !!d.reverse,
                              appliedOn: date,
                            }),
                    };
        try {
          await command.mutateAsync({ kind: d.kind, input });
          draft.saved();
          onSaved();
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <FieldGroup>
        {["leave", "vacation", "advance"].includes(d.kind) && (
          <Field>
            <FieldLabel htmlFor="benefit-person">Empleado</FieldLabel>
            <Choice
              id="benefit-person"
              required
              value={memberId}
              onChange={setMember}
              options={data.members
                .filter((m) => m.active)
                .map((m) => ({ id: m.id, label: m.name }))}
            />
          </Field>
        )}
        {d.kind === "leave" && (
          <>
            <Field>
              <FieldLabel htmlFor="leave-treatment">
                Cómo se registra
              </FieldLabel>
              <Choice
                id="leave-treatment"
                value={treatment}
                onChange={setTreatment}
                options={Object.entries(leaveTreatments).map(([id, label]) => ({
                  id,
                  label,
                }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="leave-from">Desde</FieldLabel>
                <DateField
                  id="leave-from"
                  value={from}
                  onChange={(v) => {
                    setFrom(v);
                    if (v > to) setTo(v);
                    draft.change();
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="leave-to">Hasta</FieldLabel>
                <DateField
                  id="leave-to"
                  value={to}
                  onChange={(v) => {
                    setTo(v);
                    draft.change();
                  }}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="leave-duration">Duración</FieldLabel>
              <Choice
                id="leave-duration"
                value={partial}
                onChange={setPartial}
                options={[
                  { id: "full", label: "Jornadas completas" },
                  { id: "partial", label: "Indicar horas de inicio y fin" },
                ]}
              />
            </Field>
            {partial === "partial" && (
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="leave-start">Hora inicial</FieldLabel>
                  <Input
                    id="leave-start"
                    type="time"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="leave-end">Hora final</FieldLabel>
                  <Input
                    id="leave-end"
                    type="time"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    required
                  />
                </Field>
              </div>
            )}
            {preview && (
              <div
                className="rounded-lg bg-muted p-4 text-sm"
                aria-live="polite"
              >
                <p>
                  {(preview.minutes / 60).toLocaleString("es-CO", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  horas de trabajo autorizadas
                </p>
                <p className="mt-1 font-semibold">
                  {treatment === "HOURS"
                    ? preview.deduction
                      ? `${cop(preview.deduction)} de descuento salarial`
                      : "Falta un salario vigente para calcular el descuento"
                    : treatment === "VACATION"
                      ? `${preview.vacation} días de vacaciones`
                      : "Sin descuento de salario ni vacaciones"}
                </p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Se cuentan las horas del horario configurado, incluido el sábado.
              Los domingos se excluyen. Los festivos no se excluyen
              automáticamente.
            </p>
          </>
        )}
        {d.kind === "vacation" && (
          <Field>
            <FieldLabel htmlFor="vacation-days">
              Días por añadir o restar
            </FieldLabel>
            <Input
              id="vacation-days"
              type="number"
              step="0.0001"
              min="-9999"
              max="9999"
              required
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
            <FieldDescription>
              Ejemplo: 15 para el saldo inicial, 2 para sumar o −1 para restar.
              El saldo no aumenta automáticamente cada mes.
            </FieldDescription>
          </Field>
        )}
        {d.kind === "advance" && (
          <>
            <Field>
              <FieldLabel htmlFor="advance-account">
                Cuenta de salida
              </FieldLabel>
              <Choice
                id="advance-account"
                required
                value={accountId}
                onChange={setAccount}
                options={data.accounts.map((a) => ({
                  id: a.id,
                  label: `${a.name} · ${cop(a.balance)}`,
                }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="advance-amount">Anticipo (COP)</FieldLabel>
              <Input
                id="advance-amount"
                inputMode="decimal"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (plan.length === 1)
                    setPlanRow(0, "amount", e.target.value);
                }}
              />
            </Field>
          </>
        )}
        {["advance", "advance-void", "advance-deduction"].includes(d.kind) &&
          !d.reverse && (
            <Field>
              <FieldLabel htmlFor="benefit-date">
                {d.kind === "advance"
                  ? "Fecha del desembolso"
                  : d.kind === "advance-void"
                    ? "Fecha de devolución"
                    : "Fecha en que se descontó"}
              </FieldLabel>
              <DateField
                id="benefit-date"
                value={date}
                onChange={(v) => {
                  setDate(v);
                  draft.change();
                }}
              />
            </Field>
          )}
        {isPlan && (
          <fieldset className="space-y-4">
            <legend className="mb-3 font-semibold">Cuotas por mes</legend>
            {plan.map((row, index) => (
              <div key={index} className="flex items-end gap-2">
                <Field className="min-w-0 flex-1">
                  <FieldLabel htmlFor={`quota-period-${index}`}>Mes</FieldLabel>
                  <MonthField
                    id={`quota-period-${index}`}
                    value={row.period}
                    onChange={(value) => setPlanRow(index, "period", value)}
                  />
                </Field>
                <Field className="min-w-0 flex-1">
                  <FieldLabel htmlFor={`quota-amount-${index}`}>
                    Descuento (COP)
                  </FieldLabel>
                  <Input
                    id={`quota-amount-${index}`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={row.amount}
                    onChange={(e) =>
                      setPlanRow(index, "amount", e.target.value)
                    }
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Eliminar cuota ${index + 1}`}
                  disabled={plan.length === 1}
                  onClick={() => {
                    setPlan((p) => p.filter((_, i) => i !== index));
                    draft.change();
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={plan.length >= 120}
                onClick={() => {
                  const last = plan.at(-1)?.period;
                  const next = new Date(
                    `${last || today.slice(0, 7)}-01T12:00:00Z`,
                  );
                  next.setUTCMonth(next.getUTCMonth() + 1);
                  setPlan((p) => [
                    ...p,
                    { period: next.toISOString().slice(0, 7), amount: "" },
                  ]);
                  draft.change();
                }}
              >
                <Plus />
                Añadir mes
              </Button>
              <span className="text-sm tabular-nums">
                {cop(total.toFixed(2))} de {cop(target || "0")}
              </span>
            </div>
            {target &&
              /^\d+(\.\d{0,2})?$/.test(target) &&
              !total.eq(target) && (
                <p className="text-sm text-destructive">
                  Faltan por distribuir{" "}
                  {cop(new Decimal(target).minus(total).toFixed(2))}.
                </p>
              )}
          </fieldset>
        )}
        {d.kind === "advance-deduction" && (
          <div className="rounded-lg bg-muted p-4">
            <p className="font-semibold">{d.advance!.name}</p>
            <p>
              {cop(
                d.advance!.installments.find((i) => i.id === d.installmentId)!
                  .amount,
              )}{" "}
              ·{" "}
              {
                d.advance!.installments.find((i) => i.id === d.installmentId)!
                  .period
              }
            </p>
          </div>
        )}
        <Field>
          <FieldLabel htmlFor="benefit-note">
            {d.kind === "leave"
              ? "Motivo del permiso"
              : "Motivo u observaciones"}
          </FieldLabel>
          <Textarea
            id="benefit-note"
            minLength={5}
            maxLength={1000}
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </FieldGroup>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}
      <div className="form-actions">
        <Button type="button" variant="outline" onClick={draft.cancel}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={
            command.isPending ||
            (isPlan &&
              (!target ||
                !/^\d+(\.\d{0,2})?$/.test(target) ||
                !total.eq(target)))
          }
        >
          {command.isPending
            ? "Guardando…"
            : d.reverse
              ? "Revertir descuento"
              : benefitTitles[d.kind]}
        </Button>
      </div>
    </form>
  );
}
