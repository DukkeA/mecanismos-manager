"use client";
import { useFormSheet } from "./form-sheet";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { format, isValid, parseISO, startOfMonth, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

const parse = (value: string) => {
  const date = parseISO(value);
  return isValid(date) && format(date, "yyyy-MM-dd") === value
    ? date
    : undefined;
};
const iso = (date?: Date) => (date ? format(date, "yyyy-MM-dd") : "");
const display = (date?: Date) =>
  date ? format(date, "d MMM yyyy", { locale: es }) : "";
const labels = {
  labelNext: () => "Mes siguiente",
  labelPrevious: () => "Mes anterior",
  labelDayButton: (
    date: Date,
    modifiers: { today?: boolean; selected?: boolean },
  ) =>
    `${modifiers.today ? "Hoy, " : ""}${format(date, "EEEE d 'de' MMMM 'de' yyyy", { locale: es })}${modifiers.selected ? ", seleccionado" : ""}`,
};

export function MonthField({
  id,
  value,
  onChange,
  label = "Mes",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const draft = useFormSheet(),
    [open, setOpen] = useState(false);
  const current = parse(`${value}-01`),
    [year, setYear] = useState(
      current?.getFullYear() ?? new Date().getFullYear(),
    );
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setYear(current?.getFullYear() ?? new Date().getFullYear());
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="input"
          className="w-full min-w-0 justify-start"
          aria-label={`${label}: ${current ? format(current, "MMMM yyyy", { locale: es }) : "Seleccionar mes"}`}
        >
          <CalendarDays className="shrink-0" />
          <span className="truncate">
            {current
              ? format(current, "MMM yyyy", { locale: es })
              : "Elegir mes"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="w-72 space-y-3 p-3"
      >
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Año anterior"
            disabled={year <= 1900}
            onClick={() => setYear((v) => v - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="font-semibold tabular-nums" aria-live="polite">
            {year}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Año siguiente"
            disabled={year >= 2200}
            onClick={() => setYear((v) => v + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 12 }, (_, month) => {
            const date = new Date(year, month, 1),
              next = `${year}-${String(month + 1).padStart(2, "0")}`;
            return (
              <Button
                key={month}
                type="button"
                variant={next === value ? "default" : "ghost"}
                aria-pressed={next === value}
                aria-label={format(date, "MMMM yyyy", { locale: es })}
                onClick={() => {
                  draft.change();
                  onChange(next);
                  setOpen(false);
                }}
              >
                {format(date, "MMM", { locale: es })}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function DateRangePicker({
  from,
  to,
  onChange,
  label = "Rango de fechas",
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>();
  const mobile = useIsMobile();
  const rangeText =
    from && to
      ? `${display(parse(from))} – ${display(parse(to))}`
      : from
        ? `Desde ${display(parse(from))}`
        : to
          ? `Hasta ${display(parse(to))}`
          : "Todas las fechas";
  const preset = (start: Date, end: Date) => setDraft({ from: start, to: end });
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        if (value) setDraft({ from: parse(from), to: parse(to) });
        setOpen(value);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="input"
          className="date-range-trigger"
          aria-label={`${label}: ${rangeText}`}
        >
          <CalendarDays data-icon="inline-start" />
          {rangeText}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        sticky="always"
        className="date-picker-popover w-auto p-0"
      >
        <div className="range-presets">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => preset(new Date(), new Date())}
          >
            Hoy
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => preset(subDays(new Date(), 6), new Date())}
          >
            Últimos 7 días
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => preset(startOfMonth(new Date()), new Date())}
          >
            Este mes
          </Button>
        </div>
        <Calendar
          mode="range"
          locale={es}
          labels={labels}
          selected={draft}
          onSelect={setDraft}
          defaultMonth={draft?.from ?? draft?.to}
          numberOfMonths={mobile ? 1 : 2}
          fixedWeeks
          className="workshop-calendar"
        />
        <div className="range-actions">
          <Button
            variant="ghost"
            onClick={() => {
              onChange("", "");
              setOpen(false);
            }}
          >
            Limpiar
          </Button>
          <Button
            disabled={!draft?.from || !draft?.to}
            onClick={() => {
              onChange(iso(draft?.from), iso(draft?.to));
              setOpen(false);
            }}
          >
            Aplicar rango
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
export function DateField({
  id,
  name,
  label = "Fecha",
  value,
  defaultValue = "",
  onChange,
  required = false,
  ...aria
}: {
  id?: string;
  name?: string;
  label?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const draft = useFormSheet();
  const [local, setLocal] = useState(defaultValue),
    [open, setOpen] = useState(false);
  const current = value ?? local;
  const change = (next: string) => {
    draft.change();
    setLocal(next);
    onChange?.(next);
    setOpen(false);
  };
  return (
    <>
      <input type="hidden" name={name} value={current} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            {...aria}
            id={id}
            type="button"
            variant="input"
            aria-label={`${label}: ${display(parse(current)) || "Seleccionar fecha"}`}
            aria-required={required}
            className="date-trigger"
          >
            <CalendarDays data-icon="inline-start" />
            {display(parse(current)) || "Seleccionar fecha"}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          collisionPadding={12}
          className="date-picker-popover w-auto p-0"
        >
          <Calendar
            mode="single"
            locale={es}
            labels={labels}
            selected={parse(current)}
            defaultMonth={parse(current)}
            onSelect={(date) => change(iso(date))}
            fixedWeeks
            className="workshop-calendar"
          />
          {!required && (
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => change("")}
            >
              Quitar fecha
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}
