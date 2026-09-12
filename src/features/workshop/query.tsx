"use client";
import { useSearchParams } from "next/navigation";
import { parseSort, sortSnapshot } from "@/domain/table-sort";
import { executeOperation } from "@/app/operation-actions";
import { applyDemoOperation } from "@/domain/demo-operations";
import type { OperationsView } from "@/domain/operations-view";
import type { OrderView } from "@/domain/workshop-view";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";

export type WorkshopSnapshot = {
  orders: OrderView[];
  operations: OperationsView;
  locations: { id: string; name: string }[];
};
type Scope = { actorId: string; demo: boolean };
const ScopeContext = createContext<Scope | null>(null);
export const snapshotKey = (actorId: string) => ["workshop", actorId] as const;
export function assertConnected() {
  if (typeof navigator !== "undefined" && !navigator.onLine)
    throw new Error("Sin conexión. Conéctate y vuelve a guardar.");
}
export function WorkshopQueryProvider({
  actorId,
  demo,
  initial,
  children,
}: {
  actorId: string;
  demo: boolean;
  initial: WorkshopSnapshot;
  children: ReactNode;
}) {
  const [client] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
        mutations: { retry: false, networkMode: "always" },
      },
    });
    client.setQueryData(snapshotKey(actorId), initial);
    return client;
  });
  return (
    <QueryClientProvider client={client}>
      <ScopeContext.Provider value={{ actorId, demo }}>
        {children}
      </ScopeContext.Provider>
    </QueryClientProvider>
  );
}
export function useWorkshopScope() {
  const scope = useContext(ScopeContext);
  if (!scope) throw new Error("WorkshopQueryProvider requerido");
  return scope;
}
export function useWorkshopQuery<T = WorkshopSnapshot>(
  select?: (data: WorkshopSnapshot) => T,
) {
  const { actorId, demo } = useWorkshopScope();
  const client = useQueryClient();
  const params = useSearchParams();
  let sort;
  try {
    sort = parseSort(new URLSearchParams(params.toString()));
  } catch {
    sort = undefined;
  }
  const suffix = sort
    ? new URLSearchParams({
        table: sort.table,
        orderBy: sort.field,
        direction: sort.direction,
      }).toString()
    : "";
  return useQuery({
    queryKey: snapshotKey(actorId),
    placeholderData: (previous) =>
      previous ?? client.getQueryData<WorkshopSnapshot>(snapshotKey(actorId)),
    enabled: !demo,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/workshop", {
        signal,
        cache: "no-store",
      });
      if (response.status === 401 || response.status === 403) {
        client.clear();
        window.location.assign("/login");
        throw new Error("La sesión terminó. Ingresa de nuevo.");
      }
      if (!response.ok)
        throw new Error(
          "No se pudieron actualizar los datos. Reintenta la consulta.",
        );
      const result = (await response.json()) as WorkshopSnapshot & {
        actorId: string;
      };
      if (result.actorId !== actorId) {
        client.clear();
        window.location.assign("/login");
        throw new Error("Cambió la sesión.");
      }
      return result;
    },
    select: (data: WorkshopSnapshot) => {
      const value = sortSnapshot(data, sort);
      return select ? select(value) : (value as T);
    },
  });
}
export function useOperationMutation(feature: string) {
  const scope = useWorkshopScope();
  const client = useQueryClient();
  const key = snapshotKey(scope.actorId);
  return useMutation({
    mutationKey: [feature, "write"],
    mutationFn: async ({
      kind,
      input,
    }: {
      kind: string;
      input: Record<string, unknown>;
    }) => {
      if (scope.demo) {
        const current = client.getQueryData<WorkshopSnapshot>(key)!;
        const next = applyDemoOperation(
          kind,
          input,
          current.operations,
          current.orders,
        );
        client.setQueryData(key, {
          ...current,
          orders: next.orders,
          operations: next.data,
        });
        return;
      }
      assertConnected();
      const result = await executeOperation(kind, input);
      if (!result.ok)
        throw Object.assign(new Error(result.error), {
          fields: result.fields ?? {},
        });
      return result;
    },
    onSuccess: async () => {
      if (!scope.demo)
        await Promise.all([
          client.invalidateQueries({ queryKey: key }),
          ...(
            [
              "control",
              "commerce",
              "records",
              "observations",
              "team",
              "activity",
            ] as const
          ).map((feature) =>
            client.invalidateQueries({ queryKey: [feature, scope.actorId] }),
          ),
        ]);
    },
  });
}
