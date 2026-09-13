"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assertConnected, useWorkshopScope } from "@/features/workshop/query";
export type BusinessCategory = {
  id: string;
  name: string;
  active: boolean;
  version: number;
};
export function useCategories() {
  const { actorId, demo } = useWorkshopScope();
  return useQuery({
    queryKey: ["categories", actorId],
    enabled: !demo,
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/categories", { signal, cache: "no-store" });
      if (!r.ok) throw Error("No se pudieron cargar las categorías.");
      return r.json() as Promise<BusinessCategory[]>;
    },
  });
}
export function useCategoryCommand() {
  const { actorId, demo } = useWorkshopScope(),
    client = useQueryClient();
  return useMutation({
    mutationKey: ["category-command", actorId],
    mutationFn: async (command: {
      kind: "save" | "order" | "create";
      input: Record<string, unknown>;
    }) => {
      if (demo) throw Error("Abre el entorno local para guardar categorías.");
      assertConnected();
      const r = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const body = await r.json();
      if (!r.ok) throw Error(body.error);
      return body;
    },
    onSuccess: async (result, command) => {
      if (command.kind === "create") {
        client.setQueryData<BusinessCategory[]>(
          ["categories", actorId],
          (previous = []) =>
            [...previous.filter((c) => c.id !== result.id), result].sort(
              (a, b) => a.name.localeCompare(b.name, "es"),
            ),
        );
      }
      await Promise.all(
        ["categories", "records", "workshop", "control", "commerce"].map(
          (key) => client.invalidateQueries({ queryKey: [key, actorId] }),
        ),
      );
    },
  });
}
