"use client";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFormSheet } from "./form-sheet";
import { pageNumber, isDateKey } from "@/domain/list-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
export { inDates, matches } from "@/domain/list-query";
export { DateField, DateRangePicker, MonthField } from "./date-picker";

export function useQueryState(key: string, fallback = "") {
  const params = useSearchParams();
  const raw = params.get(key) ?? fallback;
  const value =
    key === "period" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)
      ? fallback
      : ["from", "to"].includes(key) && raw && !isDateKey(raw)
        ? fallback
        : raw;
  const set = (value: string) => {
    const next = new URLSearchParams(window.location.search);
    if (value && value !== fallback) next.set(key, value);
    else next.delete(key);
    for (const k of [...next.keys()]) if (k.startsWith("page-")) next.delete(k);
    window.history.replaceState(null, "", `?${next}`);
  };
  return [value, set] as const;
}
export function dateLabel(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat("es-CO", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "America/Bogota",
      }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value))
    : "Sin fecha";
}
export function Choice({
  id,
  name,
  label,
  options,
  value,
  defaultValue,
  onChange,
  required = false,
  disabled = false,
  ...aria
}: {
  id?: string;
  name?: string;
  label?: string;
  options: { id: string; label: string }[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const draft = useFormSheet();
  return (
    <Select
      name={name}
      value={value === undefined ? undefined : value || "__none"}
      defaultValue={
        defaultValue === undefined
          ? options[0]?.id || "__none"
          : defaultValue || "__none"
      }
      onValueChange={(v) => {
        // Radix may emit an empty native-select value while registering new options.
        // The explicit empty choice uses __none, so that transient value is never a user choice.
        if (!v) return;
        draft.change();
        onChange?.(v === "__none" ? "" : v);
      }}
      required={required}
      disabled={disabled}
    >
      <SelectTrigger {...aria} id={id} aria-label={label} className="w-full">
        <SelectValue placeholder="Seleccionar" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((o) => (
            <SelectItem key={o.id || "__none"} value={o.id || "__none"}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
export function usePagination(total: number, key: string) {
  const params = useSearchParams();
  const size = [10, 25, 50].includes(Number(params.get("size")))
    ? Number(params.get("size"))
    : 10;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = pageNumber(params.get(`page-${key}`), pages);
  const set = (next: number) => {
    const q = new URLSearchParams(window.location.search);
    q.set(`page-${key}`, String(next));
    window.history.replaceState(null, "", `?${q}`);
  };
  return { page, size, pages, set, start: (page - 1) * size };
}
export function Pager({
  total,
  state,
}: {
  total: number;
  state: ReturnType<typeof usePagination>;
}) {
  const [, setSize] = useQueryState("size", "10");
  return (
    <TablePagination
      total={total}
      page={state.page}
      pageSize={state.size}
      onPageChange={state.set}
      onPageSizeChange={(size) => setSize(String(size))}
    />
  );
}

export function TablePagination({
  total,
  page,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  disabled = false,
}: {
  total: number;
  page: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  disabled?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = total === 0 ? 1 : Math.max(1, Math.min(page, pages));
  const start = (current - 1) * pageSize;
  const unavailable = disabled || total === 0;
  return (
    <div className="table-pagination">
      <span role="status" className="tabular-nums text-muted-foreground">
        {total ? start + 1 : 0}–{Math.min(start + pageSize, total)} de {total}
      </span>
      <Choice
        label="Filas por página"
        value={String(pageSize)}
        disabled={unavailable || !onPageSizeChange}
        onChange={(value) => onPageSizeChange?.(Number(value))}
        options={[...new Set([10, 25, 50, pageSize])]
          .sort((a, b) => a - b)
          .map((size) => ({ id: String(size), label: `${size} por página` }))}
      />
      <Pagination aria-label="Paginación">
        <PaginationContent>
          <PaginationItem>
            <Button
              variant="outline"
              size="icon"
              aria-label="Página anterior"
              disabled={unavailable || current <= 1}
              onClick={() => onPageChange(current - 1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
          </PaginationItem>
          <PaginationItem>
            <span
              className="tabular-nums"
              aria-label={`Página ${current} de ${pages}`}
            >
              {current} / {pages}
            </span>
          </PaginationItem>
          <PaginationItem>
            <Button
              variant="outline"
              size="icon"
              aria-label="Página siguiente"
              disabled={unavailable || current >= pages}
              onClick={() => onPageChange(current + 1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div
      className="visible-filters"
      role="search"
      aria-label="Filtros de la vista"
    >
      {children}
    </div>
  );
}
export function ClearFilters({
  active,
  onClear,
}: {
  active: boolean;
  onClear: () => void;
}) {
  return (
    <Button
      variant="ghost"
      className="clear-filters"
      aria-label="Limpiar filtros"
      disabled={!active}
      onClick={onClear}
    >
      Limpiar
    </Button>
  );
}
