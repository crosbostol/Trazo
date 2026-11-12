import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Copy, Trash2 } from "lucide-react";
import { exportActivityJson } from "../exportActivity";
import { copyText } from "../clipboard";
import { api } from "../api";
import { useApi } from "../useApi";
import type { Activity } from "../types";
import {
  LoadState,
  PageTitle,
  SectionHeading,
  SportIcon,
  Empty,
} from "../components";
import { dateLabel, decimal, duration, activityLabel } from "../format";
import { runningMetrics, walkingMetrics } from "../metrics";
export default function ActivityDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: a, error, reload } = useApi<Activity>(`/activities/${id}`);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [copying, setCopying] = useState(false);
  async function copyActivity() {
    if (!a) return;
    setCopying(true);
    setCopyStatus("");
    try {
      await copyText(exportActivityJson(a));
      setCopyStatus("JSON copiado al portapapeles.");
    } catch {
      setCopyStatus(
        "No se pudo copiar. Revisa el permiso del portapapeles y vuelve a intentarlo.",
      );
    } finally {
      setCopying(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api(`/activities/${id}`, { method: "DELETE" });
      navigate("/activities");
    } catch (e) {
      setDeleteError((e as Error).message);
      setBusy(false);
    }
  }
  if (!a) return <LoadState error={error} retry={reload} />;
  return (
    <>
      <Link className="back-link" to="/activities">
        <ArrowLeft size={16} /> Todas las actividades
      </Link>
      <PageTitle
        eyebrow={dateLabel(a.date, true)}
        title={activityLabel(a)}
        description={`${duration(a.durationSeconds)} min · Un registro de tu recorrido.`}
      >
        <SportIcon type={a.type} />
      </PageTitle>
      <section className="panel">
        <SectionHeading title="Cómo te sentiste" />
        <div className="subjective">
          <div>
            Ánimo
            <strong>
              {a.mood ?? "—"} <small>/ 5</small>
            </strong>
          </div>
          <div>
            Energía
            <strong>
              {a.energy ?? "—"} <small>/ 5</small>
            </strong>
          </div>
          <div>
            Esfuerzo percibido
            <strong>
              {a.rpe ?? "—"} <small>/ 10</small>
            </strong>
          </div>
        </div>
        {a.subjectiveNotes && <p className="notes">{a.subjectiveNotes}</p>}
        {a.notes && <p className="notes">{a.notes}</p>}
      </section>
      {a.running && (
        <>
          <section className="panel">
            <SectionHeading
              title="Tu carrera en detalle"
              subtitle="Solo se muestran las métricas registradas"
            />
            <div className="metric-grid">
              {runningMetrics
                .filter(([key]) => a.running![key] != null)
                .map(([key, label, unit]) => (
                  <div key={key}>
                    <span>{label}</span>
                    <strong>
                      {unit === "/km" || unit === "s"
                        ? duration(Number(a.running![key]))
                        : decimal(Number(a.running![key]), 2)}{" "}
                      <small>{unit === "s" ? "min" : unit}</small>
                    </strong>
                  </div>
                ))}
            </div>
          </section>
          <section className="panel">
            <SectionHeading title="Vueltas y splits" />
            {a.running.laps.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Vuelta</th>
                      <th>Distancia</th>
                      <th>Duración</th>
                      <th>Ritmo /km</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.running.laps.map((l) => (
                      <tr key={l.lapNumber}>
                        <td>{l.lapNumber}</td>
                        <td>{decimal(l.distanceKm, 2)} km</td>
                        <td>{duration(l.durationSeconds)}</td>
                        <td>{duration(l.averagePaceSecondsPerKm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>No hay vueltas registradas.</Empty>
            )}
          </section>
        </>
      )}
      {a.type === "Walking" && (
        <section className="panel">
          <SectionHeading
            title="Tu caminata en detalle"
            subtitle="Métricas disponibles · los registros antiguos pueden no tener detalles normalizados"
          />
          {a.walking ? (
            <div className="metric-grid">
              {walkingMetrics
                .filter(
                  ([key]) =>
                    a.walking![key] != null ||
                    [
                      "distanceKm",
                      "totalDurationSeconds",
                      "averagePaceSecondsPerKm",
                      "averageHeartRate",
                    ].includes(key),
                )
                .map(([key, label, unit]) => (
                  <div key={key}>
                    <span>{label}</span>
                    <strong>
                      {a.walking![key] == null
                        ? "—"
                        : unit === "/km" || unit === "s"
                          ? duration(Number(a.walking![key]))
                          : decimal(Number(a.walking![key]), 2)}{" "}
                      <small>{unit === "s" ? "min" : unit}</small>
                    </strong>
                  </div>
                ))}
            </div>
          ) : (
            <Empty>
              Esta caminata no tiene métricas normalizadas. Sus notas y payload
              original se conservan.
            </Empty>
          )}
        </section>
      )}
      {a.type === "Strength" && (
        <section className="panel">
          <SectionHeading title="Ejercicios y sets" />
          {a.exercises?.length ? (
            a.exercises.map((e) => (
              <div className="exercise-detail" key={e.id}>
                <h3>
                  <span>{e.order}</span>
                  <Link
                    className="exercise-progress-link"
                    to={`/progress?${new URLSearchParams({ exercise: e.exerciseName })}`}
                    aria-label={`Ver progreso de ${e.exerciseName}`}
                  >
                    {e.exerciseName}{" "}
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                </h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Set</th>
                        <th>Repeticiones</th>
                        <th>Peso</th>
                        <th>Duración</th>
                        <th>Lado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.sets.map((s) => (
                        <tr key={s.id}>
                          <td>{s.setNumber}</td>
                          <td>{s.reps}</td>
                          <td>
                            {s.weightKg == null
                              ? "Peso corporal"
                              : `${decimal(s.weightKg)} kg`}
                          </td>
                          <td>{duration(s.durationSeconds)}</td>
                          <td>
                            {s.side
                              ? {
                                  Left: "Izquierdo",
                                  Right: "Derecho",
                                  Both: "Ambos",
                                }[s.side]
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          ) : (
            <Empty>No hay ejercicios registrados.</Empty>
          )}
        </section>
      )}
      <section className="panel">
        <SectionHeading
          title="JSON de la actividad"
          subtitle="Copia esta actividad en el formato de Importar, incluido su payload original."
        />
        <button type="button" onClick={copyActivity} disabled={copying}>
          <Copy size={16} aria-hidden="true" />
          {copying ? "Copiando…" : "Copiar JSON para importar"}
        </button>
        <p role="status" aria-live="polite">
          {copyStatus}
        </p>
      </section>
      {a.rawPayload != null && (
        <details className="panel raw">
          <summary>Payload original</summary>
          <pre>{a.rawPayloadJson ?? JSON.stringify(a.rawPayload, null, 2)}</pre>
        </details>
      )}
      <div className="delete-area">
        {confirming ? (
          <>
            <p>
              ¿Eliminar esta actividad y todos sus detalles? Esta acción es
              definitiva.
            </p>
            <button className="danger" disabled={busy} onClick={remove}>
              {busy ? "Eliminando…" : "Sí, eliminar"}
            </button>
            <button disabled={busy} onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <button className="danger ghost" onClick={() => setConfirming(true)}>
            <Trash2 size={16} /> Eliminar actividad
          </button>
        )}
        {deleteError && (
          <p role="alert" className="error">
            {deleteError}
          </p>
        )}
      </div>
    </>
  );
}
