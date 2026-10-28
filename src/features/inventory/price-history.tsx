"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkshopScope } from "@/features/workshop/query";
import type { InventoryPricePage } from "@/domain/inventory-history";
import { Badge } from "@/components/ui/badge";
import { TablePagination, dateLabel } from "@/components/workshop-controls";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cop } from "@/features/cash/summary";
const conditions: Record<string, string> = {
  NEW: "Nuevo",
  USED: "Usado",
  REBUILT: "Reconstruido",
};
const statuses: Record<string, string> = {
  ACTIVE: "",
  REVERSED: "Revertida",
  VOID: "Anulada",
  RETURNED: "Devuelta",
  PARTIAL_RETURN: "Devolución parcial",
};
export function PriceHistory({ itemId }: { itemId: string }) {
  const [kind, setKind] = useState("PURCHASE");
  return (
    <section className="flex flex-col gap-4">
      <h3>Historial de precios</h3>
      <p className="text-sm text-muted-foreground">
        Consulta los precios registrados en cada recepción y venta.
      </p>
      <ToggleGroup
        type="single"
        value={kind}
        onValueChange={(value) => {
          if (value) setKind(value);
        }}
        aria-label="Tipo de precio"
      >
        <ToggleGroupItem value="PURCHASE">Compras</ToggleGroupItem>
        <ToggleGroupItem value="SALE">Ventas</ToggleGroupItem>
      </ToggleGroup>
      <PriceRows key={`${itemId}-${kind}`} itemId={itemId} kind={kind} />
    </section>
  );
}
function PriceRows({ itemId, kind }: { itemId: string; kind: string }) {
  const { actorId, demo } = useWorkshopScope();
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ itemId, kind, page: String(page) });
  const query = useQuery({
    queryKey: ["inventory-history", actorId, params.toString()],
    enabled: !demo,
    queryFn: async ({ signal }): Promise<InventoryPricePage> => {
      const response = await fetch(`/api/inventory-history?${params}`, {
        signal,
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      return body;
    },
  });
  if (demo) return <p>El historial está disponible al ingresar al taller.</p>;
  if (query.isPending) return <Skeleton className="h-40" />;
  if (query.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>{query.error.message}</AlertTitle>
      </Alert>
    );
  return (
    <div className="data-panel">
      {query.data.rows.length ? (
        <ul className="flex flex-col divide-y" aria-label="Precios registrados">
          {query.data.rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-sm text-muted-foreground">
                  {dateLabel(row.date)}
                </span>
                <div className="text-right">
                  <strong>
                    {row.unitPrice === null
                      ? "Sin costo registrado"
                      : cop(row.unitPrice)}
                  </strong>
                  <p className="text-xs text-muted-foreground">
                    Precio por unidad
                  </p>
                  {row.unitPrice !== row.netUnitPrice &&
                    row.netUnitPrice !== null && (
                      <p className="text-sm">
                        Con descuento: {cop(row.netUnitPrice)}
                      </p>
                    )}
                </div>
              </div>
              <p className="break-words">{row.counterparty}</p>
              <p className="break-words text-sm text-muted-foreground">
                {row.document}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>Cantidad: {Number(row.quantity)}</span>
                <Badge variant="secondary">
                  {conditions[row.condition] ?? row.condition}
                </Badge>
                {statuses[row.status] && (
                  <Badge variant="outline">{statuses[row.status]}</Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-4">
          {kind === "PURCHASE"
            ? "No hay entradas de compra registradas para este repuesto."
            : "No hay ventas registradas para este repuesto."}
        </p>
      )}
      <TablePagination
        total={query.data.total}
        page={query.data.page}
        pageSize={10}
        onPageChange={setPage}
      />
    </div>
  );
}
