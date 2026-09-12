"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkshopScope, assertConnected } from "@/features/workshop/query";
import { attendanceCommand } from "@/app/attendance-actions";
import type { AttendancePage } from "@/domain/attendance";
function useAttendanceRequest<T>(
  q: URLSearchParams,
  enabled = true,
  interval?: number,
) {
  const { actorId, demo } = useWorkshopScope();
  return useQuery({
    queryKey: ["attendance", actorId, q.toString()],
    enabled: enabled && !demo,
    refetchInterval: interval,
    retry: false,
    queryFn: async ({ signal }): Promise<T> => {
      const r = await fetch(`/api/attendance?${q}`, {
          signal,
          cache: "no-store",
        }),
        body = await r.json();
      if (!r.ok) throw Error(body.error);
      return body;
    },
  });
}
export const useSettings = () =>
  useAttendanceRequest<import("@/domain/workshop-settings").WorkshopSettings>(
    new URLSearchParams({ resource: "settings" }),
  );
export const useAttendance = (q: URLSearchParams) =>
  useAttendanceRequest<AttendancePage>(q);
export const useStationCode = (locationId: string) =>
  useAttendanceRequest<{ token: string; expiresAt: number; serverNow: number }>(
    new URLSearchParams({ resource: "code", locationId }),
    !!locationId,
    3000,
  );
export function useAttendanceCommand() {
  const client = useQueryClient(),
    { actorId } = useWorkshopScope();
  return useMutation({
    mutationFn: async ({
      kind,
      input,
    }: {
      kind: Parameters<typeof attendanceCommand>[0];
      input: unknown;
    }) => {
      assertConnected();
      const r = await attendanceCommand(kind, input);
      if (!r.ok) throw Error(r.error);
      return r;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["attendance", actorId] });
    },
  });
}
