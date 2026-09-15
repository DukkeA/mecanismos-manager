import { z } from "zod";
import { AccessDenied, type Role } from "./permissions";
export const organizerInput = z
  .object({
    requestId: z.uuid(),
    id: z.uuid().optional(),
    version: z.number().int().nonnegative().default(0),
    kind: z.enum(["NOTE", "TODO", "EVENT"]),
    visibility: z.enum(["PERSONAL", "GENERAL"]),
    title: z.string().trim().min(3).max(200),
    body: z.string().trim().max(10000).default(""),
    priority: z.enum(["NORMAL", "HIGH"]).default("NORMAL"),
    pinned: z.boolean().default(false),
    completed: z.boolean().default(false),
    calendar: z.boolean().default(false),
    startsAt: z.iso.datetime({ offset: true }).nullable().default(null),
    endsAt: z.iso.datetime({ offset: true }).nullable().default(null),
    orderId: z.uuid().nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if ((v.calendar || v.kind === "EVENT") && !v.startsAt)
      ctx.addIssue({
        code: "custom",
        message: "Selecciona una fecha y hora para el calendario.",
      });
    if (v.endsAt && (!v.startsAt || new Date(v.endsAt) <= new Date(v.startsAt)))
      ctx.addIssue({
        code: "custom",
        message: "La hora final debe ser posterior al inicio.",
      });
    if (v.kind === "NOTE" && v.calendar)
      ctx.addIssue({
        code: "custom",
        message: "Usa un pendiente o evento para añadir al calendario.",
      });
  });
export type OrganizerItem = {
  id: string;
  version: number;
  kind: "NOTE" | "TODO" | "EVENT";
  visibility: "PERSONAL" | "GENERAL";
  title: string;
  body: string;
  priority: "NORMAL" | "HIGH";
  pinned: boolean;
  completed: boolean;
  calendar: boolean;
  startsAt: string | null;
  endsAt: string | null;
  orderId: string | null;
  ownerId: string;
  author: string;
  updatedBy: string;
  updatedAt: string;
};
export function assertOrganizerAccess(
  actor: { id: string; role: Role },
  item?: { ownerId: string; visibility: string },
  deleting = false,
) {
  if (
    actor.role === "MECHANIC" ||
    (item?.visibility === "PERSONAL" && item.ownerId !== actor.id) ||
    (deleting && item?.visibility === "GENERAL" && actor.role !== "ADMIN")
  )
    throw new AccessDenied();
}
// Inputs use Bogotá wall time, independently of the browser's timezone.
export function organizerDateTime(date: string, time: string) {
  return date ? `${date}T${time || "08:30"}:00-05:00` : null;
}
export function bogotaDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
