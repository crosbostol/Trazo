export const decimal = (value: number | null | undefined, digits = 1) =>
  value == null
    ? "—"
    : value.toLocaleString("es-CL", { maximumFractionDigits: digits });
export const duration = (seconds: number | null | undefined) => {
  if (seconds == null) return "—";
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
};
export const dateLabel = (date: string, long = false) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("es-CL", {
    day: "numeric",
    month: long ? "long" : "short",
    ...(long ? { year: "numeric" as const } : {}),
  });
export const typeLabel = {
  Running: "Running",
  Strength: "Fuerza",
  Walking: "Caminata",
  Cycling: "Ciclismo",
  Hiking: "Hiking",
  Other: "Otra actividad",
};
export const activityLabel = (activity: {
  type: keyof typeof typeLabel;
  activitySubtype?: string | null;
}) =>
  activity.type === "Other" && activity.activitySubtype
    ? activity.activitySubtype
    : typeLabel[activity.type];
