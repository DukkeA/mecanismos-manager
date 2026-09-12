import {it,expect} from "vitest";
import {attendanceMetrics} from "@/domain/attendance";
it("handles overnight shifts, breaks, tolerance and additional time",()=>{
 expect(attendanceMetrics({startedAt:"2026-09-10T22:04:00-05:00",endedAt:"2026-09-11T07:04:00-05:00",expectedStart:"2026-09-10T22:00:00-05:00",expectedEnd:"2026-09-11T06:00:00-05:00",breakMinutes:30,graceMinutes:5})).toEqual({workedMinutes:510,lateMinutes:0,extraMinutes:60});
});
it("does not estimate additional time while a shift is open",()=>{
 expect(attendanceMetrics({startedAt:"2026-09-10T08:15:00-05:00",endedAt:null,expectedStart:"2026-09-10T08:00:00-05:00",expectedEnd:"2026-09-10T17:00:00-05:00",breakMinutes:60,graceMinutes:5})).toEqual({workedMinutes:null,lateMinutes:15,extraMinutes:null});
});
