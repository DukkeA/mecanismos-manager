"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { controlCommand } from "@/app/control-actions";
import {
  assertConnected,
  snapshotKey,
  useWorkshopScope,
} from "@/features/workshop/query";
import type { HubPage } from "@/domain/hub";
export function useControlPage(params: URLSearchParams, enabled = true) {
  const { actorId } = useWorkshopScope();
  return useQuery({
    queryKey: ["control", actorId, params.toString()],
    enabled,
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/control?${params}`, {
          signal,
          cache: "no-store",
        }),
        body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "No se pudo consultar.");
      return body as HubPage;
    },
  });
}
export function useControlCommand() {
  const client = useQueryClient(),
    { actorId } = useWorkshopScope();
  return useMutation({
    mutationFn: async ({
      kind,
      input,
    }: {
      kind: Parameters<typeof controlCommand>[0];
      input: unknown;
    }) => {
      assertConnected();
      const r = await controlCommand(kind, input);
      if (!r.ok) throw new Error(r.error);
      return r;
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["control", actorId] }),
        client.invalidateQueries({ queryKey: ["commerce", actorId] }),
        client.invalidateQueries({ queryKey: snapshotKey(actorId) }),
        client.invalidateQueries({ queryKey: ["records", actorId] }),
      ]);
    },
  });
}

export type ManagementReportData = {
  groups: {
    type: string;
    sales: number;
    affected: number;
    cases: number;
    margin: string;
    incomplete: number;
    warrantyCost: string;
    warrantyUnknown: number;
  }[];
  causes: { cause: string; cases: number }[];
  team: { name: string; minutes: number; completed: number; open: number }[];
};

export function useManagementReport(from?: string, to?: string) {
  const { actorId } = useWorkshopScope();
  return useQuery({
    queryKey: ["control", actorId, "report", from, to],
    queryFn: async ({ signal }) => {
      const q = new URLSearchParams();
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      const r = await fetch(`/api/reports?${q}`, { signal, cache: "no-store" });
      if (!r.ok) throw Error("No se pudo consultar el informe.");
      return r.json() as Promise<ManagementReportData>;
    },
  });
}
