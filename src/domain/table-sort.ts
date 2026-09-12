import Decimal from "decimal.js";
import type { OperationsView } from "./operations-view";
import type { OrderView } from "./workshop-view";

export const tableColumns = {
  stockDetail: ["location", "condition", "quantity", "reserved", "available"],
  offersDetail: ["supplier", "condition", "unitCost", "observedAt"],
  movementsDetail: ["date", "location", "quantity", "reason"],
  orders: [
    "number",
    "customer",
    "status",
    "responsible",
    "receivedAt",
    "dueAt",
    "closedAt",
  ],
  tasks: ["title", "order", "members", "status", "dueAt", null],
  customers: ["name", "document", "contact", "orders", null],
  members: ["name", "email", "role", "active", "monthlySalary", null],
  suppliers: ["name", "phone", "email", "address", null],
  items: ["code", "name", "brand", "unit", null],
  services: ["code", "name", "notes", null],
  balances: [
    "item",
    "location",
    "condition",
    "available",
    "materialCost",
    null,
  ],
  offers: [
    "item",
    "supplier",
    "condition",
    "unitCost",
    "observedAt",
    "evidence",
    null,
  ],
  movements: ["item", "kind", "quantity", "date", null],
  obligations: ["dueOn", "paymentState", "amount", "paid", "pending", null],
  cashEntries: ["occurredOn", "counterparty", "kind", "amount", null],
  accounts: ["name", "balance"],
} as const;
export type TableKey = keyof typeof tableColumns;
export type Sort = {
  table: TableKey;
  field: string;
  direction: "asc" | "desc";
};
export function parseSort(params: URLSearchParams): Sort | undefined {
  const table = params.get("table"),
    field = params.get("orderBy"),
    direction = params.get("direction") ?? "asc";
  if (!table && !field) return;
  if (
    !table ||
    !(table in tableColumns) ||
    !field ||
    !(tableColumns[table as TableKey] as readonly (string | null)[]).includes(
      field,
    ) ||
    !["asc", "desc"].includes(direction)
  )
    throw new Error("Ordenamiento no válido.");
  return {
    table: table as TableKey,
    field,
    direction: direction as Sort["direction"],
  };
}
type Snapshot = {
  orders: OrderView[];
  operations: OperationsView;
  locations: { id: string; name: string }[];
};
type Row = Record<string, unknown>;
const numeric = new Set([
  "reserved",
  "balance",
  "number",
  "orders",
  "available",
  "quantity",
  "materialCost",
  "unitCost",
  "amount",
  "paid",
  "pending",
]);
const collator = new Intl.Collator("es-CO", {
  numeric: true,
  sensitivity: "base",
});
/** Applied on authorized server snapshots before pagination; demo uses the same contract. */
export function sortSnapshot<T extends Snapshot>(snapshot: T, sort?: Sort): T {
  if (!sort) return snapshot;
  const { operations: op } = snapshot;
  const resolve = (row: Row): unknown => {
    switch (sort.field) {
      case "item":
        return op.items.find((i) => i.id === row.itemId)?.name;
      case "location":
        return snapshot.locations.find((l) => l.id === row.locationId)?.name;
      case "supplier":
        return op.suppliers.find((s) => s.id === row.supplierId)?.name;
      case "account":
        return op.accounts.find((a) => a.id === row.accountId)?.name;
      case "order":
        return snapshot.orders.find((o) => o.id === row.orderId)?.number;
      case "members":
        return (row.members as string[])
          .map((id) => op.members.find((m) => m.id === id)?.name ?? "")
          .join(", ");
      case "contact":
        return `${row.phone ?? ""} ${row.email ?? ""}`;
      case "available":
        return new Decimal(String(row.quantity))
          .minus(String(row.reserved))
          .toString();
      case "paymentState":
        return new Decimal(String(row.paid)).gte(String(row.amount))
          ? "Pagado"
          : new Decimal(String(row.paid)).gt(0)
            ? "Parcial"
            : "Pendiente";
      case "pending":
        return new Decimal(String(row.amount))
          .minus(String(row.paid))
          .toString();
      default:
        return row[sort.field];
    }
  };
  const compare = (a: Row, b: Row) => {
    const x = resolve(a),
      y = resolve(b);
    const emptyX = x === undefined || x === null || x === "",
      emptyY = y === undefined || y === null || y === "";
    if (emptyX !== emptyY) return emptyX ? 1 : -1;
    const result = emptyX
      ? 0
      : numeric.has(sort.field) || sort.field === "order"
        ? new Decimal(String(x)).cmp(String(y))
        : collator.compare(String(x), String(y));
    const tie = collator.compare(
      String(a.id ?? `${a.itemId}-${a.locationId}-${a.condition}`),
      String(b.id ?? `${b.itemId}-${b.locationId}-${b.condition}`),
    );
    return result ? result * (sort.direction === "asc" ? 1 : -1) : tie;
  };
  if (sort.table === "orders")
    return {
      ...snapshot,
      orders: [...snapshot.orders].sort((a, b) =>
        compare(a as unknown as Row, b as unknown as Row),
      ),
    };
  const key =
    sort.table === "services"
      ? "items"
      : sort.table === "stockDetail"
        ? "balances"
        : sort.table === "offersDetail"
          ? "offers"
          : sort.table === "movementsDetail"
            ? "movements"
            : sort.table;
  const rows = op[key] as unknown as Row[];
  return {
    ...snapshot,
    operations: {
      ...op,
      [key]: [...rows].sort(compare),
      ...(key === "tasks"
        ? {
            archivedTasks: [...(op.archivedTasks ?? [])].sort((a, b) =>
              compare(a as unknown as Row, b as unknown as Row),
            ),
          }
        : {}),
    },
  };
}
