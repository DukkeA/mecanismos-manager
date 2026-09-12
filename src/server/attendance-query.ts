import { bogotaDay } from "./attendance-service";
import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { db } from "./db";
import type { Actor } from "./commands";
import {
  attendanceMetrics,
  type AttendancePage,
  type AttendanceRow,
} from "@/domain/attendance";
import { AccessDenied } from "@/domain/permissions";

export async function attendancePage(
  actor: Actor,
  params: URLSearchParams,
): Promise<AttendancePage> {
  const p = z
    .object({
      scope: z.enum(["own", "team"]).default("own"),
      memberId: z.uuid().optional(),
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
      q: z.string().max(120).default(""),
      page: z.coerce.number().int().min(1).max(100000).default(1),
      orderBy: z.enum(["name", "startedAt", "endedAt"]).default("startedAt"),
      direction: z.enum(["asc", "desc"]).default("desc"),
    })
    .parse(Object.fromEntries(params));
  if (
    (p.scope === "team" || (p.memberId && p.memberId !== actor.id)) &&
    actor.role === "MECHANIC"
  )
    throw new AccessDenied();
  if (p.from && p.to && p.from > p.to) throw Error("Rango no válido.");
  const memberId = p.scope === "own" ? actor.id : p.memberId,
    sql = Prisma.sql;
  const source = sql`FROM workshop."AttendanceShift" s JOIN workshop."Member" m ON m.id=s."memberId" JOIN workshop."Location" l ON l.id=s."locationId" LEFT JOIN LATERAL(SELECT COALESCE(sum(GREATEST(0,extract(epoch FROM (LEAST(d."endsAt",s."startedAt")-GREATEST(d."startsAt",s."expectedStart")))/60)),0)::int excused,COALESCE(sum(d.minutes),0)::int authorized FROM workshop."EmployeeLeaveDay" d JOIN workshop."EmployeeLeave" permit ON permit.id=d."leaveId" WHERE permit."memberId"=s."memberId" AND permit."voidedAt" IS NULL AND d."workedOn"=s."workedOn") permission ON true WHERE (${memberId ?? null}::uuid IS NULL OR s."memberId"=${memberId ?? null}::uuid) AND s."workedOn">=${p.from ?? "2000-01-01"}::date AND s."workedOn"<=${p.to ?? "2100-01-01"}::date AND (m.name ILIKE ${`%${p.q}%`} OR s.note ILIKE ${`%${p.q}%`})`;
  const [rows, counts, summary, settings, open, today] =
    await db().$transaction(
      [
        db().$queryRaw<AttendanceRow[]>(
          sql`SELECT s.id,s."memberId",s."locationId",m.name,l.name location,s."workedOn"::text,s."startedAt",s."endedAt",s."expectedStart",s."expectedEnd",s."breakMinutes",s."graceMinutes",s.source,s.note,permission.excused "excusedLateMinutes",permission.authorized "authorizedMinutes" ${source} ORDER BY ${p.orderBy === "name" ? sql`m.name` : p.orderBy === "endedAt" ? sql`s."endedAt"` : sql`s."startedAt"`} ${Prisma.raw(p.direction)} NULLS LAST,s.id LIMIT 10 OFFSET ${(p.page - 1) * 10}`,
        ),
        db().$queryRaw<{ count: bigint }[]>(sql`SELECT count(*) ${source}`),
        db().$queryRaw<AttendancePage["summary"][]>(
          sql`WITH entries AS (SELECT s.*,GREATEST(0,floor(extract(epoch FROM (s."endedAt"-s."startedAt"))/60)-s."breakMinutes") worked,GREATEST(0,ceil(extract(epoch FROM (s."startedAt"-s."expectedStart"))/60)-permission.excused) delay ${source}) SELECT COALESCE(sum(worked) FILTER(WHERE "endedAt" IS NOT NULL),0)::int "workedMinutes",COALESCE(sum(delay) FILTER(WHERE delay>"graceMinutes"),0)::int "lateMinutes",COALESCE(sum(GREATEST(0,worked-(extract(epoch FROM ("expectedEnd"-"expectedStart"))/60-"breakMinutes"))) FILTER(WHERE "endedAt" IS NOT NULL AND "expectedStart" IS NOT NULL),0)::int "extraMinutes",count(*) FILTER(WHERE "endedAt" IS NULL)::int open,count(*) FILTER(WHERE "expectedStart" IS NULL)::int "withoutSchedule" FROM entries`,
        ),
        db().workshopSettings.findUniqueOrThrow({
          where: { id: "global" },
          select: {
            version: true,
            startMinute: true,
            endMinute: true,
            saturdayStartMinute: true,
            saturdayEndMinute: true,
            graceMinutes: true,
          },
        }),
        db().$queryRaw<NonNullable<AttendancePage["open"]>[]>(
          sql`SELECT s.id,s."startedAt",l.name location FROM workshop."AttendanceShift" s JOIN workshop."Location" l ON l.id=s."locationId" WHERE s."memberId"=${actor.id}::uuid AND s."endedAt" IS NULL`,
        ),
        db().attendanceShift.findUnique({
          where: {
            memberId_workedOn: {
              memberId: actor.id,
              workedOn: new Date(`${bogotaDay(new Date())}T00:00:00Z`),
            },
          },
          select: { startedAt: true, endedAt: true },
        }),
      ],
      { isolationLevel: "RepeatableRead" },
    );
  return JSON.parse(
    JSON.stringify({
      rows: rows.map((r) => ({ ...r, ...attendanceMetrics(r) })),
      total: Number(counts[0].count),
      page: p.page,
      pageSize: 10,
      summary: summary[0],
      settings,
      open: open[0] ?? null,
      today,
    }),
  );
}
