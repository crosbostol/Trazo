import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../useApi";
import {
  Empty,
  LoadState,
  PageTitle,
  SectionHeading,
  TrendChart,
} from "../components";
import { dateLabel, decimal, duration } from "../format";

type RecordEntry = {
  activityId: string;
  date: string;
  value: number;
  weightKg: number | null;
  reps: number | null;
};
type ProgressData = {
  name: string;
  prs: Record<
    | "heaviestWeight"
    | "mostRepsAtAnyWeight"
    | "highestSetVolume"
    | "highestSessionVolume",
    RecordEntry | null
  >;
  series: { activityId: string; date: string; weightKg: number | null }[];
  sessions: {
    activityId: string;
    date: string;
    setCount: number;
    knownWeightReps: number | null;
    volumeKg: number | null;
    sets: {
      exerciseId: string;
      exerciseName: string;
      setNumber: number;
      reps: number;
      weightKg: number | null;
      durationSeconds: number | null;
      side: "Left" | "Right" | "Both" | null;
    }[];
  }[];
};
const records = [
  ["heaviestWeight", "Mayor peso", "kg"],
  ["mostRepsAtAnyWeight", "Más repeticiones", "reps"],
  ["highestSetVolume", "Mayor volumen de un set", "kg"],
  ["highestSessionVolume", "Mayor volumen de sesión", "kg"],
] as const;
const sides = { Left: "Izquierdo", Right: "Derecho", Both: "Ambos" };

function ExerciseProgress({ data }: { data: ProgressData }) {
  return (
    <div className="strength-progress">
      <section aria-label="Récords personales" className="stats-grid">
        {records.map(([key, label, unit]) => {
          const pr = data.prs[key];
          return (
            <article className="panel stat" key={key}>
              <h2 className="stat-label">{label}</h2>
              <div className="stat-value">
                {decimal(pr?.value, key === "mostRepsAtAnyWeight" ? 0 : 2)}
                <small>{pr && unit}</small>
              </div>
              {pr ? (
                <>
                  <p>
                    {key === "highestSessionVolume"
                      ? `${decimal(pr.reps, 0)} reps con peso conocido`
                      : `${decimal(pr.weightKg, 2)} kg · ${decimal(pr.reps, 0)} reps`}
                  </p>
                  <Link
                    className="text-link"
                    to={`/activities/${pr.activityId}`}
                  >
                    {dateLabel(pr.date, true)} ↗
                  </Link>
                </>
              ) : (
                <p>Sin datos suficientes</p>
              )}
            </article>
          );
        })}
      </section>
      <section
        className="panel progress-chart"
        aria-label="Mejor peso por sesión"
      >
        <SectionHeading
          title="Mejor peso por sesión"
          subtitle="Cada punto es una actividad · kg registrados"
        />
        {data.series.some((s) => s.weightKg != null) ? (
          <TrendChart data={data.series} x="date" y="weightKg" unit="kg" />
        ) : (
          <Empty>Este ejercicio aún no tiene pesos registrados.</Empty>
        )}
      </section>
      <section aria-label="Historial de sesiones">
        <SectionHeading
          title={`Historial · ${data.name}`}
          subtitle="De la primera sesión a la más reciente. — significa dato desconocido; 0 es un valor registrado."
        />
        <p className="progress-note">
          Volumen conocido: peso × repeticiones, solo con peso registrado y reps
          mayores que cero. No incluye peso corporal supuesto.
        </p>
        {data.sessions.map((session) => (
          <article className="panel progress-session" key={session.activityId}>
            <header>
              <Link
                className="text-link"
                to={`/activities/${session.activityId}`}
              >
                Ver actividad · {dateLabel(session.date, true)} ↗
              </Link>
              <p>
                {session.setCount} sets · {decimal(session.knownWeightReps, 0)}{" "}
                reps con peso conocido · {decimal(session.volumeKg, 2)} kg de
                volumen conocido
              </p>
            </header>
            {session.sets.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Ejercicio original</th>
                      <th>Set</th>
                      <th>Peso · kg</th>
                      <th>Reps</th>
                      <th>Duración</th>
                      <th>Lado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {session.sets.map((set) => (
                      <tr key={`${set.exerciseId}-${set.setNumber}`}>
                        <td className="original-exercise">
                          {set.exerciseName}
                        </td>
                        <td>{set.setNumber}</td>
                        <td>{decimal(set.weightKg, 2)}</td>
                        <td>{set.reps}</td>
                        <td>{duration(set.durationSeconds)}</td>
                        <td>{set.side ? sides[set.side] : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Esta sesión no tiene sets registrados.</Empty>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

function ExerciseView({
  choices,
}: {
  choices: { name: string; lastDate: string }[];
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("exercise");
  const exercise = requested ?? choices[0].name;
  // Let the existing API resolve the key: it owns the exact Trim +
  // OrdinalIgnoreCase rule, including Unicode edge cases and original names.
  const { data, error, reload } = useApi<ProgressData>(
    `/strength/progress?${new URLSearchParams({ exercise })}`,
  );
  const selected =
    data?.name ?? choices.find((item) => item.name === exercise)?.name ?? "";
  return (
    <>
      <section className="panel progress-selector">
        <label htmlFor="progress-exercise">Ejercicio</label>
        <select
          id="progress-exercise"
          value={selected}
          onChange={(event) =>
            setSearchParams(
              new URLSearchParams({ exercise: event.target.value }),
              {
                replace: true,
              },
            )
          }
        >
          {!selected && <option value="">Selecciona un ejercicio</option>}
          {choices.map((item) => (
            <option value={item.name} key={item.name}>
              {item.name}
            </option>
          ))}
        </select>
        <p>
          Ordenados por sesión más reciente. Solo se agrupan espacios exteriores
          y mayúsculas/minúsculas.
        </p>
      </section>
      {data ? (
        <ExerciseProgress data={data} />
      ) : error === "Este ejercicio no está en tu historial de fuerza." ? (
        <div className="panel progress-missing" role="status">
          <p>{error} Puedes elegir uno del selector.</p>
        </div>
      ) : (
        <LoadState error={error} retry={reload} />
      )}
    </>
  );
}

export default function ProgressPage() {
  const { data, error, reload } = useApi<{ name: string; lastDate: string }[]>(
    "/strength/exercises",
  );
  return (
    <>
      <PageTitle
        eyebrow="FUERZA · TU HISTORIAL"
        title="Progreso"
        description="Tus ejercicios, sesión a sesión. Récords personales a partir de lo que registraste."
      />
      {!data ? (
        <LoadState error={error} retry={reload} />
      ) : !data.length ? (
        <div className="panel">
          <Empty>
            Aún no hay ejercicios de fuerza en tu historial. Registra una
            actividad Strength con ejercicios para comenzar.
          </Empty>
        </div>
      ) : (
        <ExerciseView choices={data} />
      )}
    </>
  );
}
