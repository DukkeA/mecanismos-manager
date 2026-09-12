import { z } from "zod";

export const settingsInput = z.object({
  requestId: z.uuid(),
  version: z.number().int().min(1),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  graceMinutes: z.coerce.number().int().min(0).max(60),
});
export type WorkshopSettings = {
  version: number;
  startMinute: number;
  endMinute: number;
  graceMinutes: number;
};
export const timeOfDay = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
