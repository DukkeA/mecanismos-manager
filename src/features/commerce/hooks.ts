"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commercialCommand } from "@/app/commercial-actions";
import {
  assertConnected,
  snapshotKey,
  useWorkshopScope,
} from "@/features/workshop/query";
import type { CommercialPage } from "@/domain/commercial";
export function useCommercialPage(params: URLSearchParams, enabled = true) {
  const { actorId } = useWorkshopScope();
  return useQuery({
    queryKey: ["commerce", actorId, params.toString()],
    enabled,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/commerce?${params}`, {
        signal,
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo consultar.");
      return body as CommercialPage;
    },
  });
}
export function useCommercialCommand() {
  const client = useQueryClient(),
    { actorId } = useWorkshopScope();
  return useMutation({
    mutationFn: async ({
      kind,
      input,
    }: {
      kind: Parameters<typeof commercialCommand>[0];
      input: unknown;
    }) => {
      assertConnected();
      const result = await commercialCommand(kind, input);
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["commerce", actorId] }),
        client.invalidateQueries({ queryKey: ["control", actorId] }),
        client.invalidateQueries({ queryKey: snapshotKey(actorId) }),
        client.invalidateQueries({ queryKey: ["records", actorId] }),
      ]);
    },
  });
}
