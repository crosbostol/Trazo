import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import type { Activity, ActivityType } from "../types";
import { useApi } from "../useApi";
import { ActivityTable, LoadState, PageTitle } from "../components";
import { typeLabel } from "../format";
export default function ActivitiesPage() {
  const { data, error, reload } = useApi<Activity[]>("/activities");
  const [filter, setFilter] = useState("All");
  return (
    <>
      <PageTitle
        eyebrow="EL REGISTRO DE TU CONSTANCIA"
        title="Actividades"
        description="Cada entrenamiento es una parte de tu historia."
      >
        <Link className="button primary" to="/activities/new">
          <Plus size={17} /> Registrar actividad
        </Link>
      </PageTitle>
      <div className="filters" aria-label="Filtrar actividades">
        {["All", ...Object.keys(typeLabel)].map((type) => (
          <button
            key={type}
            className={filter === type ? "selected" : ""}
            onClick={() => setFilter(type)}
          >
            {type === "All" ? "Todas" : typeLabel[type as ActivityType]}
          </button>
        ))}
      </div>
      <section className="panel">
        {data ? (
          <ActivityTable
            activities={data.filter(
              (a) => filter === "All" || a.type === filter,
            )}
          />
        ) : (
          <LoadState error={error} retry={reload} />
        )}
      </section>
    </>
  );
}
