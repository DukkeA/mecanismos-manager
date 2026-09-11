"use client";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { TableHead } from "./ui/table";
import { Button } from "./ui/button";
import { tableColumns, type TableKey } from "@/domain/table-sort";

export function SortableHead({
  table,
  index,
  children,
}: {
  table: TableKey;
  index: number;
  children: string;
}) {
  const params = useSearchParams();
  const field = tableColumns[table][index];
  const active =
    params.get("table") === table && params.get("orderBy") === field;
  const descending = active && params.get("direction") === "desc";
  if (!field) return <TableHead>{children}</TableHead>;
  const Icon = active ? (descending ? ArrowDown : ArrowUp) : ArrowUpDown;
  return (
    <TableHead
      aria-sort={active ? (descending ? "descending" : "ascending") : "none"}
    >
      <Button
        variant="ghost"
        size="sm"
        className="sort-heading"
        aria-label={`Ordenar por ${children}: ${active && !descending ? "descendente" : "ascendente"}`}
        onClick={() => {
          const next = new URLSearchParams(window.location.search);
          next.set("table", table);
          next.set("orderBy", field);
          next.set("direction", active && !descending ? "desc" : "asc");
          for (const key of [...next.keys()])
            if (key.startsWith("page-")) next.delete(key);
          window.history.replaceState(null, "", `?${next}`);
        }}
      >
        {children}
        <Icon data-icon="inline-end" aria-hidden="true" />
      </Button>
    </TableHead>
  );
}
