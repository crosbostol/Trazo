import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, X, ArrowLeft } from "lucide-react";
import { api } from "../api";
import type { Activity, ActivityType } from "../types";
import { PageTitle, SectionHeading } from "../components";
import { typeLabel } from "../format";
import { runningMetrics, walkingMetrics } from "../metrics";
import { serializeActivityRequest } from "../rawPayload";
import { subjectiveScales } from "../subjective";
type ExerciseDraft = {
  key: string;
  name: string;
  sets: {
    key: string;
    reps: string;
    weight: string;
    duration: string;
    side: string;
  }[];
};
const emptySet = () => ({
  key: crypto.randomUUID(),
  reps: "",
  weight: "",
  duration: "",
  side: "",
});
export default function NewActivityPage() {
  const [type, setType] = useState<ActivityType>("Running");
  const metrics = type === "Walking" ? walkingMetrics : runningMetrics;
  const navigate = useNavigate();
  const [exercises, setExercises] = useState<ExerciseDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function updateExercise(index: number, update: Partial<ExerciseDraft>) {
    setExercises((values) =>
      values.map((e, i) => (i === index ? { ...e, ...update } : e)),
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const num = (key: string) => (form.get(key) ? Number(form.get(key)) : null);
    try {
      const durationSeconds =
        Number(form.get("minutes")) * 60 + Number(form.get("seconds"));
      const details =
        type === "Running" || type === "Walking"
          ? Object.fromEntries(
              metrics
                .filter(([key]) => key !== "totalDurationSeconds")
                .map(([key]) => [key, num(key)]),
            )
          : null;
      const raw = String(form.get("rawPayload") || "").trim();
      const lapText = String(form.get("laps") || "").trim();
      const laps = lapText
        ? lapText.split("\n").map((line, i) => {
            const parts = line.split(";").map((v) => Number(v.trim()));
            if (
              parts.length !== 3 ||
              parts.some((v) => !Number.isFinite(v) || v <= 0)
            )
              throw new Error(
                `Vuelta ${i + 1}: usa distancia; duración en segundos; ritmo en segundos/km.`,
              );
            return {
              lapNumber: i + 1,
              distanceKm: parts[0],
              durationSeconds: parts[1],
              averagePaceSecondsPerKm: parts[2],
            };
          })
        : [];
      setBusy(true);
      const saved = await api<Activity>("/activities", {
        method: "POST",
        body: serializeActivityRequest(
          {
            date: form.get("date"),
            type,
            activitySubtype:
              type === "Other"
                ? String(form.get("activitySubtype") || "").trim() || null
                : null,
            durationSeconds,
            notes: form.get("notes") || null,
            mood: num("mood"),
            energy: num("energy"),
            rpe: num("rpe"),
            subjectiveNotes: form.get("subjectiveNotes") || null,
            running:
              type === "Running"
                ? { ...details, totalDurationSeconds: durationSeconds, laps }
                : null,
            walking:
              type === "Walking"
                ? { ...details, totalDurationSeconds: durationSeconds }
                : null,
            exercises:
              type !== "Strength"
                ? []
                : exercises.map((e, i) => ({
                    exerciseName: e.name,
                    order: i + 1,
                    sets: e.sets.map((s, j) => ({
                      setNumber: j + 1,
                      reps: Number(s.reps),
                      weightKg: s.weight ? Number(s.weight) : null,
                      durationSeconds: s.duration ? Number(s.duration) : null,
                      side: s.side || null,
                    })),
                  })),
          },
          raw,
        ),
      });
      navigate(`/activities/${saved.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" to="/activities">
        <ArrowLeft size={16} /> Actividades
      </Link>
      <PageTitle
        eyebrow="DALE UN LUGAR A TU ENTRENAMIENTO"
        title="Registrar actividad"
        description="Empieza con lo esencial. Las demás métricas son opcionales."
      />
      <form onSubmit={submit} className="activity-form">
        <section className="panel">
          <SectionHeading title="Lo esencial" />
          <div className="form-grid">
            <label>
              Tipo
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ActivityType)}
              >
                {Object.entries(typeLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {type === "Other" && (
              <label>
                Deporte o actividad · opcional
                <input
                  name="activitySubtype"
                  maxLength={200}
                  placeholder="Football, Padel, Mobility…"
                />
              </label>
            )}
            <label>
              Fecha
              <input
                type="date"
                name="date"
                required
                defaultValue={new Date().toLocaleDateString("en-CA")}
              />
            </label>
            <label>
              Duración · minutos
              <input
                type="number"
                name="minutes"
                min="0"
                step="1"
                required
                placeholder="45"
              />
            </label>
            <label>
              Segundos
              <input
                type="number"
                name="seconds"
                min="0"
                max="59"
                step="1"
                defaultValue="0"
                required
              />
            </label>
          </div>
          <label>
            Notas
            <textarea
              name="notes"
              rows={3}
              maxLength={10000}
              placeholder="El recorrido, la sesión, lo que quieras recordar…"
            />
          </label>
        </section>
        {(type === "Running" || type === "Walking") && (
          <section className="panel" key={type}>
            <SectionHeading
              title={
                type === "Walking"
                  ? "Métricas de caminata"
                  : "Métricas de running"
              }
              subtitle="Opcionales · tiempos en segundos y ritmos en segundos por km"
            />
            <div className="form-grid">
              {metrics
                .filter(([key]) =>
                  [
                    "distanceKm",
                    "averagePaceSecondsPerKm",
                    "averageHeartRate",
                  ].includes(key),
                )
                .map(([key, label, unit]) => (
                  <label key={key}>
                    {label} ({unit === "/km" ? "s/km" : unit})
                    <input
                      name={key}
                      type="number"
                      step={key === "averageHeartRate" ? "1" : "any"}
                      min="0"
                    />
                  </label>
                ))}
            </div>
            <details>
              <summary>Más métricas</summary>
              <div className="form-grid">
                {metrics
                  .filter(
                    ([key]) =>
                      ![
                        "distanceKm",
                        "totalDurationSeconds",
                        "averagePaceSecondsPerKm",
                        "averageHeartRate",
                      ].includes(key),
                  )
                  .map(([key, label, unit]) => (
                    <label key={key}>
                      {label} ({unit === "/km" ? "s/km" : unit || "puntos"})
                      <input
                        name={key}
                        type="number"
                        step={
                          /DurationSeconds|HeartRate|PowerWatts|Cadence|Calories|FluidLoss|steps/.test(
                            key,
                          )
                            ? "1"
                            : "any"
                        }
                        min={key.includes("Elevation") ? undefined : 0}
                      />
                    </label>
                  ))}
              </div>
            </details>
            {type === "Running" && (
              <details>
                <summary>Vueltas / splits</summary>
                <label>
                  Una vuelta por línea: distancia km; duración s; ritmo s/km
                  <textarea
                    name="laps"
                    rows={4}
                    placeholder={"1; 490; 490\n0.32; 173; 540.625"}
                  />
                </label>
              </details>
            )}
          </section>
        )}
        {type === "Strength" && (
          <section className="panel">
            <SectionHeading
              title="Ejercicios"
              subtitle="Registra cada set, con peso o con tu propio cuerpo."
            />
            {exercises.map((exercise, i) => (
              <div className="exercise-editor" key={exercise.key}>
                <div className="exercise-header">
                  <label>
                    Ejercicio {i + 1}
                    <input
                      required
                      value={exercise.name}
                      onChange={(e) =>
                        updateExercise(i, { name: e.target.value })
                      }
                      maxLength={200}
                      placeholder="Push-up"
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`Quitar ejercicio ${i + 1}`}
                    onClick={() =>
                      setExercises((values) => values.filter((_, n) => n !== i))
                    }
                  >
                    <X size={16} />
                  </button>
                </div>
                {exercise.sets.map((set, j) => (
                  <div className="set-editor" key={set.key}>
                    <span>Set {j + 1}</span>
                    {(["reps", "weight", "duration"] as const).map((field) => (
                      <label key={field}>
                        {field === "reps"
                          ? "Reps"
                          : field === "weight"
                            ? "Kg"
                            : "Segundos"}
                        <input
                          type="number"
                          min="0"
                          step={field === "weight" ? "0.1" : "1"}
                          value={set[field]}
                          onChange={(e) =>
                            updateExercise(i, {
                              sets: exercise.sets.map((s, n) =>
                                n === j ? { ...s, [field]: e.target.value } : s,
                              ),
                            })
                          }
                        />
                      </label>
                    ))}
                    <label>
                      Lado
                      <select
                        value={set.side}
                        onChange={(e) =>
                          updateExercise(i, {
                            sets: exercise.sets.map((s, n) =>
                              n === j ? { ...s, side: e.target.value } : s,
                            ),
                          })
                        }
                      >
                        <option value="">Sin especificar</option>
                        <option value="Left">Izquierdo</option>
                        <option value="Right">Derecho</option>
                        <option value="Both">Ambos</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      aria-label={`Quitar set ${j + 1}`}
                      onClick={() =>
                        updateExercise(i, {
                          sets: exercise.sets.filter((_, n) => n !== j),
                        })
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    updateExercise(i, { sets: [...exercise.sets, emptySet()] })
                  }
                >
                  <Plus size={15} /> Añadir set
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setExercises((values) => [
                  ...values,
                  { key: crypto.randomUUID(), name: "", sets: [emptySet()] },
                ])
              }
            >
              <Plus size={16} /> Añadir ejercicio
            </button>
          </section>
        )}
        <section className="panel">
          <SectionHeading title="Cómo te sentiste" />
          <div className="form-grid">
            {subjectiveScales.map(({ name, label, values }) => (
              <label key={name}>
                {label}
                <select name={String(name)}>
                  <option value="">Sin registrar</option>
                  {values.map((description, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1} · {description}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label>
            Notas sobre tus sensaciones
            <textarea name="subjectiveNotes" rows={2} maxLength={10000} />
          </label>
        </section>
        <details className="panel">
          <summary>Payload original (JSON opcional)</summary>
          <label>
            Datos originales
            <textarea
              name="rawPayload"
              rows={5}
              placeholder={'{"source": "manual"}'}
            />
          </label>
        </details>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Link className="button" to="/activities">
            Cancelar
          </Link>
          <button className="primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar actividad"}
          </button>
        </div>
      </form>
    </>
  );
}
