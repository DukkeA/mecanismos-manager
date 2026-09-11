import Decimal from "decimal.js";
import { z } from "zod";
import { money } from "./commercial";

export const compensationInput = z.object({
  monthlySalary: money,
  monthlyEmployerCost: money,
  monthlyHours: z.coerce.number().positive().max(744),
  effectiveOn: z.iso.date(),
  note: z.string().trim().min(5).max(1000),
});
export function hourlyCost(
  salary: string,
  employerCost: string,
  hours: number,
) {
  return new Decimal(salary).plus(employerCost).div(hours).toFixed(2);
}
export function overtimePay(
  baseHourlyPay: string,
  minutes: number,
  surcharge: number,
) {
  return new Decimal(baseHourlyPay)
    .mul(minutes)
    .div(60)
    .mul(new Decimal(surcharge).div(100).plus(1))
    .toFixed(2);
}
export type Compensation = {
  id: string;
  memberId: string;
  effectiveOn: string;
  monthlySalary: string | null;
  monthlyEmployerCost: string | null;
  monthlyHours: string | null;
  hourlyCost: string;
  note: string;
};
export type TeamOverview = {
  period: string;
  asOf: string;
  salaries: string;
  employerCosts: string;
  overtimePay: string;
  overtimeEmployerCost: string;
  overtimeMinutes: number;
  monthlyCost: string;
  missing: number;
  configured: number;
  rates: Compensation[];
};
export type OvertimeRow = {
  id: string;
  memberId: string;
  name: string;
  task: string | null;
  taskId: string | null;
  workedOn: string;
  minutes: number;
  kind: string;
  surchargePercent: string;
  baseHourlyPay: string;
  pay: string;
  employerCost: string;
  note: string;
  voidedAt: string | null;
  voidReason: string | null;
};
export type OvertimePage = {
  rows: OvertimeRow[];
  total: number;
  page: number;
  pageSize: number;
};
