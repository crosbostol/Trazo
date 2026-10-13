using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Progress.Api.Models;
namespace Progress.Api.Data;

public static class DemoSeed
{
    public static async Task RunAsync(ProgressDbContext db)
    {
        // An explicit opt-in is allowed only against a separate demo database.
        if (!db.Database.GetDbConnection().Database.EndsWith("_demo", StringComparison.Ordinal))
            throw new InvalidOperationException("El seed requiere una base separada cuyo nombre termine en _demo.");
        await using var transaction = await db.Database.BeginTransactionAsync();
        // Serialize concurrent startup attempts. Marker and sample data commit atomically.
        await db.Database.ExecuteSqlRawAsync("DECLARE @result int; EXEC @result = sys.sp_getapplock @Resource = N'trazo-demo-v1', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 30000; IF @result < 0 THROW 51000, 'Cannot acquire demo seed lock', 1;");
        if (await db.Set<SeedHistory>().AnyAsync(x => x.Name == "demo-v1")) return;
        db.Add(new SeedHistory { Name = "demo-v1" });
        if (await db.Activities.AnyAsync() || await db.BodyMeasurements.AnyAsync())
        {
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return;
        }
        var anchor = new DateOnly(2026, 9, 21);
        Activity Run(DateOnly date, double km, int seconds, double pace, int hr) => new()
        {
            Date = date,
            Type = ActivityType.Running,
            DurationSeconds = seconds,
            Notes = "Datos de demostración · rodaje tranquilo.",
            Mood = 4,
            Energy = 3,
            Rpe = 4,
            Running = new() { DistanceKm = km, TotalDurationSeconds = seconds, AveragePaceSecondsPerKm = pace, AverageHeartRate = hr }
        };
        var first = Run(anchor, 6.32, 3113, 492, 145);
        first.Running = new()
        {
            DistanceKm = 6.32,
            TotalDurationSeconds = 3113,
            MovingDurationSeconds = 2873,
            AveragePaceSecondsPerKm = 492,
            MovingPaceSecondsPerKm = 454,
            BestPaceSecondsPerKm = 391,
            AverageHeartRate = 145,
            MaxHeartRate = 160,
            AveragePowerWatts = 249,
            MaxPowerWatts = 354,
            AverageCadence = 138,
            AverageStrideLengthMeters = .88,
            TotalAscentMeters = 30,
            TotalDescentMeters = 30,
            AerobicTrainingEffect = 2.8,
            AnaerobicTrainingEffect = 0,
            TrainingLoad = 52,
            Laps = Enumerable.Range(1, 6).Select(i => new RunningLap { LapNumber = i, DistanceKm = 1, DurationSeconds = 490, AveragePaceSecondsPerKm = 490 })
                .Append(new RunningLap { LapNumber = 7, DistanceKm = .32, DurationSeconds = 173, AveragePaceSecondsPerKm = 540.625 }).ToList()
        };
        first.RawPayload = JsonDocument.Parse("""{"source":"manual-demo","distanceKm":6.32,"duration":"51:53","note":"Synthetic laps for development"}""");
        var second = Run(anchor.AddDays(-1), 6.45, 2895, 448, 142);
        second.Running!.MaxHeartRate = 162;
        second.Running.AveragePowerWatts = 278;
        second.Running.MaxPowerWatts = 435;
        second.Running.AverageCadence = 144;
        second.Running.AverageStrideLengthMeters = .93;
        second.Running.TotalAscentMeters = 43;
        second.Running.TotalDescentMeters = 40;
        second.Running.AerobicTrainingEffect = 3;
        second.Running.TrainingLoad = 64;
        db.Activities.AddRange(first, second);
        for (var week = 1; week <= 11; week++)
        {
            for (var session = 0; session < 3; session++)
            {
                var distance = Math.Round(4.1 + (11 - week) * .17 + session * .35, 2);
                var pace = 498 + week * 3 - session * 6;
                db.Activities.Add(Run(anchor.AddDays(-week * 7 - session * 2), distance, (int)Math.Round(distance * pace), pace, 140 + session * 3));
            }
            db.BodyMeasurements.Add(new() { Date = anchor.AddDays(-week * 7), WeightKg = Math.Round(76.2 + week * .12, 1), Notes = "Datos de demostración" });
        }
        db.BodyMeasurements.Add(new() { Date = anchor, WeightKg = 76.2, BodyFatPercentage = 19.4, Notes = "Datos de demostración" });
        StrengthExercise Exercise(string name, int order, params int[] reps) => new()
        {
            ExerciseName = name,
            Order = order,
            Sets = reps.Select((n, i) => new StrengthSet { SetNumber = i + 1, Reps = n }).ToList()
        };
        var split = Exercise("Bulgarian split squat", 3, 10, 10);
        split.Sets[0].Side = SetSide.Left;
        split.Sets[1].Side = SetSide.Right;
        var swing = Exercise("Kettlebell swing", 4, 20, 20, 20);
        foreach (var set in swing.Sets) set.WeightKg = 16;
        db.Activities.Add(new()
        {
            Date = anchor.AddDays(-2),
            Type = ActivityType.Strength,
            DurationSeconds = 2100,
            Notes = "Datos de demostración · fuerza con peso corporal y kettlebell.",
            Mood = 4,
            Energy = 4,
            Rpe = 6,
            Exercises = [Exercise("Push-up", 1, 12, 11, 9), Exercise("Pull-up", 2, 2, 2, 1), split, swing]
        });
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
    }
}
