import { z } from "zod";

export const settingsInput = z.object({
  requestId: z.uuid(),
  version: z.number().int().min(1),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  saturdayStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  saturdayEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  graceMinutes: z.coerce.number().int().min(0).max(60),
});
export type WorkshopSettings = {
  version: number;
  startMinute: number;
  endMinute: number;
  saturdayStartMinute: number;
  saturdayEndMinute: number;
  graceMinutes: number;
};
export function scheduleForDate(
  settings: Omit<WorkshopSettings, "version">,
  date: string,
) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (weekday === 0) return null;
  return weekday === 6
    ? {
        startMinute: settings.saturdayStartMinute,
        endMinute: settings.saturdayEndMinute,
      }
    : { startMinute: settings.startMinute, endMinute: settings.endMinute };
}
export const timeOfDay = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
