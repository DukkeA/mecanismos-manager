"use client";
import { useState } from "react";
import { useCommercialPage } from "./hooks";
import { Input } from "@/components/ui/input";
import { Choice } from "@/components/workshop-controls";
import { cop } from "@/features/cash/summary";

export function SalePicker({ id, name, customerId }: {
  id: string;
  name: string;
  customerId?: string;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<{ id: string; label: string } | null>(null);
  const params = new URLSearchParams({ resource: "sales", status: "ISSUED", pageSize: "10", q });
  if (customerId) params.set("customerId", customerId);
  const query = useCommercialPage(params);
  const options = (query.data?.rows ?? []).map(sale => ({
    id: sale.id,
    label: `Venta ${sale.number} · ${sale.customer} · ${cop(sale.balance)} pendientes`,
  }));
  if (selected && !options.some(option => option.id === selected.id)) options.unshift(selected);

  return (
    <div className="space-y-2">
      <Input aria-label="Buscar venta por número o cliente" placeholder="Número de venta, cliente o concepto"
        value={q} onChange={event => setQ(event.target.value)} />
      <Choice id={id} name={name} value={selected?.id ?? ""}
        onChange={value => setSelected(options.find(option => option.id === value) ?? null)}
        options={options} required />
      {query.isError ? (
        <p role="alert" className="text-sm text-destructive">{query.error.message}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {query.isPending ? "Buscando ventas…" : `${query.data.total} ${query.data.total === 1 ? "venta encontrada" : "ventas encontradas"}. La búsqueda consulta todo el historial.`}
        </p>
      )}
    </div>
  );
}
