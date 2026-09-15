export function shiftDay(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
export function weekDates(anchor: string) {
  const weekday = new Date(`${anchor}T12:00:00Z`).getUTCDay();
  const monday = shiftDay(anchor, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
}
export function calendarDayLabel(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("es-CO", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
}
