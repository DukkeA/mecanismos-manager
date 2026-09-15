"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataEmpty } from "@/components/data-empty";
import { bogotaDate, type OrganizerItem } from "@/domain/organizer";
import type { OrderView } from "@/domain/workshop-view";
import { todayInBogota } from "@/features/cash/summary";
import { cn } from "@/lib/utils";
export function CalendarView({
  entries,
  orders,
  edit,
  openOrder,
  create,
}: {
  entries: OrganizerItem[];
  orders: OrderView[];
  edit: (e: OrganizerItem) => void;
  openOrder: (id: string) => void;
  create: (date: string) => void;
}) {
  const today = todayInBogota(),
    [month, setMonth] = useState(today.slice(0, 7)),
    [view, setView] = useState("month");
  const [year, number] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, number - 1, 1));
  const startDay = (start.getUTCDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) =>
    new Date(Date.UTC(year, number - 1, 1 - startDay + i))
      .toISOString()
      .slice(0, 10),
  );
  const events = [
    ...entries
      .filter((e) => e.startsAt && e.calendar)
      .map((e) => ({
        id: e.id,
        title: e.title,
        date: bogotaDate(e.startsAt!),
        endDate: e.endsAt ? bogotaDate(e.endsAt) : bogotaDate(e.startsAt!),
        time: new Date(e.startsAt!).toLocaleTimeString("es-CO", {
          timeZone: "America/Bogota",
          hour: "2-digit",
          minute: "2-digit",
        }),
        type: e.kind === "TODO" ? "Pendiente" : "Evento",
        done: e.completed,
        run: () => edit(e),
      })),
    ...orders
      .filter((o) => o.dueAt && !["CANCELLED", "CLOSED"].includes(o.status))
      .map((o) => ({
        id: o.id,
        title: `OT-${o.number} · ${o.title}`,
        date: bogotaDate(o.dueAt!),
        endDate: bogotaDate(o.dueAt!),
        time: "Entrega",
        type: "Orden",
        done: false,
        run: () => openOrder(o.id),
      })),
  ].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
  );
  const forDay = (date: string) =>
    events.filter((e) => e.date <= date && e.endDate >= date);
  function move(delta: number) {
    setMonth(
      new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7),
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Mes anterior"
            onClick={() => move(-1)}
          >
            <ChevronLeft />
          </Button>
          <h2 className="min-w-44 text-center font-semibold capitalize">
            {start.toLocaleDateString("es-CO", {
              timeZone: "UTC",
              month: "long",
              year: "numeric",
            })}
          </h2>
          <Button
            variant="outline"
            size="icon"
            aria-label="Mes siguiente"
            onClick={() => move(1)}
          >
            <ChevronRight />
          </Button>
          <Button variant="outline" onClick={() => setMonth(today.slice(0, 7))}>
            Hoy
          </Button>
        </div>
        <Tabs value={view} onValueChange={setView}>
          <TabsList aria-label="Vista del calendario">
            <TabsTrigger value="month">Mes</TabsTrigger>
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {view === "month" ? (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <div className="grid min-w-[840px] grid-cols-7">
            {[
              "Lunes",
              "Martes",
              "Miércoles",
              "Jueves",
              "Viernes",
              "Sábado",
              "Domingo",
            ].map((day) => (
              <div
                key={day}
                className="border-b bg-muted/50 p-3 text-center text-xs font-medium text-muted-foreground"
              >
                {day}
              </div>
            ))}
            {days.map((date) => (
              <div
                key={date}
                className={cn(
                  "flex min-h-36 flex-col gap-1 border-b border-r p-2",
                  !date.startsWith(month) && "bg-muted/30",
                )}
              >
                <Button
                  variant={date === today ? "default" : "ghost"}
                  size="icon"
                  className="self-end"
                  aria-label={`Crear evento el ${date}`}
                  onClick={() => create(date)}
                >
                  {Number(date.slice(-2))}
                </Button>
                {forDay(date).map((e) => (
                  <Button
                    key={e.id}
                    variant="secondary"
                    className={cn(
                      "h-auto min-h-9 w-full justify-start whitespace-normal text-left",
                      e.done && "line-through opacity-60",
                    )}
                    onClick={e.run}
                  >
                    <span className="line-clamp-2">
                      {e.time} · {e.title}
                    </span>
                  </Button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          {events.filter(
            (e) => e.date <= `${month}-31` && e.endDate >= `${month}-01`,
          ).length ? (
            events
              .filter(
                (e) => e.date <= `${month}-31` && e.endDate >= `${month}-01`,
              )
              .map((e) => (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center gap-3 border-b p-4 last:border-0"
                >
                  <span className="text-sm text-muted-foreground">
                    {e.date} · {e.time}
                  </span>
                  <Badge variant="secondary">{e.type}</Badge>
                  <Button variant="link" onClick={e.run}>
                    {e.title}
                  </Button>
                  {e.done && <Badge variant="outline">Completado</Badge>}
                </div>
              ))
          ) : (
            <DataEmpty
              icon={CalendarDays}
              title="Sin eventos este mes"
              description="Añade un evento o lleva un pendiente al calendario."
            />
          )}
        </div>
      )}
    </div>
  );
}
