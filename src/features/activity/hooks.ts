"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkshopScope, assertConnected } from "@/features/workshop/query";
import { markNotificationsRead } from "@/app/activity-actions";
export function useActivity<T>(params: URLSearchParams, enabled = true) {
  const { actorId, demo } = useWorkshopScope();
  return useQuery({
    queryKey: ["activity", actorId, params.toString()],
    enabled: enabled && !demo,
    refetchInterval: 30000,
    queryFn: async ({ signal }): Promise<T> => {
      const response = await fetch(`/api/activity?${params}`, {
        signal,
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      return data;
    },
  });
}
export function useReadNotifications() {
  const client = useQueryClient(),
    { actorId } = useWorkshopScope();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      assertConnected();
      await markNotificationsRead({ ids });
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["activity", actorId] }),
  });
}
