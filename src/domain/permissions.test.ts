import { describe, expect, it } from "vitest";
import { can, canContributeToTask, requirePermission } from "./permissions";
import { amount, monthlyCoverage } from "./money";

describe("access boundaries", () => {
  it("allows office payroll without administrative privileges", () => {
    expect(can("OFFICE", "finance:write")).toBe(true);
    expect(can("OFFICE", "payroll:read")).toBe(true);
    expect(can("OFFICE", "profitability:read")).toBe(false);
  });
  it("rejects mechanic stock and finance mutations", () => {
    expect(() => requirePermission("MECHANIC", "inventory:write")).toThrow();
    expect(can("MECHANIC", "finance:write")).toBe(false);
  });
  it("limits mechanics to assigned contributions", () => {
    expect(canContributeToTask("MECHANIC", "a", ["b"])).toBe(false);
    expect(canContributeToTask("MECHANIC", "a", ["a", "b"])).toBe(true);
  });
});

describe("economic coverage", () => {
  it("subtracts actual payroll once and preserves decimal precision", () => {
    expect(
      monthlyCoverage({
        netRevenue: "10000000.10",
        consumedMaterials: "3000000.05",
        otherDirectCosts: "1000000.05",
        payroll: "4000000",
        fixedExpenses: "3000000",
      }),
    ).toEqual({
      contribution: "6000000.00",
      obligations: "7000000.00",
      operatingResult: "-1000000.00",
      remaining: "1000000.00",
    });
  });
  it("rejects implicit rounding, exponent input and NaN", () => {
    for (const value of ["1.001", "NaN", "1e3", "Infinity"])
      expect(() => amount(value)).toThrow();
  });
});
