"use client";
import { MessageSquare as EmptyMessageSquare } from "lucide-react";
import { DataEmpty } from "@/components/data-empty";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkshopScope } from "@/features/workshop/query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { dateLabel } from "@/components/workshop-controls";
export function ObservationHistory({ orderId }: { orderId: string }) {
  const [page, setPage] = useState(1),
    { actorId } = useWorkshopScope();
  const query = useQuery({
    queryKey: ["observations", actorId, orderId, page],
    queryFn: async ({ signal }) => {
      const r = await fetch(
        `/api/observations?${new URLSearchParams({ orderId, page: String(page) })}`,
        { signal, cache: "no-store" },
      );
      if (!r.ok) throw new Error("No se pudo cargar el historial.");
      return r.json() as Promise<{
        rows: {
          id: string;
          body: string;
          createdAt: string;
          member: { name: string };
        }[];
        total: number;
      }>;
    },
  });
  if (query.isPending) return <Skeleton className="h-24" />;
  if (query.isError)
    return <p className="text-sm text-destructive">{query.error.message}</p>;
  return (
    <>
      {query.data.rows.length === 0 && (
        <DataEmpty
          icon={EmptyMessageSquare}
          compact
          title="Sin observaciones"
          description="Las notas del trabajo aparecerán con su autor y fecha."
        />
      )}
      <ol className="observation-list">
        {query.data.rows.map((n) => (
          <li key={n.id}>
            <p>{n.body}</p>
            <small>
              {n.member.name} · {dateLabel(n.createdAt)}
            </small>
          </li>
        ))}
      </ol>
      <div className="flex justify-between items-center gap-3 mt-3">
        <span className="text-xs text-muted-foreground">
          {query.data.total} observaciones
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Anteriores
          </Button>
          <Button
            variant="outline"
            disabled={page * 20 >= query.data.total}
            onClick={() => setPage(page + 1)}
          >
            Más antiguas
          </Button>
        </div>
      </div>
    </>
  );
}
