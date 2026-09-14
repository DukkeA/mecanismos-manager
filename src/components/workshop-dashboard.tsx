"use client";
import {
  Bell as EmptyBell,
  ClipboardList as EmptyClipboardList,
  Inbox as EmptyInbox,
  MessageSquare as EmptyMessageSquare,
} from "lucide-react";
import { DataEmpty } from "@/components/data-empty";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { OperationsView } from "@/domain/operations-view";
import type { Role } from "@/domain/permissions";
import { statusLabels, type OrderView } from "@/domain/workshop-view";
import { FinancialOverview } from "@/features/cash/financial-overview";
import { todayInBogota } from "@/features/cash/summary";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Choice, dateLabel, useQueryState } from "./workshop-controls";

export function WorkshopDashboard({
  orders,
  data,
  role,
  openOrder,
  navigate,
}: {
  orders: OrderView[];
  data: OperationsView;
  role: Role;
  openOrder: (id: string) => void;
  navigate: (section: string, status?: string) => void;
}) {
  const reducedMotion = useReducedMotion();
  const [financialPeriod, setFinancialPeriod] = useQueryState(
    "period",
    todayInBogota().slice(0, 7),
  );
  const [days, setDays] = useQueryState("days", "30");
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - Number(days));
  const open = orders.filter(
    (o) => !["CLOSED", "CANCELLED"].includes(o.status),
  );
  const overdue = open.filter((o) => o.dueAt && new Date(o.dueAt) < now);
  const ready = open.filter((o) => o.status === "READY");
  const blocked = data.tasks.filter((t) => t.status === "BLOCKED");
  const received = orders.filter(
    (o) => o.receivedAt && new Date(o.receivedAt) >= cutoff,
  );
  const closed = orders.filter(
    (o) => o.closedAt && new Date(o.closedAt) >= cutoff,
  );
  const chart = Object.entries(statusLabels)
    .filter(([status]) => !["CLOSED", "CANCELLED"].includes(status))
    .map(([status, name]) => ({
      name,
      total: open.filter((o) => o.status === status).length,
    }));
  const workload = data.members
    .map((m) => ({
      name: m.name,
      total: data.tasks.filter(
        (t) => t.members.includes(m.id) && t.status !== "DONE",
      ).length,
    }))
    .filter((m) => m.total > 0)
    .sort((a, b) => b.total - a.total);
  const notes = orders
    .flatMap((o) => o.notes.map((n) => ({ ...n, order: o })))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 5);
  return (
    <div className="dashboard">
      {role !== "MECHANIC" && (
        <FinancialOverview
          period={financialPeriod}
          setPeriod={setFinancialPeriod}
          role={role}
          onOpenCash={() => navigate("Caja")}
        />
      )}
      <div className="dashboard-intro">
        <p>
          {role === "MECHANIC"
            ? "Tus órdenes y tareas asignadas."
            : "Trabajo pendiente y actividad del taller."}
        </p>
        <Choice
          label="Período del resumen"
          value={days}
          onChange={setDays}
          options={[
            { id: "7", label: "Últimos 7 días" },
            { id: "30", label: "Últimos 30 días" },
            { id: "90", label: "Últimos 90 días" },
          ]}
        />
      </div>
      <div className="dashboard-metrics">
        <button onClick={() => navigate("Órdenes", "OPEN")}>
          <span>Órdenes abiertas</span>
          <strong>{open.length}</strong>
          <small>
            {received.length} ingresos en {days} días
          </small>
        </button>
        <button onClick={() => navigate("Órdenes", "READY")}>
          <span>Por entregar</span>
          <strong>{ready.length}</strong>
          <small>Coordinar retiro con el cliente</small>
        </button>
        <button onClick={() => navigate("Tareas", "BLOCKED")}>
          <span>Tareas bloqueadas</span>
          <strong>{blocked.length}</strong>
          <small>Revisar qué falta para continuar</small>
        </button>
        <button onClick={() => navigate("Órdenes", "CLOSED")}>
          <span>Órdenes cerradas</span>
          <strong>{closed.length}</strong>
          <small>En los últimos {days} días</small>
        </button>
      </div>
      <div className="dashboard-columns">
        <section className="dashboard-card">
          <h2>Órdenes abiertas por estado</h2>
          {open.length ? (
            <ChartContainer
              config={{ total: { label: "Órdenes", color: "var(--chart-1)" } }}
              className="h-72 w-full"
            >
              <BarChart
                accessibilityLayer
                data={chart}
                layout="vertical"
                margin={{ left: 5, right: 22 }}
              >
                <CartesianGrid horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={118}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  isAnimationActive={!reducedMotion}
                  dataKey="total"
                  fill="var(--color-total)"
                  radius={3}
                />
              </BarChart>
            </ChartContainer>
          ) : (
            <DataEmpty
              icon={EmptyInbox}
              title="Sin órdenes abiertas"
              description="Las órdenes activas aparecerán agrupadas por estado."
            />
          )}
          <ul className="sr-only">
            {chart.map((c) => (
              <li key={c.name}>
                {c.name}: {c.total}
              </li>
            ))}
          </ul>
        </section>
        <section className="dashboard-card">
          <h2>Avisos</h2>
          {!overdue.length && !ready.length && !blocked.length ? (
            <DataEmpty
              icon={EmptyBell}
              compact
              title="Sin avisos pendientes"
              description="Aquí aparecen las entregas por coordinar, los retrasos y las tareas bloqueadas."
            />
          ) : (
            <ul className="dashboard-alerts">
              {overdue.slice(0, 3).map((o) => (
                <li key={o.id}>
                  <Button variant="link" onClick={() => openOrder(o.id)}>
                    OT-{o.number} · Fecha prevista vencida
                  </Button>
                  <p>
                    {o.reference} · {dateLabel(o.dueAt)}
                  </p>
                </li>
              ))}
              {ready.slice(0, 3).map((o) => (
                <li key={o.id}>
                  <Button variant="link" onClick={() => openOrder(o.id)}>
                    OT-{o.number} · Lista para entregar
                  </Button>
                  <p>
                    {o.customer} · {o.reference}
                  </p>
                </li>
              ))}
              {!!blocked.length && (
                <li>
                  <Button
                    variant="link"
                    onClick={() => navigate("Tareas", "BLOCKED")}
                  >
                    Revisar {blocked.length} tareas bloqueadas
                  </Button>
                </li>
              )}
            </ul>
          )}
          {role !== "MECHANIC" &&
            data.balances.some(
              (b) => Number(b.quantity) - Number(b.reserved) <= 0,
            ) && (
              <Button variant="outline" onClick={() => navigate("Inventario")}>
                {
                  data.balances.filter(
                    (b) => Number(b.quantity) - Number(b.reserved) <= 0,
                  ).length
                }{" "}
                existencias sin disponibilidad
              </Button>
            )}
        </section>
        <section className="dashboard-card">
          <h2>
            {role === "MECHANIC"
              ? "Tus tareas pendientes"
              : "Tareas pendientes por responsable"}
          </h2>
          <p className="muted-copy">
            Una tarea compartida cuenta para cada responsable.
          </p>
          {workload.length ? (
            <ChartContainer
              config={{
                total: { label: "Tareas pendientes", color: "var(--chart-3)" },
              }}
              className="h-80 w-full"
            >
              <BarChart
                accessibilityLayer
                data={workload}
                layout="vertical"
                margin={{ right: 20 }}
              >
                <XAxis type="number" allowDecimals={false} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={130}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  isAnimationActive={!reducedMotion}
                  dataKey="total"
                  fill="var(--color-total)"
                  radius={3}
                />
              </BarChart>
            </ChartContainer>
          ) : (
            <DataEmpty
              icon={EmptyClipboardList}
              compact
              title="Sin tareas pendientes"
              description="Las tareas por completar aparecerán agrupadas por responsable."
            />
          )}
          <Button variant="link" onClick={() => navigate("Tareas")}>
            Ver tareas
          </Button>
        </section>
        <section className="dashboard-card">
          <h2>Últimas observaciones</h2>
          {notes.length ? (
            <ol className="dashboard-notes">
              {notes.map((n) => (
                <li key={n.id}>
                  <Button variant="link" onClick={() => openOrder(n.order.id)}>
                    OT-{n.order.number} · {n.order.reference}
                  </Button>
                  <p>{n.body}</p>
                  <small>
                    {n.author} · {n.date}
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <DataEmpty
              icon={EmptyMessageSquare}
              compact
              title="Sin observaciones"
              description="Las notas de las órdenes aparecerán aquí, de la más reciente a la más antigua."
            />
          )}
        </section>
      </div>
    </div>
  );
}
