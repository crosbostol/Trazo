export type Period = "week" | "month" | "custom";
export const periodLabels: Record<Period, string> = {
  week: "Semana",
  month: "Mes",
  custom: "Personalizado",
};
export function santiagoToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function presetRange(period: "week" | "month", today: string) {
  const date = new Date(`${today}T12:00:00Z`);
  if (period === "month") date.setUTCDate(1);
  else date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return { from: date.toISOString().slice(0, 10), to: today };
}
export function rangeError(from: string, to: string, today: string): string {
  const valid = (date: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !date.startsWith("0000") &&
    Number.isFinite(Date.parse(`${date}T12:00:00Z`)) &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
  if (!valid(from) || !valid(to))
    return "Completa ambas fechas con valores válidos.";
  if (from > to) return "Desde no puede ser posterior a Hasta.";
  if (to > today)
    return "El período no puede incluir fechas futuras en America/Santiago.";
  return "";
}
