import Decimal from "decimal.js";

export function amount(value: string): Decimal {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) throw new Error("Valor monetario inválido.");
  const result = new Decimal(value);
  if (result.abs().gte("10000000000000000")) throw new Error("Valor fuera del límite.");
  return result;
}

export function monthlyCoverage(input: {
  netRevenue: string; consumedMaterials: string; otherDirectCosts: string;
  payroll: string; fixedExpenses: string;
}) {
  const contribution = amount(input.netRevenue).minus(amount(input.consumedMaterials)).minus(amount(input.otherDirectCosts));
  const obligations = amount(input.payroll).plus(amount(input.fixedExpenses));
  return {
    contribution: contribution.toFixed(2),
    obligations: obligations.toFixed(2),
    operatingResult: contribution.minus(obligations).toFixed(2),
    remaining: Decimal.max(0, obligations.minus(contribution)).toFixed(2),
  };
}
