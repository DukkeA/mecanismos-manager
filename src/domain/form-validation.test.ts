import { describe, it, expect } from "vitest";
import { validateForm, zodErrorMessage } from "./form-validation";
import { z } from "zod";
describe("validation before writing workshop data", () => {
  it("explains nested server validation in Spanish with the line number", () => {
    const result = z
      .object({ lines: z.array(z.object({ quantity: z.string().min(1) })) })
      .safeParse({ lines: [{ quantity: "" }] });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(zodErrorMessage(result.error)).toContain(
        "Línea 1 · Cantidad: El valor mínimo es 1 caracteres.",
      );
  });
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
  it("uses real dates and time boundaries and keeps optional notes optional", () => {
    expect(
      validateForm([{ key: "date", label: "Fecha", type: "date" }], {
        date: "2026-02-30",
      }),
    ).toHaveProperty("date");
    expect(
      validateForm([{ key: "time", label: "Hora", type: "time" }], {
        time: "24:00",
      }),
    ).toHaveProperty("time");
    expect(
      validateForm(
        [
          { key: "time", label: "Hora", type: "time" },
          { key: "reason", label: "Detalles", optional: true },
        ],
        { time: "23:59", reason: "" },
      ),
    ).toEqual({});
  });
});
