import { z } from "zod";
import Decimal from "decimal.js";
import { positiveMoney } from "./commercial";
import { scheduleForDate, type WorkshopSettings } from "./workshop-settings";

export const leaveTreatments = {
  HOURS: "Descontar del salario",
  VACATION: "Descontar de vacaciones",
  PAID: "Sin descuento",
} as const;
export const periodInput = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const installmentInput = z
  .array(z.object({ period: periodInput, amount: positiveMoney }))
  .min(1)
  .max(120);
export const leaveInput = z.object({
  requestId: z.uuid(),
  memberId: z.uuid(),
  treatment: z.enum(["HOURS", "VACATION", "PAID"]),
  from: z.iso.date(),
  to: z.iso.date(),
  start: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default("00:00"),
  end: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default("23:59"),
  note: z.string().trim().min(5).max(1000),
});
export function leaveSlices(
  p: z.infer<typeof leaveInput>,
  settings: WorkshopSettings,
) {
  const startsAt = new Date(`${p.from}T${p.start}:00-05:00`),
    endsAt = new Date(`${p.to}T${p.end}:00-05:00`);
  if (
    endsAt <= startsAt ||
    endsAt.getTime() - startsAt.getTime() > 366 * 86400000
  )
    throw new Error(
      "Revisa las fechas y horas. El permiso debe durar como máximo un año.",
    );
  const days: {
    workedOn: Date;
    startsAt: Date;
    endsAt: Date;
    minutes: number;
    vacationDays: string;
  }[] = [];
  for (
    const date = new Date(`${p.from}T00:00:00Z`);
    date.getTime() <= new Date(`${p.to}T00:00:00Z`).getTime();
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const iso = date.toISOString().slice(0, 10),
      schedule = scheduleForDate(settings, iso);
    if (!schedule) continue;
    const midnight = new Date(`${iso}T00:00:00-05:00`).getTime();
    const start = Math.max(
      startsAt.getTime(),
      midnight + schedule.startMinute * 60000,
    );
    const end = Math.min(
      endsAt.getTime(),
      midnight + schedule.endMinute * 60000,
    );
    const minutes = Math.max(0, (end - start) / 60000);
    if (minutes)
      days.push({
        workedOn: new Date(date),
        startsAt: new Date(start),
        endsAt: new Date(end),
        minutes,
        vacationDays: new Decimal(minutes)
          .div(schedule.endMinute - schedule.startMinute)
          .toFixed(4),
      });
  }
  if (!days.length)
    throw new Error(
      "El permiso no coincide con horas de trabajo de lunes a sábado.",
    );
  return { startsAt, endsAt, days };
}
export function validateInstallments(
  plan: z.infer<typeof installmentInput>,
  amount: string,
  earliest: string,
) {
  if (plan.some((p) => p.period < earliest))
    throw new Error("Las cuotas no pueden ser anteriores al desembolso.");
  if (new Set(plan.map((p) => p.period)).size !== plan.length)
    throw new Error("Agrupa en una sola cuota los descuentos de un mismo mes.");
  if (!plan.reduce((s, p) => s.plus(p.amount), new Decimal(0)).eq(amount))
    throw new Error(
      "La suma de las cuotas debe coincidir con el saldo por descontar.",
    );
}

export type LeaveRow = {
  id: string;
  memberId: string;
  name: string;
  treatment: keyof typeof leaveTreatments;
  startsAt: string;
  endsAt: string;
  note: string;
  voidedAt: string | null;
  voidReason: string | null;
  minutes: number;
  vacationDays: string;
  salaryDeduction: string;
};
export type AdvanceRow = {
  id: string;
  memberId: string;
  name: string;
  amount: string;
  balance: string;
  disbursedOn: string;
  note: string;
  version: number;
  voidedAt: string | null;
  voidReason: string | null;
  account: string;
  installments: {
    id: string;
    period: string;
    amount: string;
    appliedOn: string | null;
    cancelledAt: string | null;
  }[];
};
export type BenefitPage<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};
export type VacationAccount = {
  memberId: string;
  name: string;
  adjustments: string;
  used: string;
  balance: string;
  history: { id: string; days: string; note: string; createdAt: string }[];
};
export type PayrollPreview = {
  period: string;
  unassigned?: {
    id: string;
    amount: string;
    accountId: string;
    account: string;
    occurredOn: string;
    reference: string;
  }[];
  legacyObligations?: { id: string; title: string; amount: string }[];
  rows: {
    memberId: string;
    name: string;
    salary: string | null;
    bonuses: string;
    leaveMinutes: number;
    leaveDeduction: string;
    installments: string;
    applied: string;
    payable: string | null;
    paid: string;
    remaining: string | null;
    fingerprint: string;
    payments: {
      id: string;
      entryId: string;
      amount: string;
      occurredOn: string;
      account: string;
      author: string;
      createdAt: string;
      note: string;
      reversed: boolean;
    }[];
  }[];
};
