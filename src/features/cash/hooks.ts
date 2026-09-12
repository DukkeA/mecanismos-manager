"use client";
import Decimal from "decimal.js";
import { useSearchParams } from "next/navigation";
import {
  useOperationMutation,
  useWorkshopQuery,
  useWorkshopScope,
} from "../workshop/query";
import { useTeamRequest } from "../team/hooks";
import type { PayrollPreview } from "@/domain/employee-benefits";
import { todayInBogota } from "./summary";
export function useCash() {
  const snapshot = useWorkshopQuery(),
    { demo } = useWorkshopScope(),
    params = useSearchParams();
  const requested = params.get("period") ?? "",
    period = /^\d{4}-(0[1-9]|1[0-2])$/.test(requested)
      ? requested
      : todayInBogota().slice(0, 7);
  const payroll = useTeamRequest<PayrollPreview>(
    new URLSearchParams({ resource: "payroll", period }),
  );
  const raw = snapshot.data?.operations;
  const obligations =
    raw?.obligations.filter(
      (o) => !payroll.data || o.salaryPeriod !== period,
    ) ?? [];
  if (raw && payroll.data) {
    const current = raw.obligations.find((o) => o.salaryPeriod === period);
    const sum = (key: "payable" | "paid") =>
      payroll.data.rows.reduce(
        (s, r) => s.plus(Decimal.max(0, r[key] ?? 0)),
        new Decimal(0),
      );
    const total = sum("payable"),
      paid = sum("paid").plus(
        payroll.data.unassigned?.reduce(
          (s, e) => s.plus(e.amount),
          new Decimal(0),
        ) ?? 0,
      );
    obligations.push({
      id: current?.id ?? `salary-${period}`,
      salaryPeriod: period,
      title: `Salarios · ${period}`,
      category: "PAYROLL",
      period,
      amount: total.toFixed(2),
      paid: paid.toFixed(2),
      dueOn: new Date(
        Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5)), 0),
      )
        .toISOString()
        .slice(0, 10),
      estimated: payroll.data.rows.some((r) => r.payable === null),
    });
  }
  return {
    ...snapshot,
    data: raw
      ? {
          coverage: raw.coverage ?? [],
          accounts: raw.accounts,
          obligations,
          entries: raw.cashEntries,
          payrollError: !demo ? payroll.error?.message : undefined,
          payrollLoading: !demo && payroll.isPending,
        }
      : undefined,
  };
}
export const useCashMutation = () => useOperationMutation("cash");
