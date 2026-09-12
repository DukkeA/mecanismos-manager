import { scheduleForDate } from "@/domain/workshop-settings";
import "server-only";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { once, serializable, type Actor, type Tx } from "./commands";
import { DomainError } from "@/domain/errors";
import { requirePermission } from "@/domain/permissions";

import { day } from "./commercial-ledger";

export const bogotaDay = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(date);
const signature = (key: string, value: string) =>
  createHmac("sha256", key).update(value).digest("hex");
export async function stationCode(actor: Actor, locationId: string) {
  requirePermission(actor.role, "members:write");
  z.uuid().parse(locationId);
  const station = await db().attendanceStation.findUnique({
    where: { locationId },
  });
  if (!station?.active)
    throw new DomainError("Activa la pantalla de esta sede.");
  return rotatingCode(station);
}
function rotatingCode(station: { id: string; secret: string }) {
  const now = Date.now(),
    window = Math.floor(now / 30000),
    payload = `mt1.${station.id}.${window}`;
  return {
    token: `${payload}.${signature(station.secret, payload)}`,
    expiresAt: (window + 1) * 30000,
    serverNow: now,
  };
}
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function prepareStationDevice(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const p = z.object({ requestId: z.uuid(), locationId: z.uuid() }).parse(raw);
  return once(actor, p.requestId, "ATTENDANCE_DEVICE_LINK", p, async (tx) => {
    const token = randomBytes(32).toString("hex");
    const station = await tx.attendanceStation.upsert({
      where: { locationId: p.locationId },
      create: {
        locationId: p.locationId,
        active: true,
        secret: randomBytes(32).toString("hex"),
        actorId: actor.id,
        pairingHash: digest(token),
        pairingExpiresAt: new Date(Date.now() + 600000),
      },
      update: {
        pairingHash: digest(token),
        pairingExpiresAt: new Date(Date.now() + 600000),
        actorId: actor.id,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: station.id,
        action: "ATTENDANCE_DEVICE_LINK",
        details: { locationId: p.locationId },
      },
    });
    return { id: station.id, token };
  });
}
export async function pairStationDevice(token: string) {
  z.string()
    .regex(/^[0-9a-f]{64}$/)
    .parse(token);
  return serializable(async (tx) => {
    const station = await tx.attendanceStation.findUnique({
      where: { pairingHash: digest(token) },
    });
    if (
      !station?.pairingExpiresAt ||
      station.pairingExpiresAt.getTime() < Date.now()
    )
      throw new DomainError(
        "El enlace venció o ya fue usado. Genera otro desde Configuración.",
      );
    const credential = randomBytes(32).toString("hex");
    await tx.attendanceStation.update({
      where: { id: station.id },
      data: {
        pairingHash: null,
        pairingExpiresAt: null,
        deviceHash: digest(credential),
        active: true,
        secret: randomBytes(32).toString("hex"),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: station.actorId,
        entityId: station.id,
        action: "ATTENDANCE_DEVICE_PAIRED",
        details: { locationId: station.locationId },
      },
    });
    return credential;
  });
}
export async function deviceStationCode(credential: string) {
  if (!/^[0-9a-f]{64}$/.test(credential))
    throw new DomainError("Vincula esta pantalla desde Configuración.");
  const station = await db().attendanceStation.findUnique({
    where: { deviceHash: digest(credential) },
  });
  if (!station?.active)
    throw new DomainError(
      "Esta pantalla está desactivada. Vincúlala de nuevo desde Configuración.",
    );
  const location = await db().location.findUniqueOrThrow({
    where: { id: station.locationId },
    select: { name: true },
  });
  return { ...rotatingCode(station), name: location.name };
}
export async function saveStation(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const p = z
    .object({ requestId: z.uuid(), locationId: z.uuid(), active: z.boolean() })
    .parse(raw);
  return once(actor, p.requestId, "ATTENDANCE_STATION", p, async (tx) => {
    const station = await tx.attendanceStation.upsert({
      where: { locationId: p.locationId },
      create: {
        locationId: p.locationId,
        active: p.active,
        secret: randomBytes(32).toString("hex"),
        actorId: actor.id,
      },
      update: {
        active: p.active,
        secret: randomBytes(32).toString("hex"),
        actorId: actor.id,
        pairingHash: null,
        pairingExpiresAt: null,
        deviceHash: null,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: station.id,
        action: "ATTENDANCE_STATION",
        details: { locationId: p.locationId, active: p.active },
      },
    });
    return { id: station.id };
  });
}
async function expected(tx: Tx, date: string) {
  const settings = await tx.workshopSettings.findUniqueOrThrow({
    where: { id: "global" },
  });
  const s = scheduleForDate(settings, date);
  if (!s)
    return {
      expectedStart: null,
      expectedEnd: null,
      breakMinutes: 0,
      graceMinutes: settings.graceMinutes,
    };
  const midnight = new Date(`${date}T00:00:00-05:00`).getTime();
  return {
    expectedStart: new Date(midnight + s.startMinute * 60000),
    expectedEnd: new Date(midnight + s.endMinute * 60000),
    breakMinutes: 0,
    graceMinutes: settings.graceMinutes,
  };
}
async function noOverlap(
  tx: Tx,
  memberId: string,
  start: Date,
  end: Date | null,
  id?: string,
) {
  if (
    await tx.attendanceShift.findFirst({
      where: {
        memberId,
        ...(id ? { id: { not: id } } : {}),
        startedAt: { lt: end ?? new Date("2100-01-01") },
        OR: [{ endedAt: null }, { endedAt: { gt: start } }],
      },
    })
  )
    throw new DomainError(
      "La jornada se cruza con otra marcación del empleado.",
    );
}
export async function scanAttendance(actor: Actor, raw: unknown) {
  const p = z
    .object({
      requestId: z.uuid(),
      token: z.string().max(180),
      action: z.enum(["IN", "OUT"]),
    })
    .parse(raw);
  return once(actor, p.requestId, "ATTENDANCE_SCAN", p, async (tx) => {
    const match = /^mt1\.([0-9a-f-]{36})\.(\d{8,12})\.([0-9a-f]{64})$/.exec(
      p.token,
    );
    if (!match) throw new DomainError("Este código no corresponde al taller.");
    const station = await tx.attendanceStation.findUnique({
        where: { id: match[1] },
      }),
      now = new Date();
    if (
      !station?.active ||
      Number(match[2]) !== Math.floor(now.getTime() / 30000)
    )
      throw new DomainError(
        "El código venció. Escanea el que aparece ahora en la sede.",
      );
    const payload = p.token.slice(0, p.token.lastIndexOf("."));
    if (
      !timingSafeEqual(
        Buffer.from(signature(station.secret, payload), "hex"),
        Buffer.from(match[3], "hex"),
      )
    )
      throw new DomainError("Código no válido.");
    const member = await tx.member.findUniqueOrThrow({
      where: { id: actor.id },
    });
    if (!member.active) throw new DomainError("El acceso está desactivado.");
    const tokenHash = createHash("sha256").update(p.token).digest("hex");
    if (
      await tx.attendanceScan.findUnique({
        where: { memberId_tokenHash: { memberId: actor.id, tokenHash } },
      })
    )
      throw new DomainError("Ya usaste este código. Espera el siguiente.");
    const open = await tx.attendanceShift.findFirst({
      where: { memberId: actor.id, endedAt: null },
    });
    let id: string;
    if (p.action === "IN") {
      if (open)
        throw new DomainError(
          "Ya tienes una jornada abierta. Registra la salida.",
        );
      const date = bogotaDay(now);
      if (
        await tx.attendanceShift.findUnique({
          where: {
            memberId_workedOn: { memberId: actor.id, workedOn: day(date) },
          },
        })
      )
        throw new DomainError(
          "La jornada de hoy ya está registrada. Pide a administración revisar una corrección.",
        );
      await noOverlap(tx, actor.id, now, null);
      const shift = await tx.attendanceShift.create({
        data: {
          memberId: actor.id,
          locationId: station.locationId,
          workedOn: day(date),
          startedAt: now,
          source: "QR",
          ...(await expected(tx, date)),
        },
      });
      id = shift.id;
    } else {
      if (!open)
        throw new DomainError("No tienes una entrada pendiente de salida.");
      if (now.getTime() - open.startedAt.getTime() > 86400000)
        throw new DomainError(
          "La entrada lleva más de 24 horas abierta. Pide a administración corregirla.",
        );
      if (open.locationId !== station.locationId)
        throw new DomainError(
          "Registra la salida en la sede de entrada o solicita una corrección.",
        );
      if (now <= open.startedAt)
        throw new DomainError("La salida debe ser posterior a la entrada.");
      await tx.attendanceShift.update({
        where: { id: open.id },
        data: { endedAt: now },
      });
      id = open.id;
    }
    await tx.attendanceScan.create({
      data: { memberId: actor.id, tokenHash, shiftId: id, action: p.action },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: id,
        action: `ATTENDANCE_${p.action}`,
        details: { locationId: station.locationId, at: now.toISOString() },
      },
    });
    return { id };
  });
}
export async function correctAttendance(actor: Actor, raw: unknown) {
  requirePermission(actor.role, "members:write");
  const p = z
    .object({
      requestId: z.uuid(),
      id: z.uuid().optional(),
      memberId: z.uuid(),
      locationId: z.uuid(),
      startedAt: z.iso.datetime({ offset: true }),
      endedAt: z.iso.datetime({ offset: true }).optional(),
      breakMinutes: z.coerce.number().int().min(0).max(240),
      note: z.string().trim().min(5).max(1000),
    })
    .parse(raw);
  const start = new Date(p.startedAt),
    end = p.endedAt ? new Date(p.endedAt) : null,
    date = bogotaDay(start);
  if (
    start > new Date() ||
    (end &&
      (end > new Date() ||
        end <= start ||
        end.getTime() - start.getTime() > 86400000))
  )
    throw new DomainError(
      "Revisa la entrada y la salida; no pueden ser futuras ni superar 24 horas.",
    );
  if (end && (end.getTime() - start.getTime()) / 60000 < p.breakMinutes)
    throw new DomainError("El descanso supera la duración de la jornada.");
  return once(actor, p.requestId, "ATTENDANCE_CORRECTED", p, async (tx) => {
    const before = p.id
      ? await tx.attendanceShift.findUniqueOrThrow({ where: { id: p.id } })
      : null;
    if (
      before &&
      (before.memberId !== p.memberId || bogotaDay(before.startedAt) !== date)
    )
      throw new DomainError(
        "La corrección debe conservar el empleado y el día de entrada.",
      );
    await noOverlap(tx, p.memberId, start, end, p.id);
    const values = {
      memberId: p.memberId,
      locationId: p.locationId,
      workedOn: day(date),
      startedAt: start,
      endedAt: end,
      ...(before
        ? {
            expectedStart: before.expectedStart,
            expectedEnd: before.expectedEnd,
            graceMinutes: before.graceMinutes,
          }
        : await expected(tx, date)),
      breakMinutes: p.breakMinutes,
      source: "MANUAL",
      note: p.note,
    };
    const shift = before
      ? await tx.attendanceShift.update({
          where: { id: before.id },
          data: values,
        })
      : await tx.attendanceShift.create({ data: values });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityId: shift.id,
        action: "ATTENDANCE_CORRECTED",
        details: JSON.parse(
          JSON.stringify({ before, after: shift, reason: p.note }),
        ),
      },
    });
    return { id: shift.id };
  });
}
