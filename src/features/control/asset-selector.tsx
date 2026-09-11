"use client";
import { useState } from "react";
import { useControlPage } from "./hooks";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Choice } from "@/components/workshop-controls";
export function AssetSelector({
  customerId,
  onKind,
}: {
  customerId: string;
  onKind: (kind: string) => void;
}) {
  const [q, setQ] = useState(""),
    [value, setValue] = useState("");
  const query = useControlPage(
    new URLSearchParams({ resource: "assets", customerId, q, pageSize: "50" }),
  );
  return (
    <Field>
      <FieldLabel htmlFor="asset-choice">Activo existente</FieldLabel>
      <Input
        aria-label="Buscar activo del cliente"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar placa, serie o descripción"
      />
      <Choice
        id="asset-choice"
        name="assetId"
        value={value}
        onChange={(id) => {
          setValue(id);
          const row = query.data?.rows.find((r) => r.id === id);
          if (row?.status) onKind(row.status);
        }}
        options={[
          { id: "", label: "Crear o localizar por la placa / serie indicada" },
          ...(query.data?.rows ?? []).map((r) => ({
            id: r.id,
            label: `${r.title} · ${r.data.plate || r.data.serial}`,
          })),
        ]}
      />
      <FieldDescription>
        {query.isError
          ? "No se pudieron consultar los activos. Reintenta la búsqueda."
          : "Seleccionar un activo conserva su historial de trabajos."}
      </FieldDescription>
    </Field>
  );
}
