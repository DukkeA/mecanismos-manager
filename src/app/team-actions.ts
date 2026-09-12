"use server";
import { requireMember } from "@/server/auth";
import {
  saveCompensation,
  recordOvertime,
  voidOvertime,
} from "@/server/team-service";
import { DomainError } from "@/domain/errors";
import { AccessDenied } from "@/domain/permissions";
import { ZodError } from "zod";
import {
  recordLeave,
  voidLeave,
  adjustVacation,
  recordSalaryAdvance,
  rescheduleAdvance,
  applyAdvanceInstallment,
  voidSalaryAdvance,
} from "@/server/employee-benefits-service";
import {
  recordPayroll,
  reversePayroll,
  adoptSalaryObligation,
} from "@/server/payroll-service";
const actions = {
  "payroll-pay": recordPayroll,
  "payroll-reverse": reversePayroll,
  "payroll-adopt": adoptSalaryObligation,
  leave: recordLeave,
  "leave-void": voidLeave,
  vacation: adjustVacation,
  advance: recordSalaryAdvance,
  "advance-plan": rescheduleAdvance,
  "advance-deduction": applyAdvanceInstallment,
  "advance-void": voidSalaryAdvance,
  compensation: saveCompensation,
  overtime: recordOvertime,
  "overtime-void": voidOvertime,
};
export async function teamCommand(kind: keyof typeof actions, input: unknown) {
  try {
    const actor = await requireMember();
    if (!Object.hasOwn(actions, kind))
      throw new DomainError("Operación no disponible.");
    const result = await actions[kind](actor, input);
    return { ok: true as const, id: result.id };
  } catch (e) {
    return {
      ok: false as const,
      error:
        e instanceof DomainError || e instanceof AccessDenied
          ? e.message
          : e instanceof ZodError
            ? "Revisa los campos del formulario."
            : "No se pudo guardar el cambio.",
    };
  }
}
