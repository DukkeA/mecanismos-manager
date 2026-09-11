"use client";
import { useOperationMutation, useWorkshopQuery } from "../workshop/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assertConnected,
  snapshotKey,
  useWorkshopScope,
} from "../workshop/query";
import { teamCommand } from "@/app/team-actions";
import type { Compensation, OvertimePage, TeamOverview } from "@/domain/team";
export const useTeam = () =>
  useWorkshopQuery((data) => data.operations.members);
export const useTeamMutation = () => useOperationMutation("team");

function useTeamRequest<T>(params: URLSearchParams, enabled = true) {
  const { actorId, demo } = useWorkshopScope();
  return useQuery({
    queryKey: ["team", actorId, params.toString()],
    enabled: enabled && !demo,
    queryFn: async ({ signal }): Promise<T> => {
      const response = await fetch(`/api/team?${params}`, {
        signal,
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "No se pudo consultar el equipo.");
      return body;
    },
  });
}
export const useTeamOverview = (period: string) =>
  useTeamRequest<TeamOverview>(new URLSearchParams({ period }));
export const useCompensationHistory = (memberId?: string) =>
  useTeamRequest<Compensation[]>(
    new URLSearchParams({ resource: "history", memberId: memberId ?? "" }),
    !!memberId,
  );
export const useOvertime = (params: URLSearchParams, enabled = true) =>
  useTeamRequest<OvertimePage>(
    new URLSearchParams({
      ...Object.fromEntries(params),
      resource: "overtime",
    }),
    enabled,
  );
export function useTeamCommand() {
  const client = useQueryClient(),
    { actorId } = useWorkshopScope();
  return useMutation({
    mutationFn: async ({
      kind,
      input,
    }: {
      kind: Parameters<typeof teamCommand>[0];
      input: unknown;
    }) => {
      assertConnected();
      const result = await teamCommand(kind, input);
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: async () => {
      await Promise.all([
        ...["team", "records", "control"].map((feature) =>
          client.invalidateQueries({ queryKey: [feature, actorId] }),
        ),
        client.invalidateQueries({ queryKey: snapshotKey(actorId) }),
      ]);
    },
  });
}
