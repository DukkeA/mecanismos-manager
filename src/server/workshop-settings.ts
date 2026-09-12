import "server-only";
import { db } from "./db";
import { once, type Actor } from "./commands";
import { requirePermission } from "@/domain/permissions";
import { DomainError } from "@/domain/errors";
import {
  settingsInput,
  type WorkshopSettings,
} from "@/domain/workshop-settings";
import { minuteOfDay } from "@/domain/attendance";

export async function workshopSettings(): Promise<WorkshopSettings> {
  return db().workshopSettings.findUniqueOrThrow({
    where: { id: "global" },
    select: {
      version: true,
      startMinute: true,
      endMinute: true,
      saturdayStartMinute: true,
      saturdayEndMinute: true,
      graceMinutes: true,
    },
  });
}
export async function saveWorkshopSettings(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const p = settingsInput.parse(raw);
  const startMinute = minuteOfDay(p.start),
    endMinute = minuteOfDay(p.end);
  if (startMinute === endMinute)
    throw new DomainError("La entrada y la salida deben ser diferentes.");
  return once(actor, p.requestId, "WORKSHOP_SETTINGS", p, async (tx) => {
    const before = await tx.workshopSettings.findUniqueOrThrow({
      where: { id: "global" },
    });
    if (before.version !== p.version)
      throw new DomainError(
        "La configuración cambió. Actualiza la página antes de guardar.",
      );
    const saturdayStartMinute = p.saturdayStart
      ? minuteOfDay(p.saturdayStart)
      : before.saturdayStartMinute;
    const saturdayEndMinute = p.saturdayEnd
      ? minuteOfDay(p.saturdayEnd)
      : before.saturdayEndMinute;
    if (startMinute >= endMinute || saturdayStartMinute >= saturdayEndMinute)
      throw new DomainError(
        "La salida debe ser posterior a la entrada del mismo día.",
      );
    const after = await tx.workshopSettings.update({
      where: { id: "global" },
      data: {
        saturdayStartMinute,
        saturdayEndMinute,
        startMinute,
        endMinute,
        graceMinutes: p.graceMinutes,
        version: { increment: 1 },
        updatedAt: new Date(),
        actorId: actor.id,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: actor.id,
        action: "WORKSHOP_SETTINGS",
        details: JSON.parse(JSON.stringify({ before, after })),
      },
    });
    return { id: "global", version: after.version };
  });
}
