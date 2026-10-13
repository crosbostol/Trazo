export const runningMetrics: [string, string, string][] = [
  ["distanceKm", "Distancia", "km"],
  ["totalDurationSeconds", "Tiempo total", "s"],
  ["movingDurationSeconds", "Tiempo en movimiento", "s"],
  ["runningDurationSeconds", "Tiempo corriendo", "s"],
  ["walkingDurationSeconds", "Tiempo caminando", "s"],
  ["averagePaceSecondsPerKm", "Ritmo medio", "/km"],
  ["movingPaceSecondsPerKm", "Ritmo en movimiento", "/km"],
  ["bestPaceSecondsPerKm", "Mejor ritmo", "/km"],
  ["averageHeartRate", "FC media", "bpm"],
  ["maxHeartRate", "FC máxima", "bpm"],
  ["recoveryHeartRate", "FC de recuperación", "bpm"],
  ["averagePowerWatts", "Potencia media", "W"],
  ["maxPowerWatts", "Potencia máxima", "W"],
  ["averageCadence", "Cadencia media", "spm"],
  ["maxCadence", "Cadencia máxima", "spm"],
  ["averageStrideLengthMeters", "Longitud de zancada", "m"],
  ["totalAscentMeters", "Ascenso", "m"],
  ["totalDescentMeters", "Descenso", "m"],
  ["minElevationMeters", "Altitud mínima", "m"],
  ["maxElevationMeters", "Altitud máxima", "m"],
  ["aerobicTrainingEffect", "Efecto aeróbico", "/5"],
  ["anaerobicTrainingEffect", "Efecto anaeróbico", "/5"],
  ["trainingLoad", "Carga de entrenamiento", ""],
  ["activeCalories", "Calorías activas", "kcal"],
  ["totalCalories", "Calorías totales", "kcal"],
  ["estimatedFluidLossMl", "Pérdida estimada de líquido", "ml"],
];
// Walking shares these units/labels; omit running-only dynamics and power.
export const walkingMetrics: [string, string, string][] = [
  ...runningMetrics.filter(
    ([key]) =>
      ![
        "runningDurationSeconds",
        "walkingDurationSeconds",
        "averagePowerWatts",
        "maxPowerWatts",
        "averageStrideLengthMeters",
      ].includes(key),
  ),
  ["steps", "Pasos", "pasos"],
];
