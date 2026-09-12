import { cleanupActivity } from "./activity-cleanup";
import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID as uuid, createHmac } from "node:crypto";
import { db } from "@/server/db";
import {
  saveStation,
  stationCode,
  scanAttendance,
  prepareStationDevice,
  pairStationDevice,
  deviceStationCode,
  correctAttendance,
  bogotaDay,
} from "@/server/attendance-service";
import { attendancePage } from "@/server/attendance-query";
import {
  saveWorkshopSettings,
  workshopSettings,
} from "@/server/workshop-settings";
let originalSettings: Awaited<
  ReturnType<ReturnType<typeof db>["workshopSettings"]["findUniqueOrThrow"]>
>;
const admin = { id: uuid(), role: "ADMIN" as const },
  mechanic = { id: uuid(), role: "MECHANIC" as const },
  office = { id: uuid(), role: "OFFICE" as const },
  actors = [admin, mechanic, office],
  locationId = uuid();
beforeAll(async () => {
  originalSettings = await db().workshopSettings.findUniqueOrThrow({
    where: { id: "global" },
  });
  await db().workshopSettings.update({
    where: { id: "global" },
    data: { startMinute: 510, endMinute: 1020, graceMinutes: 0 },
  });
  await db().member.createMany({
    data: actors.map((a) => ({
      ...a,
      name: `Asistencia ${a.role}`,
      email: `${a.id}@example.invalid`,
    })),
  });
  await db().location.create({
    data: {
      id: locationId,
      code: uuid().slice(0, 20),
      name: "Sede prueba asistencia",
    },
  });
});
afterAll(async () => {
  const ids = actors.map((a) => a.id);
  await db().workshopSettings.update({
    where: { id: "global" },
    data: originalSettings,
  });
  await db().attendanceScan.deleteMany({ where: { memberId: { in: ids } } });
  await db().attendanceShift.deleteMany({ where: { memberId: { in: ids } } });
  await db().attendanceSchedule.deleteMany({
    where: { memberId: { in: ids } },
  });
  await db().attendanceStation.deleteMany({ where: { locationId } });
  await db().auditEvent.deleteMany({ where: { actorId: { in: ids } } });
  await db().commandReceipt.deleteMany({ where: { actorId: { in: ids } } });
  await db().location.delete({ where: { id: locationId } });
  await cleanupActivity(
    (await db().member.findMany({ where: { id: { in: ids } } })).map(
      (m) => m.id,
    ),
  );
  await db().member.deleteMany({ where: { id: { in: ids } } });
});
it("limits global settings and QR publishing to administrators", async () => {
  await expect(
    saveStation(mechanic, { requestId: uuid(), locationId, active: true }),
  ).rejects.toThrow("permiso");
  await saveStation(admin, { requestId: uuid(), locationId, active: true });
  await expect(stationCode(office, locationId)).rejects.toThrow("permiso");
  await expect(
    saveWorkshopSettings(office, { requestId: uuid() }),
  ).rejects.toThrow("permiso");
  expect(await workshopSettings()).toMatchObject({
    startMinute: 510,
    endMinute: 1020,
    graceMinutes: 0,
  });
});
it("rejects expired or forged QR codes and makes a scan idempotent", async () => {
  const station = await db().attendanceStation.findUniqueOrThrow({
      where: { locationId },
    }),
    payload = `mt1.${station.id}.${Math.floor(Date.now() / 30000) - 1}`,
    expired = `${payload}.${createHmac("sha256", station.secret).update(payload).digest("hex")}`;
  await expect(
    scanAttendance(mechanic, {
      requestId: uuid(),
      token: expired,
      action: "IN",
    }),
  ).rejects.toThrow("venció");
  const code = await stationCode(admin, locationId);
  await expect(
    scanAttendance(mechanic, {
      requestId: uuid(),
      token: code.token.slice(0, -64) + "0".repeat(64),
      action: "IN",
    }),
  ).rejects.toThrow("válido");
  const input = { requestId: uuid(), token: code.token, action: "IN" };
  const a = await scanAttendance(mechanic, input),
    b = await scanAttendance(mechanic, input);
  expect(a.id).toBe(b.id);
  await expect(
    scanAttendance(mechanic, {
      requestId: uuid(),
      token: code.token,
      action: "OUT",
    }),
  ).rejects.toThrow("Ya usaste");
  await expect(
    scanAttendance(mechanic, {
      requestId: uuid(),
      token: code.token,
      action: "IN",
    }),
  ).rejects.toThrow();
  expect((await attendancePage(mechanic, new URLSearchParams())).open?.id).toBe(
    a.id,
  );
  // Rotating the station key makes an old photograph invalid immediately.
  await saveStation(admin, { requestId: uuid(), locationId, active: true });
  await expect(
    scanAttendance(office, {
      requestId: uuid(),
      token: code.token,
      action: "IN",
    }),
  ).rejects.toThrow();
});
it("resolves competing arrivals into one open shift and keeps employee records private", async () => {
  const { token } = await stationCode(admin, locationId);
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      scanAttendance(office, { requestId: uuid(), token, action: "IN" }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const own = await attendancePage(mechanic, new URLSearchParams());
  expect(own.rows.every((r) => r.memberId === mechanic.id)).toBe(true);
  expect(JSON.stringify(own)).not.toContain("secret");
  await expect(
    attendancePage(mechanic, new URLSearchParams({ scope: "team" })),
  ).rejects.toThrow("permiso");
  await expect(
    attendancePage(mechanic, new URLSearchParams({ memberId: office.id })),
  ).rejects.toThrow("permiso");
});
it("audits manual corrections, preserves the scheduled snapshot and prevents overlaps", async () => {
  const a = await correctAttendance(admin, {
    requestId: uuid(),
    memberId: mechanic.id,
    locationId,
    startedAt: "2026-08-03T08:42:00-05:00",
    endedAt: "2026-08-03T18:12:00-05:00",
    breakMinutes: 0,
    note: "Corrección con supervisor",
  });
  const q = new URLSearchParams({
    scope: "team",
    memberId: mechanic.id,
    from: "2026-08-03",
    to: "2026-08-03",
  });
  const row = (await attendancePage(admin, q)).rows[0];
  expect(row.lateMinutes).toBe(12);
  expect(row.workedMinutes).toBe(570);
  expect(row.extraMinutes).toBe(60);
  await correctAttendance(admin, {
    requestId: uuid(),
    id: a.id,
    memberId: mechanic.id,
    locationId,
    startedAt: "2026-08-03T08:30:00-05:00",
    endedAt: "2026-08-03T17:00:00-05:00",
    breakMinutes: 0,
    note: "Hora de llegada corregida",
  });
  expect((await attendancePage(admin, q)).rows[0].lateMinutes).toBe(0);
  expect(
    await db().auditEvent.count({
      where: { entityId: a.id, action: "ATTENDANCE_CORRECTED" },
    }),
  ).toBe(2);
  await expect(
    correctAttendance(admin, {
      requestId: uuid(),
      memberId: mechanic.id,
      locationId,
      startedAt: "2026-08-02T22:00:00-05:00",
      endedAt: "2026-08-03T10:00:00-05:00",
      breakMinutes: 0,
      note: "Jornada que se cruza",
    }),
  ).rejects.toThrow("cruza");
  await expect(
    correctAttendance(mechanic, { requestId: uuid() }),
  ).rejects.toThrow("permiso");
});
it("applies the global schedule to every employee and rejects invalid durations", async () => {
  await correctAttendance(admin, {
    requestId: uuid(),
    memberId: office.id,
    locationId,
    startedAt: "2026-08-04T08:00:00-05:00",
    endedAt: "2026-08-04T17:00:00-05:00",
    breakMinutes: 0,
    note: "Horario global para oficina",
  });
  const page = await attendancePage(
    office,
    new URLSearchParams({ from: "2026-08-04", to: "2026-08-04" }),
  );
  expect(page.rows[0].lateMinutes).toBe(0);
  expect(page.rows[0].extraMinutes).toBe(30);
  expect(page.summary.withoutSchedule).toBe(0);
  await expect(
    correctAttendance(admin, {
      requestId: uuid(),
      memberId: office.id,
      locationId,
      startedAt: "2026-08-05T08:00:00-05:00",
      endedAt: "2026-08-07T08:00:00-05:00",
      breakMinutes: 0,
      note: "Duración inválida",
    }),
  ).rejects.toThrow("24 horas");
  expect(bogotaDay(new Date("2026-08-06T01:00:00Z"))).toBe("2026-08-05");
});

it("pairs a display once without granting access to the rest of the app and supports revocation", async () => {
  await expect(
    prepareStationDevice(office, { requestId: uuid(), locationId }),
  ).rejects.toThrow("permiso");
  const { token } = await prepareStationDevice(admin, {
    requestId: uuid(),
    locationId,
  });
  const credential = await pairStationDevice(token);
  await expect(pairStationDevice(token)).rejects.toThrow("usado");
  const code = await deviceStationCode(credential);
  expect(Object.keys(code).sort()).toEqual([
    "expiresAt",
    "name",
    "serverNow",
    "token",
  ]);
  expect(code.name).toBe("Sede prueba asistencia");
  // A fresh signed code can close the same employee's open shift.
  const result = await scanAttendance(mechanic, {
    requestId: uuid(),
    token: code.token,
    action: "OUT",
  });
  expect(
    (await db().attendanceShift.findUniqueOrThrow({ where: { id: result.id } }))
      .endedAt,
  ).not.toBeNull();
  const completed = await attendancePage(
    mechanic,
    new URLSearchParams({ from: "2020-01-01", to: "2020-01-02" }),
  );
  expect(completed.rows).toHaveLength(0);
  expect(completed.today?.endedAt).not.toBeNull();
  expect(completed.open).toBeNull();
  const next = await prepareStationDevice(admin, {
    requestId: uuid(),
    locationId,
  });
  const replacement = await pairStationDevice(next.token);
  await expect(deviceStationCode(credential)).rejects.toThrow("desactivada");
  expect((await deviceStationCode(replacement)).name).toBe(code.name);
  await saveStation(admin, { requestId: uuid(), locationId, active: false });
  await expect(deviceStationCode(replacement)).rejects.toThrow("desactivada");
  const expired = await prepareStationDevice(admin, {
    requestId: uuid(),
    locationId,
  });
  await db().attendanceStation.update({
    where: { locationId },
    data: { pairingExpiresAt: new Date(0) },
  });
  await expect(pairStationDevice(expired.token)).rejects.toThrow("venció");
});
it("changes future schedule snapshots only and rejects stale settings edits", async () => {
  const settings = await workshopSettings();
  const existing = await db().attendanceShift.findFirstOrThrow({
    where: {
      memberId: mechanic.id,
      workedOn: new Date("2026-08-03T00:00:00Z"),
    },
  });
  const input = {
    requestId: uuid(),
    version: settings.version,
    start: "09:00",
    end: "17:00",
    graceMinutes: 5,
  };
  const first = await saveWorkshopSettings(admin, input);
  expect((await saveWorkshopSettings(admin, input)).version).toBe(
    first.version,
  );
  await expect(
    saveWorkshopSettings(admin, { ...input, requestId: uuid() }),
  ).rejects.toThrow("configuración cambió");
  const previous = await db().attendanceShift.findUniqueOrThrow({
    where: { id: existing.id },
  });
  expect(previous.expectedStart).toEqual(existing.expectedStart);
  const created = await correctAttendance(admin, {
    requestId: uuid(),
    memberId: office.id,
    locationId,
    startedAt: "2026-08-10T09:03:00-05:00",
    endedAt: "2026-08-10T17:00:00-05:00",
    breakMinutes: 0,
    note: "Nuevo horario para futuras marcaciones",
  });
  const shift = await db().attendanceShift.findUniqueOrThrow({
    where: { id: created.id },
  });
  expect(shift.expectedStart?.toISOString()).toBe("2026-08-10T14:00:00.000Z");
  expect(shift.breakMinutes).toBe(0);
  expect(
    (
      await attendancePage(
        office,
        new URLSearchParams({ from: "2026-08-10", to: "2026-08-10" }),
      )
    ).rows[0].lateMinutes,
  ).toBe(0);
});

it("uses the separate Saturday schedule and leaves Sunday unscheduled", async () => {
  const settings = await workshopSettings();
  await saveWorkshopSettings(admin, {
    requestId: uuid(),
    version: settings.version,
    start: "08:30",
    end: "17:00",
    saturdayStart: "08:00",
    saturdayEnd: "12:00",
    graceMinutes: 0,
  });
  const saturday = await correctAttendance(admin, {
    requestId: uuid(),
    memberId: office.id,
    locationId,
    startedAt: "2026-08-15T08:00:00-05:00",
    endedAt: "2026-08-15T12:00:00-05:00",
    breakMinutes: 0,
    note: "Jornada del sábado registrada",
  });
  const shift = await db().attendanceShift.findUniqueOrThrow({
    where: { id: saturday.id },
  });
  expect(shift.expectedStart?.toISOString()).toBe("2026-08-15T13:00:00.000Z");
  expect(shift.expectedEnd?.toISOString()).toBe("2026-08-15T17:00:00.000Z");
  const sunday = await correctAttendance(admin, {
    requestId: uuid(),
    memberId: office.id,
    locationId,
    startedAt: "2026-08-16T09:00:00-05:00",
    endedAt: "2026-08-16T11:00:00-05:00",
    breakMinutes: 0,
    note: "Trabajo ocasional el domingo",
  });
  expect(
    (await db().attendanceShift.findUniqueOrThrow({ where: { id: sunday.id } }))
      .expectedStart,
  ).toBeNull();
});
