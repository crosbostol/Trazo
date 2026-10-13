import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  Heart,
  Timer,
  Route,
  Plus,
} from "lucide-react";
import { useApi } from "../useApi";
import type { RangeDashboard } from "../types";
import {
  periodLabels,
  presetRange,
  rangeError,
  santiagoToday,
} from "../dashboardPeriod";
import type { Period } from "../dashboardPeriod";
import {
  ActivityTable,
  Empty,
  LoadState,
  PageTitle,
  SectionHeading,
  SportIcon,
  Stat,
  TrendChart,
} from "../components";
import { dateLabel, decimal, duration, activityLabel } from "../format";

export default function DashboardPage() {
  const today = santiagoToday();
  const [period, setPeriod] = useState<Period>("week");
  const [custom, setCustom] = useState(() => presetRange("week", today));
  const [draft, setDraft] = useState(custom);
  const [showCustom, setShowCustom] = useState(false);
  const [error, setError] = useState("");
  const [chartMetric, setChartMetric] = useState<"distanceKm" | "sessions">(
    "distanceKm",
  );
  const range = period === "custom" ? custom : presetRange(period, today);
  const dashboard = useApi<RangeDashboard>(
    `/dashboard?from=${range.from}&to=${range.to}`,
  );
  const d = dashboard.data;
  const latestMetrics =
    d?.latestActivity?.type === "Walking"
      ? d.latestActivity.walking
      : d?.latestActivity?.running;
  const periodText =
    period === "week"
      ? "Esta semana"
      : period === "month"
        ? "Este mes"
        : "Período personalizado";
  return (
    <>
      <PageTitle
        eyebrow="TU PROGRESO, A TU RITMO"
        title="Cada sesión cuenta."
        description="Una mirada a tu constancia y a todo lo que estás construyendo."
      >
        <Link className="button primary" to="/activities/new">
          <Plus size={17} /> Registrar actividad
        </Link>
      </PageTitle>
      <div className="period-controls">
        <div className="filters" role="group" aria-label="Período del resumen">
          {(Object.keys(periodLabels) as Period[]).map((key) => (
            <button
              key={key}
              className={
                (showCustom ? key === "custom" : period === key)
                  ? "selected"
                  : ""
              }
              aria-pressed={showCustom ? key === "custom" : period === key}
              onClick={() => {
                setError("");
                setShowCustom(key === "custom");
                if (key !== "custom") setPeriod(key);
              }}
            >
              {periodLabels[key]}
            </button>
          ))}
        </div>
        {showCustom && (
          <form
            className="range-form"
            onSubmit={(event) => {
              event.preventDefault();
              const message = rangeError(
                draft.from,
                draft.to,
                d?.asOf ?? today,
              );
              setError(message);
              if (!message) {
                setCustom(draft);
                setPeriod("custom");
              }
            }}
          >
            <label>
              Desde
              <input
                type="date"
                required
                max={d?.asOf ?? today}
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                required
                max={d?.asOf ?? today}
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              />
            </label>
            <button type="submit">Aplicar período</button>
          </form>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
      {!d ? (
        <LoadState error={dashboard.error} retry={dashboard.reload} />
      ) : (
        <>
          <div className="period-label">
            <span className="live-dot" /> {periodText}{" "}
            <span>
              {dateLabel(d.from, true)} – {dateLabel(d.to, true)} · Santiago
            </span>
          </div>
          <div className="stats-grid">
            <Stat
              label="Entrenamientos"
              value={String(d.sessions)}
              unit="sesiones"
              note="Completados en el período"
              icon={<CalendarDays size={18} />}
            />
            <Stat
              label="Distancia del período"
              value={decimal(d.distanceKm, 2)}
              unit="km"
              note="Kilómetros de running"
              icon={<Route size={18} />}
            />
            <Stat
              label="Ritmo del período"
              value={duration(d.paceSecondsPerKm)}
              unit="/km"
              note="Running · ponderado por distancia"
              icon={<Timer size={18} />}
            />
            <Stat
              label="FC del período"
              value={decimal(d.averageHeartRate, 0)}
              unit="bpm"
              note="Running · promedio por sesión"
              icon={<Heart size={18} />}
            />
          </div>
          <div className="dashboard-middle">
            <section className="panel distance-panel">
              <SectionHeading
                title="La constancia se construye"
                subtitle={`${d.granularity === "day" ? "Por día" : "Por semana · lunes a domingo"} · ${periodText.toLowerCase()}`}
              />
              <div
                className="filters chart-options"
                role="group"
                aria-label="Métrica del gráfico"
              >
                <button
                  className={chartMetric === "distanceKm" ? "selected" : ""}
                  aria-pressed={chartMetric === "distanceKm"}
                  onClick={() => setChartMetric("distanceKm")}
                >
                  Distancia running
                </button>
                <button
                  className={chartMetric === "sessions" ? "selected" : ""}
                  aria-pressed={chartMetric === "sessions"}
                  onClick={() => setChartMetric("sessions")}
                >
                  Sesiones
                </button>
              </div>
              <div className="chart-summary">
                {chartMetric === "distanceKm"
                  ? decimal(d.distanceKm, 2)
                  : d.sessions}
                <span>
                  {chartMetric === "distanceKm" ? "km" : "sesiones"} en el
                  período
                </span>
                <span className="legend">
                  <i />{" "}
                  {chartMetric === "distanceKm" ? "Distancia" : "Sesiones"}
                </span>
              </div>
              <TrendChart
                data={d.series}
                x="date"
                y={chartMetric}
                kind="bar"
                unit={chartMetric === "distanceKm" ? "km" : "sesiones"}
              />
              {d.sessions === 0 && (
                <p className="chart-footnote">
                  Sin actividades en este período.
                </p>
              )}
            </section>
            <section className="panel latest-panel">
              <span className="eyebrow">ÚLTIMA ACTIVIDAD · GLOBAL</span>
              {d.latestActivity ? (
                <>
                  <div className="latest-title">
                    <SportIcon type={d.latestActivity.type} />
                    <span>
                      {activityLabel(d.latestActivity)}
                      <small>{dateLabel(d.latestActivity.date, true)}</small>
                    </span>
                  </div>
                  <div className="latest-distance">
                    {latestMetrics?.distanceKm != null
                      ? decimal(latestMetrics.distanceKm, 2)
                      : duration(d.latestActivity.durationSeconds)}
                    <span>
                      {latestMetrics?.distanceKm != null ? "km" : "min"}
                    </span>
                  </div>
                  <div className="latest-metrics">
                    <div>
                      <span>Duración</span>
                      <strong>
                        {duration(d.latestActivity.durationSeconds)}
                      </strong>
                    </div>
                    <div>
                      <span>Ritmo medio</span>
                      <strong>
                        {duration(latestMetrics?.averagePaceSecondsPerKm)}
                        <small> /km</small>
                      </strong>
                    </div>
                  </div>
                  <p className="latest-note">
                    {d.latestActivity.notes ||
                      "Un entrenamiento más en tu camino."}
                  </p>
                  <Link
                    className="button full"
                    to={`/activities/${d.latestActivity.id}`}
                  >
                    Explorar actividad <ArrowUpRight size={17} />
                  </Link>
                </>
              ) : (
                <Empty>Tu próxima sesión será el comienzo.</Empty>
              )}
            </section>
          </div>
          <section className="panel pace-panel">
            <SectionHeading
              title="Tu ritmo, en perspectiva"
              subtitle={`Running · ritmo ponderado por distancia · ${d.granularity === "day" ? "diario" : "semanal"} · min/km`}
            />
            <TrendChart
              data={
                d.series.some((point) => point.paceSecondsPerKm != null)
                  ? d.series
                  : []
              }
              x="date"
              y="paceSecondsPerKm"
              pace
              color="var(--chart-secondary)"
            />
            <p className="chart-footnote">
              Cada recorrido tiene su contexto. Observa la evolución a lo largo
              del tiempo.
            </p>
          </section>
          <section className="panel">
            <SectionHeading
              title="En movimiento"
              subtitle="Tus últimas 5 actividades del período"
              link="/activities"
            />
            {d.activities.length ? (
              <ActivityTable activities={d.activities} />
            ) : (
              <Empty>Sin actividades en este período.</Empty>
            )}
          </section>
        </>
      )}
    </>
  );
}
