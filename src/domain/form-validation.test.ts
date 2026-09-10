import { describe, it, expect } from "vitest";
import { validateForm } from "./form-validation";
describe("validation before writing workshop data", () => {
  it("rejects ambiguous monetary formatting without changing its meaning", () => {
    expect(
      validateForm([{ key: "amount", label: "Valor", type: "money" }], {
        amount: "250.000",
      }),
    ).toHaveProperty("amount");
    expect(
      validateForm([{ key: "amount", label: "Valor", type: "money" }], {
        amount: "250000.50",
      }),
    ).toEqual({});
  });
  it("distinguishes a zero opening balance from a zero payment", () => {
    expect(
      validateForm(
        [
          {
            key: "openingBalance",
            label: "Saldo",
            type: "money",
            allowZero: true,
          },
        ],
        { openingBalance: "0" },
      ),
    ).toEqual({});
    expect(
      validateForm([{ key: "amount", label: "Pago", type: "money" }], {
        amount: "0",
      }),
    ).toHaveProperty("amount");
  });
  it("identifies missing assignees and date in the same submission", () => {
    expect(
      Object.keys(
        validateForm(
          [
            { key: "members", label: "Responsables", type: "members" },
            { key: "dueOn", label: "Fecha", type: "date" },
          ],
          { members: [], dueOn: "" },
        ),
      ),
    ).toEqual(["members", "dueOn"]);
  });
  it("accepts optional blanks and checks period boundaries", () => {
    expect(
      validateForm(
        [{ key: "email", label: "Correo", type: "email", optional: true }],
        { email: "" },
      ),
    ).toEqual({});
    expect(
      validateForm([{ key: "period", label: "Mes" }], { period: "2026-13" }),
    ).toHaveProperty("period");
  });
});
