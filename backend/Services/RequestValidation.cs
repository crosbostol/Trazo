using Progress.Api.DTOs;
using Progress.Api.Models;
namespace Progress.Api.Services;

public static class RequestValidation
{
    public static Dictionary<string, string[]> Validate(CreateActivityRequest r)
    {
        var errors = new Dictionary<string, string[]>();
        void Check(bool valid, string field, string message) { if (!valid) errors[field] = [message]; }
        Check(r.Date != default, "date", "Indica una fecha válida.");
        Check(Enum.IsDefined(r.Type), "type", "Tipo no válido.");
        Check(r.ActivitySubtype is null || (r.Type == ActivityType.Other && !string.IsNullOrWhiteSpace(r.ActivitySubtype) && r.ActivitySubtype.Length <= 200 && !r.ActivitySubtype.Contains('\0')),
            "activitySubtype", "El subtipo es opcional y solo corresponde a Other: usa texto de hasta 200 caracteres, sin caracteres nulos ni solo espacios.");
        Check(r.DurationSeconds > 0, "durationSeconds", "La duración debe ser positiva.");
        Check(r.Mood is null or >= 1 and <= 5, "mood", "Usa una escala de 1 a 5.");
        Check(r.Energy is null or >= 1 and <= 5, "energy", "Usa una escala de 1 a 5.");
        Check(r.Rpe is null or >= 1 and <= 10, "rpe", "Usa una escala de 1 a 10.");
        Check(r.Notes?.Length is not > 10000 && r.SubjectiveNotes?.Length is not > 10000, "notes", "Máximo 10000 caracteres.");
        Check(r.Notes?.Contains('\0') != true && r.SubjectiveNotes?.Contains('\0') != true, "notes", "El texto no puede contener el carácter nulo.");
        Check(r.Type == ActivityType.Running || r.Running is null, "running", "Estos detalles requieren una actividad Running.");
        Check(r.Type != ActivityType.Running || r.Running is not null, "running", "Una actividad Running requiere sus detalles; las métricas pueden ser null.");
        Check(r.Type == ActivityType.Walking || r.Walking is null, "walking", "Estos detalles requieren una actividad Walking.");
        Check(r.Type != ActivityType.Walking || r.Walking is not null, "walking", "Una actividad Walking requiere walking; puede ser {}.");
        if (r.Walking is { } walking)
        {
            foreach (var p in typeof(WalkingDetails).GetProperties())
            {
                var value = p.GetValue(walking);
                var elevation = p.Name is "MinElevationMeters" or "MaxElevationMeters";
                if (value is double d) Check(double.IsFinite(d) && (elevation || d >= 0), "walking." + p.Name, "La métrica debe ser finita y no negativa, excepto la altitud.");
                if (value is int i) Check(i >= 0, "walking." + p.Name, "La métrica debe ser no negativa.");
            }
            Check((walking.AverageHeartRate is null or > 0) && (walking.MaxHeartRate is null or > 0) && (walking.RecoveryHeartRate is null or > 0), "walking.heartRate", "La frecuencia cardíaca debe ser positiva; usa null si no está disponible.");
            Check(walking.AverageHeartRate is null || walking.MaxHeartRate is null || walking.AverageHeartRate <= walking.MaxHeartRate, "walking.heartRate", "La FC media no puede superar la máxima.");
            Check((walking.AveragePaceSecondsPerKm is null or > 0) && (walking.MovingPaceSecondsPerKm is null or > 0) && (walking.BestPaceSecondsPerKm is null or > 0), "walking.pace", "El ritmo debe ser positivo; usa null si no está disponible.");
            Check(walking.AverageCadence is null || walking.MaxCadence is null || walking.AverageCadence <= walking.MaxCadence, "walking.cadence", "La cadencia media no puede superar la máxima.");
            Check(walking.MinElevationMeters is null || walking.MaxElevationMeters is null || walking.MinElevationMeters <= walking.MaxElevationMeters, "walking.elevation", "La altitud mínima no puede superar la máxima.");
            Check(walking.ActiveCalories is null || walking.TotalCalories is null || walking.ActiveCalories <= walking.TotalCalories, "walking.calories", "Las calorías activas no pueden superar las totales.");
            Check(walking.TotalDurationSeconds is null || walking.TotalDurationSeconds == r.DurationSeconds, "walking.totalDurationSeconds", "Debe coincidir con la duración de la actividad.");
            Check(walking.MovingDurationSeconds is null || walking.MovingDurationSeconds <= r.DurationSeconds, "walking.movingDurationSeconds", "No puede superar la duración total.");
            Check((walking.AerobicTrainingEffect is null or <= 5) && (walking.AnaerobicTrainingEffect is null or <= 5), "walking.trainingEffect", "El efecto de entrenamiento usa una escala de 0 a 5.");
        }
        Check(r.Type == ActivityType.Strength || r.Exercises is null or { Count: 0 }, "exercises", "Los ejercicios requieren una actividad Strength.");
        Check(r.Type != ActivityType.Strength || r.Exercises is { Count: > 0 }, "exercises", "Una actividad Strength requiere al menos un ejercicio.");
        if (r.Running is { } running)
        {
            foreach (var p in typeof(RunningDetails).GetProperties())
            {
                var value = p.GetValue(running);
                var elevation = p.Name is "MinElevationMeters" or "MaxElevationMeters";
                if (value is double d) Check(double.IsFinite(d) && (elevation || d >= 0), "running." + p.Name, "La métrica debe ser finita y no negativa, excepto la altitud.");
                if (value is int i) Check(i >= 0, "running." + p.Name, "La métrica debe ser no negativa.");
            }
            Check(running.AverageHeartRate is null or > 0 && running.MaxHeartRate is null or > 0 && running.RecoveryHeartRate is null or > 0, "running.heartRate", "La frecuencia cardíaca debe ser positiva; usa null si no está disponible.");
            Check((running.AveragePaceSecondsPerKm is null or > 0) && (running.MovingPaceSecondsPerKm is null or > 0) && (running.BestPaceSecondsPerKm is null or > 0), "running.pace", "El ritmo debe ser positivo; usa null si no está disponible.");
            Check(running.AverageHeartRate is null || running.MaxHeartRate is null || running.AverageHeartRate <= running.MaxHeartRate, "running.heartRate", "La FC media no puede superar la máxima.");
            Check(running.AverageCadence is null || running.MaxCadence is null || running.AverageCadence <= running.MaxCadence, "running.cadence", "La cadencia media no puede superar la máxima.");
            Check(running.AveragePowerWatts is null || running.MaxPowerWatts is null || running.AveragePowerWatts <= running.MaxPowerWatts, "running.power", "La potencia media no puede superar la máxima.");
            Check(running.MinElevationMeters is null || running.MaxElevationMeters is null || running.MinElevationMeters <= running.MaxElevationMeters, "running.elevation", "La altitud mínima no puede superar la máxima.");
            Check(running.ActiveCalories is null || running.TotalCalories is null || running.ActiveCalories <= running.TotalCalories, "running.calories", "Las calorías activas no pueden superar las totales.");
            Check((long)(running.RunningDurationSeconds ?? 0) + (running.WalkingDurationSeconds ?? 0) <= r.DurationSeconds, "running.durations", "Los tiempos corriendo y caminando no pueden superar el total de la actividad.");
            Check(running.TotalDurationSeconds is null || running.TotalDurationSeconds == r.DurationSeconds, "running.totalDurationSeconds", "Debe coincidir con la duración de la actividad.");
            Check(running.MovingDurationSeconds is null || running.MovingDurationSeconds <= r.DurationSeconds, "running.movingDurationSeconds", "No puede superar la duración total.");
            Check((running.AerobicTrainingEffect is null or <= 5) && (running.AnaerobicTrainingEffect is null or <= 5), "running.trainingEffect", "El efecto de entrenamiento usa una escala de 0 a 5.");
            var laps = running.Laps ?? [];
            Check(running.Laps != null && laps.All(x => x is not null && x.LapNumber > 0 && (x.DistanceKm is null or > 0) && (x.DurationSeconds is null or > 0) && (x.AveragePaceSecondsPerKm is null or > 0)), "running.laps", "Usa vueltas con números y métricas positivos.");
            Check(laps.Where(x => x != null).Select(x => x.LapNumber).Distinct().Count() == laps.Count, "running.laps", "No repitas el número de vuelta.");
            Check(laps.Where(x => x != null).All(x =>
                (x.DistanceKm is null || double.IsFinite(x.DistanceKm.Value)) &&
                (x.AveragePaceSecondsPerKm is null || double.IsFinite(x.AveragePaceSecondsPerKm.Value)) &&
                (x.DistanceKm is > 0 || x.DurationSeconds is > 0)), "running.laps", "Cada vuelta requiere distancia o duración positiva y métricas finitas.");
            // Allow independent rounding to seconds for each lap and the total.
            Check(laps.Where(x => x != null).Sum(x => (long)(x.DurationSeconds ?? 0)) <= (long)r.DurationSeconds + (laps.Count + 1L) / 2,
                "running.laps.duration", "La suma de tiempos de vueltas supera la duración total, incluso considerando el redondeo a segundos.");
            // Summaries are commonly rounded to 0.01 km; allow the accumulated
            // half-unit rounding error for each recorded lap and the total.
            if (running.DistanceKm is { } distance)
                Check(laps.Where(x => x != null).Sum(x => x.DistanceKm ?? 0) <= distance + .005 * (laps.Count(x => x?.DistanceKm != null) + 1),
                    "running.laps.distance", "La suma de distancias de vueltas supera el total, incluso considerando el redondeo a 0,01 km.");
        }
        var exercises = r.Exercises ?? [];
        Check(exercises.All(x => x != null && !string.IsNullOrWhiteSpace(x.ExerciseName) && !x.ExerciseName.Contains('\0') && x.ExerciseName.Length <= 200 && x.Order >= 0 && x.Sets is { Count: > 0 }), "exercises", "Cada ejercicio requiere nombre válido, orden no negativo y al menos un set.");
        Check(exercises.Where(x => x != null).Select(x => x.Order).Distinct().Count() == exercises.Count, "exercises.order", "El orden no debe repetirse.");
        foreach (var exercise in exercises.Where(x => x?.Sets != null))
        {
            Check(exercise.Sets.All(x => x != null && x.SetNumber > 0 && x.Reps >= 0 && (x.Reps > 0 || x.DurationSeconds > 0) && (x.WeightKg is null or >= 0) && (x.DurationSeconds is null or > 0) && (x.Side is null || Enum.IsDefined(x.Side.Value))), "sets", "Usa números de set positivos, repeticiones o duración y peso no negativo.");
            Check(exercise.Sets.Where(x => x != null).Select(x => x.SetNumber).Distinct().Count() == exercise.Sets.Count, "sets.setNumber", "No repitas números de set dentro de un ejercicio.");
            Check(exercise.Sets.Where(x => x != null).All(x => (x.WeightKg is null || double.IsFinite(x.WeightKg.Value)) && (x.DurationSeconds is null || x.DurationSeconds <= r.DurationSeconds)), "sets", "El peso debe ser finito y ningún set puede durar más que la actividad.");
        }
        return errors;
    }
    public static Dictionary<string, string[]> Validate(CreateBodyRequest r)
    {
        var errors = new Dictionary<string, string[]>();
        if (r.Date == default) errors["date"] = ["Indica una fecha válida."];
        if (!double.IsFinite(r.WeightKg) || r.WeightKg <= 0) errors["weightKg"] = ["El peso debe ser positivo."];
        if (r.BodyFatPercentage is { } fat && (!double.IsFinite(fat) || fat < 0 || fat > 100)) errors["bodyFatPercentage"] = ["Usa un porcentaje finito entre 0 y 100."];
        if (r.Notes?.Length > 10000) errors["notes"] = ["Máximo 10000 caracteres."];
        if (r.Notes?.Contains('\0') == true) errors["notes"] = ["El texto no puede contener el carácter nulo."];
        return errors;
    }
}
