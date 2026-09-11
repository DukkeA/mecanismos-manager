"use client";
import { SortableHead } from "./sortable-head";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { statusLabels, type OrderView } from "@/domain/workshop-view";
import {
  FilterBar,
  ClearFilters,
  Choice,
  dateLabel,
  DateRangePicker,
  inDates,
  matches,
  Pager,
  usePagination,
  useQueryState,
} from "./workshop-controls";

export function OrdersList({
  orders,
  openOrder,
  createAction,
}: {
  createAction?: React.ReactNode;
  orders: OrderView[];
  openOrder: (id: string) => void;
}) {
  const [q, setQ] = useQueryState("q");
  const [status, setStatus] = useQueryState("status", "ALL");
  const [kind, setKind] = useQueryState("kind", "ALL");
  const [from, setFrom] = useQueryState("from");
  const [to, setTo] = useQueryState("to");
  const [location, setLocation] = useQueryState("location", "ALL");
  const filtered = orders.filter(
    (o) =>
      matches(
        `OT-${String(o.number).padStart(4, "0")} OT-${o.number} ${o.number} ${o.title} ${o.reference} ${o.customer} ${o.responsible} ${o.family}`,
        q,
      ) &&
      (status === "ALL" ||
        (status === "OPEN"
          ? !["CLOSED", "CANCELLED"].includes(o.status)
          : o.status === status)) &&
      (kind === "ALL" || o.kind === kind) &&
      (location === "ALL" || o.location === location) &&
      inDates(o.receivedAt, from, to),
  );
  const pagination = usePagination(filtered.length, "orders");
  return (
    <section className="orders-list">
      <div className="operations-heading">
        <p>Ingresos, reparaciones y entregas del taller.</p>
        {createAction}
      </div>
      <FilterBar>
        <label className="search-filter">
          Buscar
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Orden, placa, cliente o responsable"
          />
        </label>
        <label>
          Estado
          <Choice
            value={status}
            onChange={setStatus}
            options={[
              { id: "ALL", label: "Todos" },
              { id: "OPEN", label: "Órdenes abiertas" },
              ...Object.entries(statusLabels).map(([id, label]) => ({
                id,
                label,
              })),
            ]}
          />
        </label>
        <label>
          Recepción
          <Choice
            value={kind}
            onChange={setKind}
            options={[
              { id: "ALL", label: "Todos" },
              { id: "VEHICLE", label: "Vehículos" },
              { id: "COMPONENT", label: "Componentes" },
            ]}
          />
        </label>
        <label>
          Sede
          <Choice
            value={location}
            onChange={setLocation}
            options={[
              { id: "ALL", label: "Todas" },
              ...[...new Set(orders.map((o) => o.location))].map((id) => ({
                id,
                label: id,
              })),
            ]}
          />
        </label>
        <label className="range-filter">
          Fecha de ingreso
          <DateRangePicker
            from={from}
            to={to}
            onChange={(from, to) => {
              setFrom(from);
              setTo(to);
            }}
            label="Fecha de ingreso"
          />
        </label>
        <ClearFilters
          active={
            !!(
              q ||
              from ||
              to ||
              status !== "ALL" ||
              kind !== "ALL" ||
              location !== "ALL"
            )
          }
          onClear={() => {
            setQ("");
            setStatus("ALL");
            setKind("ALL");
            setLocation("ALL");
            setFrom("");
            setTo("");
          }}
        />
      </FilterBar>
      {from && to && from > to && (
        <p role="alert">La fecha inicial debe ser anterior a la final.</p>
      )}
      <div className="data-panel">
        <Table>
          <TableHeader>
            <TableRow>
              {[
                "Orden / unidad",
                "Cliente",
                "Estado",
                "Responsable",
                "Ingreso",
                "Entrega prevista",
                "Salida",
              ].map((h, index) => (
                <SortableHead key={h} table="orders" index={index}>
                  {h}
                </SortableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered
              .slice(pagination.start, pagination.start + pagination.size)
              .map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Button variant="link" onClick={() => openOrder(o.id)}>
                      OT-{String(o.number).padStart(4, "0")}
                    </Button>
                    <strong className="cell-detail">{o.title}</strong>
                    <span className="cell-detail">{o.reference}</span>
                  </TableCell>
                  <TableCell>{o.customer}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" data-status={o.status}>
                      {statusLabels[o.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{o.responsible}</TableCell>
                  <TableCell>{dateLabel(o.receivedAt)}</TableCell>
                  <TableCell>{dateLabel(o.dueAt)}</TableCell>
                  <TableCell>
                    {o.closedAt ? dateLabel(o.closedAt) : "—"}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {!filtered.length && (
          <p className="empty-results">No hay órdenes con estos filtros.</p>
        )}
        <Pager total={filtered.length} state={pagination} />
      </div>
    </section>
  );
}
