"use client";
import { useQuery } from "@tanstack/react-query";
import { useWorkshopScope } from "@/features/workshop/query";
import type {
  ProfitabilityJob,
  ProfitabilityOverview,
} from "@/domain/profitability";

function useProfitabilityRequest<T>(params: URLSearchParams, enabled = true) {
  const { actorId, demo } = useWorkshopScope();
  return useQuery({
    queryKey: ["control", actorId, "profitability", params.toString()],
    enabled: enabled && !demo,
    queryFn: async ({ signal }): Promise<T> => {
      const response = await fetch(`/api/reports?${params}`, {
        signal,
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          "No se pudo consultar la rentabilidad. Reintenta la consulta.",
        );
      return response.json();
    },
  });
}
export const useProfitability = (period: string) =>
  useProfitabilityRequest<ProfitabilityOverview>(
    new URLSearchParams({ resource: "profitability", period }),
  );
export const useProfitabilityDetail = (input: {
  orderId?: string;
  saleId?: string;
}) =>
  useProfitabilityRequest<ProfitabilityJob | null>(
    new URLSearchParams({ resource: "profitability-detail", ...input }),
    !!(input.orderId || input.saleId),
  );
