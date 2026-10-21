"use server";
import { zodErrorMessage, zodFieldErrors } from "@/domain/form-validation";
import { saveWorkshopSettings } from "@/server/workshop-settings";
import { requireMember } from "@/server/auth";
import {
  prepareStationDevice,
  saveStation,
  scanAttendance,
  correctAttendance,
} from "@/server/attendance-service";
import { DomainError } from "@/domain/errors";
import { AccessDenied } from "@/domain/permissions";
import { ZodError } from "zod";
const actions = {
  device: prepareStationDevice,
  settings: saveWorkshopSettings,
  station: saveStation,
  scan: scanAttendance,
  correct: correctAttendance,
};
export async function attendanceCommand(
  kind: keyof typeof actions,
  input: unknown,
) {
  try {
    const actor = await requireMember();
    if (!Object.hasOwn(actions, kind))
      throw new DomainError("Operación no disponible.");
    return { ok: true as const, ...(await actions[kind](actor, input)) };
  } catch (e) {
    return {
      ok: false as const,
      fields: e instanceof ZodError ? zodFieldErrors(e) : undefined,
      error:
        e instanceof DomainError || e instanceof AccessDenied
          ? e.message
          : e instanceof ZodError
            ? zodErrorMessage(e)
            : "No se pudo registrar el cambio.",
    };
  }
}
