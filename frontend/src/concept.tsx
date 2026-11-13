// Isolated local visual study. No connection to production.
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./concept.css";
import "./concept-rhythm.css";
import { RhythmBackdrop } from "./concept-rhythm";
if (!import.meta.env.DEV) throw new Error("Local concept only");
const activity = {
  id: "concept",
  date: "2026-11-12",
  type: "Running",
  durationSeconds: 2484,
  notes: "Una salida tranquila. Mantener el ritmo, disfrutar el recorrido.",
  mood: 4,
  energy: 4,
  rpe: 5,
  subjectiveNotes: "Buenas sensaciones de principio a fin.",
  running: {
    activityId: "concept",
    distanceKm: 6.32,
    totalDurationSeconds: 2484,
    averagePaceSecondsPerKm: 393,
    averageHeartRate: 145,
    laps: [1, 2, 3, 4, 5, 6].map((n) => ({
      lapNumber: n,
      distanceKm: 1,
      durationSeconds: 390 + n,
      averagePaceSecondsPerKm: 390 + n,
    })),
  },
  exercises: [],
  rawPayload: { source: "Ejemplo visual local" },
  rawPayloadJson: '{"source":"Ejemplo visual local"}',
};
window.fetch = async (input, options) => {
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    location.origin,
  );
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/"))
    throw new Error("Concepto sin solicitudes externas");
  if (options?.method && options.method !== "GET")
    return Response.json(
      { title: "Escrituras desactivadas en el concepto" },
      { status: 403 },
    );
  const data =
    url.pathname === "/api/auth/session"
      ? { authenticated: true, csrfToken: "local" }
      : url.pathname === "/api/database-info"
        ? {
            database: "Concepto local",
            isDemo: true,
            hasLegacySeedHistory: false,
          }
        : url.pathname === "/api/activities/concept"
          ? activity
          : null;
  return Response.json(data ?? { title: "Página fuera del concepto" }, {
    status: data ? 200 : 404,
  });
};
const rhythm = location.pathname === "/concept-rhythm.html";
history.replaceState(null, "", "/activities/concept");
document.documentElement.classList.add("ink-concept");
if (rhythm) document.documentElement.classList.add("rhythm-concept");
createRoot(document.getElementById("root")!).render(
  <>
    {rhythm ? (
      <RhythmBackdrop />
    ) : (
      <div className="ink-backdrop" aria-hidden="true">
        <svg viewBox="0 0 1600 1100" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="ink" x1="0" y1="1" x2="1" y2="0">
              <stop stopColor="#244b48" stopOpacity="0" />
              <stop offset=".5" stopColor="#689a83" stopOpacity=".6" />
              <stop offset="1" stopColor="#a6b59a" stopOpacity=".15" />
            </linearGradient>
            <filter id="soft">
              <feGaussianBlur stdDeviation="14" />
            </filter>
          </defs>
          <g className="ink-flow" fill="none" stroke="url(#ink)">
            {Array.from({ length: 20 }, (_, i) => (
              <path
                key={i}
                strokeWidth={i % 4 === 0 ? 28 : 1.2}
                opacity={i % 4 === 0 ? 0.35 : 0.6}
                filter={i % 4 === 0 ? "url(#soft)" : undefined}
                d={`M ${-300 + i * 8} ${900 + i * 18} C ${160 + i * 14} ${380 + i * 12}, ${660 + i * 8} ${1250 - i * 24}, ${900 + i * 14} ${520 - i * 8} S ${1280 + i * 12} ${50 + i * 8}, 1900 ${160 + i * 22}`}
              />
            ))}
          </g>
        </svg>
      </div>
    )}
    <App />
    <nav
      className="concept-label concept-switch"
      aria-label="Comparar propuestas"
    >
      <span>{rhythm ? "02 / RITMO" : "01 / TINTA"}</span>
      <a href="/concept.html" aria-current={!rhythm ? "page" : undefined}>
        Tinta
      </a>
      <a href="/concept-rhythm.html" aria-current={rhythm ? "page" : undefined}>
        Ritmo
      </a>
      <small>Datos de ejemplo</small>
    </nav>
  </>,
);
