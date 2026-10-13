import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileInput } from "lucide-react";
import { api } from "../api";
import { useApi } from "../useApi";
import type { Activity, ActivityType } from "../types";
import type { DatabaseInfo } from "../DatabaseBadge";
import { PageTitle, SectionHeading } from "../components";
import {
  dateLabel,
  decimal,
  duration,
  typeLabel,
  activityLabel,
} from "../format";
import {
  field,
  formatActivityJson,
  updateSubjective,
  validateActivityJson,
} from "../importActivity";
import { subjectiveScales } from "../subjective";

export default function ImportPage() {
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const navigate = useNavigate();
  const {
    data: database,
    error: databaseError,
    reload,
  } = useApi<DatabaseInfo>("/database-info");
  const read = (name: string) => field(preview, name);
  const details = read(
    String(read("type")).toLowerCase() === "walking" ? "walking" : "running",
  );
  const metric = (name: string) => {
    const value = field(details, name);
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  const type = Object.keys(typeLabel).find(
    (t) => t.toLowerCase() === String(read("type")).toLowerCase(),
  ) as ActivityType | undefined;
  const name = type
    ? activityLabel({
        type,
        activitySubtype:
          typeof read("activitySubtype") === "string"
            ? String(read("activitySubtype")).trim()
            : null,
      })
    : "";
  function edit(text: string) {
    setSource(text);
    setPreview(null);
    setConfirming(false);
    setError("");
  }
  function validate() {
    try {
      setPreview(validateActivityJson(source));
      setError("");
      setConfirming(false);
    } catch (e) {
      setPreview(null);
      setError((e as Error).message);
    }
  }
  function format() {
    try {
      setSource(formatActivityJson(source));
      setError("");
    } catch {
      setError("No se puede formatear: revisa la sintaxis del JSON.");
    }
  }
  function subjective(name: string, value: number | string | null) {
    try {
      const text = updateSubjective(source, name, value);
      setSource(text);
      setPreview(validateActivityJson(text));
      setConfirming(false);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function save() {
    if (!preview || !confirming || !database || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      // Keep every numeric token intact, particularly inside rawPayload.
      const activity = await api<Activity>("/activities", {
        method: "POST",
        body: source,
      });
      navigate(`/activities/${activity.id}`, { replace: true });
    } catch (e) {
      setError(
        `${(e as Error).message} Si se perdió la conexión, revisa Actividades antes de reintentar para evitar duplicados.`,
      );
      setConfirming(false);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="CADA SESIÓN CUENTA"
        title="Importar actividad"
        description="Pega tu registro, revisa sus datos y guárdalo en tu diario."
      />
      <div className="activity-form import-form">
        <section className="panel">
          <SectionHeading
            title="Tu registro"
            subtitle="Una actividad en JSON · el mismo formato del registro de actividades"
          />
          <label htmlFor="activity-json">JSON de la actividad</label>
          <textarea
            id="activity-json"
            className="import-source"
            rows={14}
            spellCheck={false}
            value={source}
            disabled={busy}
            onChange={(e) => edit(e.target.value)}
            placeholder={
              '{\n  "date": "2026-09-22",\n  "type": "Running",\n  "durationSeconds": 1800,\n  "running": { "distanceKm": 5 }\n}'
            }
          />
          <p className="import-hint">
            Validar y formatear ocurre en tu navegador. No se envía el registro
            hasta que confirmes.
          </p>
          <div className="form-actions">
            <button
              type="button"
              onClick={format}
              disabled={busy || !source.trim()}
            >
              Formatear JSON
            </button>
            <button
              type="button"
              className="primary"
              onClick={validate}
              disabled={busy || !source.trim()}
            >
              Validar
            </button>
          </div>
        </section>
        {preview && type && (
          <>
            <section className="panel" aria-label="Vista previa">
              <SectionHeading
                title="Vista previa"
                subtitle="Estructura comprobada. Al guardar se verifican todas las reglas de integridad."
              />
              <dl className="import-preview">
                <div>
                  <dt>Actividad</dt>
                  <dd>{name}</dd>
                </div>
                <div>
                  <dt>Fecha</dt>
                  <dd>{dateLabel(String(read("date")), true)}</dd>
                </div>
                <div>
                  <dt>Duración</dt>
                  <dd>{duration(Number(read("durationSeconds")))} min</dd>
                </div>
                {(type === "Running" || type === "Walking") && (
                  <>
                    <div>
                      <dt>Distancia</dt>
                      <dd>{decimal(metric("distanceKm"), 2)} km</dd>
                    </div>
                    <div>
                      <dt>Ritmo</dt>
                      <dd>{duration(metric("averagePaceSecondsPerKm"))} /km</dd>
                    </div>
                    <div>
                      <dt>FC media / máxima</dt>
                      <dd>
                        {decimal(metric("averageHeartRate"), 0)} /{" "}
                        {decimal(metric("maxHeartRate"), 0)} lpm
                      </dd>
                    </div>
                    <div>
                      <dt>Training Effect · aeróbico</dt>
                      <dd>{decimal(metric("aerobicTrainingEffect"), 1)}</dd>
                    </div>
                    <div>
                      <dt>Training Effect · anaeróbico</dt>
                      <dd>{decimal(metric("anaerobicTrainingEffect"), 1)}</dd>
                    </div>
                  </>
                )}
              </dl>
              {type === "Strength" && (
                <ul className="import-exercises">
                  {(read("exercises") as unknown[]).map((exercise, index) => (
                    <li key={index}>
                      {String(field(exercise, "exerciseName"))} ·{" "}
                      {(field(exercise, "sets") as unknown[]).length} sets
                    </li>
                  ))}
                </ul>
              )}
              {typeof read("notes") === "string" && (
                <p className="import-hint">{String(read("notes"))}</p>
              )}
              <p className="import-hint">
                {read("rawPayload") == null
                  ? "Sin payload original."
                  : "Payload original incluido; se conserva sin reinterpretar sus números."}
              </p>
            </section>
            <section className="panel">
              <SectionHeading
                title="Cómo te sentiste"
                subtitle="Puedes completar tus sensaciones antes de guardar. El JSON se actualiza aquí mismo."
              />
              <div className="form-grid">
                {subjectiveScales.map((scale) => (
                  <label key={scale.name}>
                    {scale.label}
                    <select
                      value={
                        read(scale.name) == null ? "" : String(read(scale.name))
                      }
                      disabled={busy}
                      onChange={(e) =>
                        subjective(
                          scale.name,
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                    >
                      <option value="">Sin registrar</option>
                      {scale.values.map((label, index) => (
                        <option key={index} value={index + 1}>
                          {index + 1} · {label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <label>
                Notas sobre tus sensaciones
                <textarea
                  rows={3}
                  maxLength={10000}
                  disabled={busy}
                  value={String(read("subjectiveNotes") ?? "")}
                  onChange={(e) =>
                    subjective("subjectiveNotes", e.target.value || null)
                  }
                />
              </label>
            </section>
            <section className="panel import-confirm">
              <p>
                Destino:{" "}
                <strong>
                  {database
                    ? `${database.database} · ${database.isDemo ? "Demo" : "Registro personal"}`
                    : "Comprobando conexión…"}
                </strong>
              </p>
              {database?.hasLegacySeedHistory && (
                <p className="error">
                  Esta base conserva historial del MVP anterior y puede incluir
                  ejemplos. Revisa el procedimiento de base real limpia del
                  README antes de mezclar datos.
                </p>
              )}
              {databaseError && (
                <p className="error">
                  No se pudo comprobar la base.{" "}
                  <button onClick={reload}>Reintentar</button>
                </p>
              )}
              {confirming ? (
                <div role="group" aria-label="Confirmar importación">
                  <p>
                    Se guardará una actividad de {name} del{" "}
                    {dateLabel(String(read("date")), true)}. Revisa que no la
                    hayas importado antes.
                  </p>
                  <div className="form-actions">
                    <button
                      onClick={() => setConfirming(false)}
                      disabled={busy}
                    >
                      Volver a revisar
                    </button>
                    <button
                      className="primary"
                      onClick={save}
                      disabled={busy || !database}
                    >
                      {busy ? "Importando…" : "Confirmar y guardar"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="primary"
                  onClick={() => setConfirming(true)}
                  disabled={!database || busy}
                >
                  <FileInput size={17} /> Importar actividad
                </button>
              )}
            </section>
          </>
        )}
        {error && (
          <p className="error import-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
