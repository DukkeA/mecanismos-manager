"use client";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useWorkshopScope } from "@/features/workshop/query";
import type { TableKey } from "@/domain/table-sort";
export type RecordPage<T> = {
  table: string;
  rows: T[];
  total: number;
  page: number;
  size: number;
};
export function useRecordPage<T>(table: TableKey | undefined) {
  const params = useSearchParams(),
    { actorId, demo } = useWorkshopScope(),
    enabled = !!table && !table.endsWith("Detail") && !demo;
  const query = new URLSearchParams({
    table: table ?? "",
    page: params.get(`page-${table}`) ?? "1",
    size: params.get("size") ?? "10",
  });
  for (const key of [
    "q",
    "status",
    "archive",
    "brand",
    "businessCategoryId",
    "location",
    "responsible",
    "kind",
    "period",
    "from",
    "to",
    "min",
    "max",
  ])
    if (params.get(key)) query.set(key, params.get(key)!);
  if (params.get("table") === table)
    for (const key of ["orderBy", "direction"])
      if (params.get(key)) query.set(key, params.get(key)!);
  return {
    ...useQuery({
      queryKey: ["records", actorId, query.toString()],
      enabled,
      queryFn: async ({ signal }) => {
        const r = await fetch(`/api/records?${query}`, {
            signal,
            cache: "no-store",
          }),
          body = await r.json();
        if (!r.ok) throw new Error(body.error);
        return body as RecordPage<T>;
      },
    }),
    serverEnabled: enabled,
  };
}
