"use client";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "./ui/table";
import { Pager, usePagination } from "./workshop-controls";
export function DataTable({
  headers,
  empty,
  children,
  mobileRows,
}: {
  headers: string[];
  empty: string;
  children: React.ReactNode[];
  mobileRows?: React.ReactNode[];
}) {
  const pagination = usePagination(
    children.length,
    headers
      .join("-")
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .slice(0, 45),
  );

  return (
    <div className="data-panel" data-has-mobile-rows={!!mobileRows}>
      {children.length ? (
        <>
          {mobileRows && (
            <ul className="mobile-data-list">
              {mobileRows.slice(
                pagination.start,
                pagination.start + pagination.size,
              )}
            </ul>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {children.slice(
                pagination.start,
                pagination.start + pagination.size,
              )}
            </TableBody>
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
      <Pager total={children.length} state={pagination} />
    </div>
  );
}
