import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Footprints,
  Dumbbell,
  Bike,
  Mountain,
  MoveUpRight,
  Activity as ActivityIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { Activity, ActivityType } from "./types";
import { dateLabel, decimal, duration, activityLabel } from "./format";

export function SportIcon({ type }: { type: ActivityType }) {
  const Icon =
    type === "Strength"
      ? Dumbbell
      : type === "Cycling"
        ? Bike
        : type === "Hiking"
          ? Mountain
          : type === "Other"
            ? ActivityIcon
            : Footprints;
  return (
    <span className={`sport-icon ${type.toLowerCase()}`}>
      <Icon size={20} />
    </span>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}
export function LoadState({
  error,
  retry,
}: {
  error?: string;
  retry: () => void;
}) {
  return (
    <div className="panel state" role={error ? "alert" : "status"}>
      {error ? (
        <>
          <h2>No pudimos cargar tus datos</h2>
          <p>{error}</p>
          <button onClick={retry}>Reintentar</button>
        </>
      ) : (
        <>
          <span className="loader" />
          <p>Cargando tu progreso…</p>
        </>
      )}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Stat({
  label,
  value,
  unit,
  note,
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  note: string;
  icon: ReactNode;
}) {
  return (
    <article className="panel stat">
      <div className="stat-label">
        {label}
        {icon}
      </div>
      <div className="stat-value">
        {value}
        <small>{unit}</small>
      </div>
      <p>{note}</p>
    </article>
  );
}
export function ActivityTable({ activities }: { activities: Activity[] }) {
  if (!activities.length)
    return (
      <Empty>
        Aún no hay actividades. Registra tu primer entrenamiento para comenzar.
      </Empty>
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Actividad</th>
            <th>Fecha</th>
            <th>Distancia</th>
            <th>Duración</th>
            <th>Ritmo /km</th>
            <th>FC media</th>
            <th>
              <span className="sr-only">Detalle</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {activities.map((a) => (
            <tr key={a.id}>
              <td>
                <Link className="activity-name" to={`/activities/${a.id}`}>
                  <SportIcon type={a.type} />
                  <span>
                    {activityLabel(a)}
                    <small>
                      {a.type === "Strength"
                        ? "Entrenamiento de fuerza"
                        : "Sesión de entrenamiento"}
                    </small>
                  </span>
                </Link>
              </td>
              <td>{dateLabel(a.date)}</td>
              <td>
                {decimal(a.distanceKm, 2)}{" "}
                {a.distanceKm != null && <small>km</small>}
              </td>
              <td>{duration(a.durationSeconds)}</td>
              <td>{duration(a.averagePaceSecondsPerKm)}</td>
              <td>
                {decimal(a.averageHeartRate, 0)}{" "}
                {a.averageHeartRate != null && <small>bpm</small>}
              </td>
              <td>
                <Link
                  className="icon-link"
                  to={`/activities/${a.id}`}
                  aria-label={`Ver ${activityLabel(a)} del ${dateLabel(a.date)}`}
                >
                  <ArrowUpRight size={18} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function TrendChart({
  data,
  x,
  y,
  kind = "line",
  pace = false,
  color = "var(--accent)",
  unit = "",
}: {
  data: object[];
  x: string;
  y: string;
  kind?: "line" | "bar";
  pace?: boolean;
  color?: string;
  unit?: string;
}) {
  if (!data.length) return <Empty>Tus registros aparecerán aquí.</Empty>;
  const axis = {
    stroke: "var(--text-muted)",
    fontSize: 11,
    tickLine: false,
    axisLine: false,
  };
  const grid = (
    <CartesianGrid
      stroke="var(--chart-grid)"
      vertical={false}
      strokeDasharray="3 5"
    />
  );
  const xAxis = (
    <XAxis
      dataKey={x}
      {...axis}
      tickFormatter={(value) => dateLabel(String(value))}
      minTickGap={30}
      dy={10}
    />
  );
  const yAxis = (
    <YAxis
      {...axis}
      width={42}
      reversed={pace}
      allowDecimals={unit !== "sesiones"}
      domain={
        pace
          ? ["dataMin - 20", "dataMax + 20"]
          : kind === "bar"
            ? [0, "auto"]
            : ["auto", "auto"]
      }
      tickFormatter={(v) => (pace ? duration(Number(v)) : decimal(Number(v)))}
    />
  );
  const tooltip = (
    <Tooltip
      contentStyle={{
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        color: "var(--text)",
      }}
      labelFormatter={(v, payload) => {
        const end = payload?.[0]?.payload?.endDate;
        return end && end !== v
          ? `${dateLabel(String(v), true)} – ${dateLabel(String(end), true)}`
          : dateLabel(String(v), true);
      }}
      formatter={(v) => [
        pace
          ? `${duration(Number(v))} /km`
          : `${decimal(Number(v), 2)} ${unit}`,
        pace ? "Ritmo" : "Registro",
      ]}
    />
  );
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        {kind === "bar" ? (
          <BarChart
            data={data}
            margin={{ top: 15, right: 8, bottom: 10, left: 0 }}
          >
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            <Bar
              dataKey={y}
              fill={color}
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
          </BarChart>
        ) : (
          <LineChart
            data={data}
            margin={{ top: 15, right: 15, bottom: 10, left: 0 }}
          >
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            <Line
              type="linear"
              dataKey={y}
              stroke={color}
              strokeWidth={2.5}
              dot={{ r: 3, fill: "var(--surface)", strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              connectNulls={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
export function SectionHeading({
  title,
  subtitle,
  link,
}: {
  title: string;
  subtitle?: string;
  link?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {link && (
        <Link className="text-link" to={link}>
          Ver todas <MoveUpRight size={15} />
        </Link>
      )}
    </div>
  );
}
