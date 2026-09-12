import type { WorkshopSettings } from "./workshop-settings";
export const minuteOfDay = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export function attendanceMetrics(s: {
  startedAt: string | Date;
  endedAt: string | Date | null;
  expectedStart: string | Date | null;
  expectedEnd: string | Date | null;
  breakMinutes: number;
  graceMinutes: number;
  excusedLateMinutes?: number;
}) {
  const start = new Date(s.startedAt).getTime(),
    planned = s.expectedStart ? new Date(s.expectedStart).getTime() : null;
  const delay =
    planned === null
      ? null
      : Math.max(
          0,
          Math.ceil((start - planned) / 60000) - (s.excusedLateMinutes ?? 0),
        );
  const lateMinutes =
    delay === null ? null : delay > s.graceMinutes ? delay : 0;
  const workedMinutes = s.endedAt
    ? Math.max(
        0,
        Math.floor((new Date(s.endedAt).getTime() - start) / 60000) -
          s.breakMinutes,
      )
    : null;
  const expectedMinutes =
    planned !== null && s.expectedEnd
      ? Math.max(
          0,
          (new Date(s.expectedEnd).getTime() - planned) / 60000 -
            s.breakMinutes,
        )
      : null;
  return {
    lateMinutes,
    workedMinutes,
    extraMinutes:
      workedMinutes !== null && expectedMinutes !== null
        ? Math.max(0, workedMinutes - expectedMinutes)
        : null,
  };
}
export type AttendanceRow = {
  id: string;
  memberId: string;
  name: string;
  location: string;
  locationId: string;
  workedOn: string;
  startedAt: string;
  endedAt: string | null;
  expectedStart: string | null;
  expectedEnd: string | null;
  breakMinutes: number;
  graceMinutes: number;
  excusedLateMinutes: number;
  authorizedMinutes: number;
  source: string;
  note: string;
  lateMinutes: number | null;
  workedMinutes: number | null;
  extraMinutes: number | null;
};
export type AttendancePage = {
  rows: AttendanceRow[];
  total: number;
  page: number;
  pageSize: number;
  open: { id: string; startedAt: string; location: string } | null;
  today: { startedAt: string; endedAt: string | null } | null;
  summary: {
    workedMinutes: number;
    lateMinutes: number;
    extraMinutes: number;
    open: number;
    withoutSchedule: number;
  };
  settings: WorkshopSettings;
};
