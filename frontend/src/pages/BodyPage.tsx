import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import { useApi } from "../useApi";
import type { BodyMeasurement } from "../types";
import {
  Empty,
  LoadState,
  PageTitle,
  SectionHeading,
  TrendChart,
} from "../components";
import { dateLabel, decimal } from "../format";
export default function BodyPage() {
  const { data, error, reload } =
    useApi<BodyMeasurement[]>("/body-measurements");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    setSaveError("");
    try {
      await api("/body-measurements", {
        method: "POST",
        body: JSON.stringify({
          date: values.get("date"),
          weightKg: Number(values.get("weightKg")),
          bodyFatPercentage: values.get("bodyFatPercentage")
            ? Number(values.get("bodyFatPercentage"))
            : null,
          notes: values.get("notes") || null,
        }),
      });
      form.reset();
      reload();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="UNA MIRADA A LARGO PLAZO"
        title="Tu cuerpo"
        description="Registra tus mediciones y observa su evolución, sin prisa."
      />
      {!data ? (
        <LoadState error={error} retry={reload} />
      ) : (
        <>
          <div className="body-layout">
            <section className="panel">
              <SectionHeading
                title="Evolución del peso"
                subtitle="Todas tus mediciones · kg"
              />
              <div className="chart-summary">
                {decimal(data[0]?.weightKg)}
                <span>kg · último registro</span>
              </div>
              <TrendChart
                data={[...data].reverse()}
                x="date"
                y="weightKg"
                unit="kg"
              />
            </section>
            <section className="panel">
              <SectionHeading title="Nueva medición" />
              <form onSubmit={submit} className="stack-form">
                <label>
                  Fecha
                  <input
                    required
                    type="date"
                    name="date"
                    defaultValue={new Date().toLocaleDateString("en-CA")}
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Peso (kg)
                    <input
                      required
                      type="number"
                      min="0.1"
                      step="0.1"
                      name="weightKg"
                      placeholder="76,2"
                    />
                  </label>
                  <label>
                    Grasa corporal (%)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      name="bodyFatPercentage"
                      placeholder="Opcional"
                    />
                  </label>
                </div>
                <label>
                  Notas
                  <textarea
                    name="notes"
                    maxLength={10000}
                    rows={2}
                    placeholder="Contexto de la medición…"
                  />
                </label>
                {saveError && (
                  <p role="alert" className="error">
                    {saveError}
                  </p>
                )}
                <button className="primary" disabled={saving}>
                  {saving ? "Guardando…" : "Guardar medición"}
                </button>
              </form>
            </section>
          </div>
          <section className="panel">
            <SectionHeading title="Historial de mediciones" />
            {data.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Peso</th>
                      <th>Grasa corporal</th>
                      <th>Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((m) => (
                      <tr key={m.id}>
                        <td>{dateLabel(m.date, true)}</td>
                        <td>{decimal(m.weightKg)} kg</td>
                        <td>
                          {decimal(m.bodyFatPercentage)}{" "}
                          {m.bodyFatPercentage != null && "%"}
                        </td>
                        <td>{m.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Aún no tienes mediciones.</Empty>
            )}
          </section>
        </>
      )}
    </>
  );
}
