import type { OperationsView } from "@/domain/operations-view";
import Decimal from "decimal.js";
export const cop = (value: string | number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value));
export const todayInBogota = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function cashSummary(
  data: Pick<OperationsView, "accounts" | "obligations" | "cashEntries">,
  period: string,
  today: string,
) {
  const obligations = data.obligations.filter((o) => o.period === period);
  const total = obligations.reduce((s, o) => s.plus(o.amount), new Decimal(0));
  const paid = obligations.reduce((s, o) => s.plus(o.paid), new Decimal(0));
  const remaining = total.minus(paid);
  const available = data.accounts.reduce(
    (s, a) => s.plus(a.balance),
    new Decimal(0),
  );
  const overdue = data.obligations.filter(
    (o) => o.dueOn < today && new Decimal(o.amount).gt(o.paid),
  );
  const entries = data.cashEntries.filter((e) =>
    e.occurredOn.startsWith(period),
  );
  const inflow = entries
    .filter((e) => e.direction === "IN")
    .reduce((s, e) => s.plus(e.amount), new Decimal(0));
  const outflow = entries
    .filter((e) => e.direction === "OUT")
    .reduce((s, e) => s.plus(e.amount), new Decimal(0));
  const daily = new Map<
    string,
    { date: string; inflow: number; outflow: number }
  >();
  for (const entry of entries) {
    const row = daily.get(entry.occurredOn) ?? {
      date: entry.occurredOn,
      inflow: 0,
      outflow: 0,
    };
    if (entry.direction === "IN") row.inflow += Number(entry.amount);
    else row.outflow += Number(entry.amount);
    daily.set(entry.occurredOn, row);
  }
  return {
    hasAccounts: data.accounts.length > 0,
    hasObligations: obligations.length > 0,
    total: total.toFixed(2),
    paid: paid.toFixed(2),
    remaining: remaining.toFixed(2),
    available: available.toFixed(2),
    shortfall: Decimal.max(0, remaining.minus(available)).toFixed(2),
    percent: total.gt(0) ? paid.div(total).mul(100).toNumber() : 0,
    inflow: inflow.toFixed(2),
    outflow: outflow.toFixed(2),
    net: inflow.minus(outflow).toFixed(2),
    overdue,
    series: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    next: data.obligations
      .filter((o) => new Decimal(o.amount).gt(o.paid))
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
      .slice(0, 3),
  };
}
