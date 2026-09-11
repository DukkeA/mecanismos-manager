"use client";
import type { ReactNode } from "react";
import { SortableHead } from "./sortable-head";
import type { TableKey } from "@/domain/table-sort";
import { useRecordPage } from "@/features/records/hooks";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "./ui/table";
import { Pager, usePagination } from "./workshop-controls";
import { Skeleton } from "./ui/skeleton";
import { Alert, AlertTitle } from "./ui/alert";
export function DataTable({
  tableKey,
  headers,
  empty,
  children = [],
  mobileRows,
  fallbackRows,
  renderRow,
  renderMobileRow,
}: {
  tableKey?: TableKey;
  headers: string[];
  empty: string;
  children?: ReactNode[];
  mobileRows?: ReactNode[];
  fallbackRows?: unknown[];
  renderRow?: (row: unknown) => ReactNode;
  renderMobileRow?: (row: unknown) => ReactNode;
}) {
  const query = useRecordPage<unknown>(renderRow ? tableKey : undefined),
    local = fallbackRows ?? [],
    total = query.serverEnabled
      ? (query.data?.total ?? 0)
      : fallbackRows
        ? local.length
        : children.length;
  const pagination = usePagination(
    total,
    tableKey ??
      headers
        .join("-")
        .toLowerCase()
        .replace(/[^a-z]/g, "")
        .slice(0, 45),
  );
  const rows = query.serverEnabled
      ? (query.data?.rows ?? [])
      : local.slice(pagination.start, pagination.start + pagination.size),
    visible = renderRow
      ? rows.map(renderRow)
      : children.slice(pagination.start, pagination.start + pagination.size),
    mobile = renderMobileRow
      ? rows.map(renderMobileRow)
      : mobileRows?.slice(pagination.start, pagination.start + pagination.size);
  if (query.serverEnabled && query.isPending)
    return <Skeleton className="h-48" />;
  if (query.serverEnabled && query.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>{query.error.message}</AlertTitle>
      </Alert>
    );
  return (
    <div className="data-panel" data-has-mobile-rows={!!mobile}>
      {visible.length ? (
        <>
          {mobile && <ul className="mobile-data-list">{mobile}</ul>}
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((h, i) =>
                  tableKey ? (
                    <SortableHead key={h} table={tableKey} index={i}>
                      {h}
                    </SortableHead>
                  ) : (
                    <TableHead key={h}>{h}</TableHead>
                  ),
                )}
              </TableRow>
            </TableHeader>
            <TableBody>{visible}</TableBody>
          </Table>
        </>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Sin registros</EmptyTitle>
            <EmptyDescription>{empty}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <Pager total={total} state={pagination} />
    </div>
  );
}
