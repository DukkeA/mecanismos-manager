"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkshopScope, assertConnected } from "@/features/workshop/query";
import type { OrganizerItem } from "@/domain/organizer";
export function useOrganizer() {
  const { actorId, demo } = useWorkshopScope();
  return useQuery({
    queryKey: ["organizer", actorId],
    initialData: demo ? ([] as OrganizerItem[]) : undefined,
    enabled: !demo,
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/organizer", { signal, cache: "no-store" }),
        body = await r.json();
      if (!r.ok) throw new Error(body.error);
      return body as OrganizerItem[];
    },
  });
}
export function useOrganizerCommand() {
  const { actorId, demo } = useWorkshopScope(),
    client = useQueryClient();
  return useMutation({
    mutationKey: ["organizer-command", actorId],
    mutationFn: async (command: {
      kind: "save" | "delete";
      input: Record<string, unknown>;
    }) => {
      if (demo) {
        const input = command.input,
          id = String(input.id ?? crypto.randomUUID());
        client.setQueryData<OrganizerItem[]>(
          ["organizer", actorId],
          (previous = []) => {
            if (command.kind === "delete")
              return previous.filter((e) => e.id !== id);
            const entry = {
              completed: false,
              pinned: false,
              priority: "NORMAL",
              ...input,
              id,
              ownerId: actorId,
              author: "Usuario de demostración",
              updatedBy: "Usuario de demostración",
              updatedAt: new Date().toISOString(),
              version: Number(input.version ?? 0) + 1,
            } as OrganizerItem;
            return [entry, ...previous.filter((e) => e.id !== id)].sort(
              (a, b) => Number(b.pinned) - Number(a.pinned),
            );
          },
        );
        return { id };
      }
      assertConnected();
      const r = await fetch("/api/organizer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        }),
        body = await r.json();
      if (!r.ok) throw new Error(body.error);
      return body;
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["organizer", actorId] }),
  });
}
