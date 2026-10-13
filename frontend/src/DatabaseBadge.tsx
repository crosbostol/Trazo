import { useApi } from "./useApi";

export interface DatabaseInfo {
  database: string;
  isDemo: boolean;
  hasLegacySeedHistory: boolean;
}

export default function DatabaseBadge() {
  const { data, error, reload } = useApi<DatabaseInfo>("/database-info");
  if (error)
    return (
      <button className="database-badge" onClick={reload}>
        Base no disponible · Reintentar
      </button>
    );
  return (
    <span
      className="personal-badge database-badge"
      title={
        data?.hasLegacySeedHistory
          ? "Esta base tiene historial del MVP anterior. Puede contener datos demo: revisa el procedimiento de base limpia del README."
          : undefined
      }
    >
      <i />
      {data
        ? `${data.database} · ${data.isDemo ? "Demo" : data.hasLegacySeedHistory ? "Revisar historial previo" : "Registro personal"}`
        : "Conectando…"}
    </span>
  );
}
