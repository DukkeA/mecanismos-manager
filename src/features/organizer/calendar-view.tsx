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
import { shiftDay, weekDates, calendarDayLabel } from "./calendar-dates";
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
    [anchor, setAnchor] = useState(today),
    [view, setView] = useState("month");
  const month = anchor.slice(0, 7),
    week = weekDates(anchor);
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
        sortTime: e.startsAt!,
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
        sortTime: o.dueAt!,
        type: "Orden",
        done: false,
        run: () => openOrder(o.id),
      })),
  ].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      new Date(a.sortTime).getTime() - new Date(b.sortTime).getTime(),
  );
  const forDay = (date: string) =>
    events.filter((e) => e.date <= date && e.endDate >= date);
  function move(delta: number) {
    setAnchor(
      view === "week"
        ? shiftDay(anchor, delta * 7)
        : new Date(Date.UTC(year, number - 1 + delta, 1))
            .toISOString()
            .slice(0, 10),
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label={view === "week" ? "Semana anterior" : "Mes anterior"}
            onClick={() => move(-1)}
          >
            <ChevronLeft />
          </Button>
          <h2 className="calendar-period min-w-0 text-center font-semibold">
            {view === "week"
              ? `${calendarDayLabel(week[0])} – ${calendarDayLabel(week[6])}, ${week[6].slice(0, 4)}`
              : start.toLocaleDateString("es-CO", {
                  timeZone: "UTC",
                  month: "long",
                  year: "numeric",
                })}
          </h2>
          <Button
            variant="outline"
            size="icon"
            aria-label={view === "week" ? "Semana siguiente" : "Mes siguiente"}
            onClick={() => move(1)}
          >
            <ChevronRight />
          </Button>
          <Button variant="outline" onClick={() => setAnchor(today)}>
            Hoy
          </Button>
        </div>
        <Tabs value={view} onValueChange={setView}>
          <TabsList aria-label="Vista del calendario">
            <TabsTrigger value="month">Mes</TabsTrigger>
            <TabsTrigger value="week">Semana</TabsTrigger>
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {view === "month" || view === "week" ? (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <div
            className={cn(
              "grid",
              view === "week"
                ? "grid-cols-1 md:min-w-[840px] md:grid-cols-7"
                : "min-w-[840px] grid-cols-7",
            )}
          >
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
                className={cn(
                  "border-b bg-muted/50 p-3 text-center text-xs font-medium text-muted-foreground",
                  view === "week" && "hidden md:block",
                )}
              >
                {day}
              </div>
            ))}
            {(view === "week" ? week : days).map((date) => (
              <div
                key={date}
                className={cn(
                  "flex min-h-36 flex-col gap-1 border-b border-r p-2",
                  view === "week" && "md:min-h-96",
                  view === "month" && !date.startsWith(month) && "bg-muted/30",
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
                {view === "week" && (
                  <span className="mb-2 text-center text-xs text-muted-foreground">
                    {new Date(`${date}T12:00:00Z`).toLocaleDateString("es-CO", {
                      timeZone: "UTC",
                      weekday: "long",
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                )}
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
                    <span
                      className={
                        view === "week" ? "flex flex-col gap-1" : "line-clamp-2"
                      }
                    >
                      {view === "week" && (
                        <span className="text-xs text-muted-foreground">
                          {e.type} · {e.time}
                          {e.date !== e.endDate
                            ? ` · ${calendarDayLabel(e.date)}–${calendarDayLabel(e.endDate)}`
                            : ""}
                        </span>
                      )}
                      {view === "week" ? e.title : `${e.time} · ${e.title}`}
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
