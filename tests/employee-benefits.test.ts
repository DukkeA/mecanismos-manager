import { it, expect } from "vitest";
import {
  leaveInput,
  leaveSlices,
  validateInstallments,
} from "@/domain/employee-benefits";
const settings = {
  version: 1,
  startMinute: 510,
  endMinute: 1020,
  saturdayStartMinute: 480,
  saturdayEndMinute: 720,
  graceMinutes: 0,
};
const input = (from: string, to = from) =>
  leaveInput.parse({
    requestId: "f84fd529-61a8-45ae-b07d-faebc9390c97",
    memberId: "36b9bb0e-0d62-494f-bf9b-f185b1674da5",
    treatment: "VACATION",
    from,
    to,
    note: "Permiso autorizado de prueba",
  });
it("counts fractions of Saturday, skips Sunday and rejects time outside the schedule", () => {
  expect(
    leaveSlices(
      { ...input("2026-09-12"), start: "08:00", end: "10:00" },
      settings,
    ).days[0],
  ).toMatchObject({ minutes: 120, vacationDays: "0.5000" });
  expect(
    leaveSlices(input("2026-09-12", "2026-09-14"), settings).days.map(
      (d) => d.minutes,
    ),
  ).toEqual([240, 510]);
  expect(() =>
    leaveSlices(
      { ...input("2026-09-12"), start: "13:00", end: "14:00" },
      settings,
    ),
  ).toThrow("horas de trabajo");
  expect(() =>
    leaveSlices(input("2026-09-14", "2026-09-12"), settings),
  ).toThrow("fechas");
  expect(() =>
    leaveSlices(input("2026-01-01", "2027-02-01"), settings),
  ).toThrow("máximo un año");
  expect(leaveSlices(input("9999-12-31"), settings).days).toHaveLength(1);
});
it("requires exact cents and a single installment per month", () => {
  expect(() =>
    validateInstallments(
      [
        { period: "2026-10", amount: "33.33" },
        { period: "2026-11", amount: "33.33" },
        { period: "2026-12", amount: "33.34" },
      ],
      "100.00",
      "2026-09",
    ),
  ).not.toThrow();
  expect(() =>
    validateInstallments(
      [
        { period: "2026-10", amount: "50.00" },
        { period: "2026-10", amount: "50.00" },
      ],
      "100.00",
      "2026-09",
    ),
  ).toThrow("mismo mes");
  expect(() =>
    validateInstallments(
      [{ period: "2026-10", amount: "99.99" }],
      "100.00",
      "2026-09",
    ),
  ).toThrow("suma");
});
