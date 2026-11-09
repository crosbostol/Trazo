using Progress.Api.DTOs;
using Progress.Api.Models;
using Progress.Api.Persistence;
using Progress.Api.Services;

namespace Progress.Api.Endpoints;

public static class CosmosApiEndpoints
{
    public static void MapCosmosApi(this WebApplication app)
    {
        var strength = app.MapGroup("/api/strength").WithTags("Strength progress").RequireAuthorization();
        strength.MapGet("/exercises", async (CosmosStrengthProgressService service, CancellationToken ct) =>
            Results.Ok(await service.ListAsync(ct)));
        strength.MapGet("/progress", async Task<IResult> (string? exercise, CosmosStrengthProgressService service, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(exercise) || exercise.Trim().Length > 200)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["exercise"] = ["Selecciona un ejercicio válido (hasta 200 caracteres)."] });
            var progress = await service.GetAsync(exercise, ct);
            return progress is null ? Results.NotFound() : Results.Ok(progress);
        });
        app.MapGet("/api/database-info", (CosmosRecordStore store) =>
            Results.Ok(new { Database = store.DatabaseName, IsDemo = store.DatabaseName.EndsWith("_demo", StringComparison.Ordinal), HasLegacySeedHistory = false }))
            .WithTags("Local configuration").RequireAuthorization();
        var activities = app.MapGroup("/api/activities").WithTags("Activities").RequireAuthorization();
        activities.MapGet("/", async (CosmosRecordStore store, CancellationToken ct) =>
        {
            var rows = await store.QueryAsync<ActivityListRow>("""
                SELECT c.id, c.date, c.createdAt, c.type, c.activitySubtype, c.durationSeconds,
                  c.notes, c.mood, c.energy, c.rpe,
                  IIF(c.type = "Walking", IIF(IS_NUMBER(c.walking.distanceKm), c.walking.distanceKm, null), IIF(IS_NUMBER(c.running.distanceKm), c.running.distanceKm, null)) AS distanceKm,
                  IIF(c.type = "Walking", IIF(IS_NUMBER(c.walking.averagePaceSecondsPerKm), c.walking.averagePaceSecondsPerKm, null), IIF(IS_NUMBER(c.running.averagePaceSecondsPerKm), c.running.averagePaceSecondsPerKm, null)) AS averagePaceSecondsPerKm,
                  IIF(c.type = "Walking", IIF(IS_NUMBER(c.walking.averageHeartRate), c.walking.averageHeartRate, null), IIF(IS_NUMBER(c.running.averageHeartRate), c.running.averageHeartRate, null)) AS averageHeartRate
                FROM c WHERE c.documentType = "activity"
                """, ct: ct);
            return rows.OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt).Select(x => new
            {
                x.Id, x.Date, x.Type, x.ActivitySubtype, x.DurationSeconds, x.Notes,
                x.Mood, x.Energy, x.Rpe, x.DistanceKm, x.AveragePaceSecondsPerKm, x.AverageHeartRate
            }).ToList();
        });
        activities.MapGet("/{id:guid}", async Task<IResult> (Guid id, CosmosRecordStore store, CancellationToken ct) =>
        {
            var activity = await store.ReadActivityAsync(id, ct);
            if (activity is not null)
            {
                if (activity.Running is { } running) running.Laps = running.Laps.OrderBy(x => x.LapNumber).ToList();
                activity.Exercises = activity.Exercises.OrderBy(x => x.Order).ToList();
                foreach (var exercise in activity.Exercises) exercise.Sets = exercise.Sets.OrderBy(x => x.SetNumber).ToList();
            }
            return activity is null ? Results.NotFound() : Results.Ok(activity);
        });
        activities.MapPost("/", async Task<IResult> (CreateActivityRequest request, CosmosRecordStore store, CancellationToken ct) =>
        {
            var errors = RequestValidation.Validate(request);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var activity = new Activity
            {
                Date = request.Date, Type = request.Type, ActivitySubtype = request.ActivitySubtype?.Trim(),
                DurationSeconds = request.DurationSeconds, Notes = request.Notes, Mood = request.Mood,
                Energy = request.Energy, Rpe = request.Rpe, SubjectiveNotes = request.SubjectiveNotes,
                RawPayload = request.RawPayload, Running = request.Running, Walking = request.Walking,
                Exercises = (request.Exercises ?? []).Select(e => new StrengthExercise
                {
                    ExerciseName = e.ExerciseName.Trim(), Order = e.Order,
                    Sets = e.Sets.Select(s => new StrengthSet
                    {
                        SetNumber = s.SetNumber, Reps = s.Reps, WeightKg = s.WeightKg,
                        DurationSeconds = s.DurationSeconds, Side = s.Side
                    }).ToList()
                }).ToList()
            };
            // EF used to fill these foreign-key values. Preserve the response
            // and identity semantics even though Cosmos stores one aggregate.
            foreach (var exercise in activity.Exercises)
            {
                exercise.ActivityId = activity.Id;
                foreach (var set in exercise.Sets) set.StrengthExerciseId = exercise.Id;
            }
            if (activity.Running is { } running)
            {
                running.ActivityId = activity.Id;
                running.TotalDurationSeconds = activity.DurationSeconds;
                foreach (var lap in running.Laps) lap.ActivityId = activity.Id;
            }
            if (activity.Walking is { } walking)
            {
                walking.ActivityId = activity.Id;
                walking.TotalDurationSeconds = activity.DurationSeconds;
            }
            await store.CreateActivityAsync(activity, ct);
            return Results.Created($"/api/activities/{activity.Id}", activity);
        });
        activities.MapDelete("/{id:guid}", async Task<IResult> (Guid id, CosmosRecordStore store, CancellationToken ct) =>
            await store.DeleteActivityAsync(id, ct) ? Results.NoContent() : Results.NotFound());
        app.MapGet("/api/dashboard", async Task<IResult> (string? from, string? to, CosmosDashboardService service, CancellationToken ct) =>
        {
            if (from is null && to is null) return Results.Ok(await service.GetAsync(ct));
            if (!DateOnly.TryParseExact(from, "yyyy-MM-dd", out var start) ||
                !DateOnly.TryParseExact(to, "yyyy-MM-dd", out var end) || start > end)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["range"] = ["Indica desde y hasta como fechas AAAA-MM-DD válidas, con desde ≤ hasta."] });
            if (end > service.Today)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["to"] = ["El período no puede incluir fechas futuras en America/Santiago."] });
            return Results.Ok(await service.GetRangeAsync(start, end, ct));
        }).WithTags("Dashboard").RequireAuthorization();
        var body = app.MapGroup("/api/body-measurements").WithTags("Body").RequireAuthorization();
        body.MapGet("/", async (CosmosRecordStore store, CancellationToken ct) =>
            (await store.ListBodyAsync(ct)).OrderByDescending(x => x.Date).ThenBy(x => x.Id, SqlGuidComparer.Instance).ToList());
        body.MapPost("/", async Task<IResult> (CreateBodyRequest request, CosmosRecordStore store, CancellationToken ct) =>
        {
            var errors = RequestValidation.Validate(request);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var measurement = new BodyMeasurement { Date = request.Date, WeightKg = request.WeightKg, BodyFatPercentage = request.BodyFatPercentage, Notes = request.Notes };
            await store.CreateBodyAsync(measurement, ct);
            return Results.Created("/api/body-measurements", measurement);
        });
    }

    public sealed class ActivityListRow
    {
        public Guid Id { get; set; }
        public DateOnly Date { get; set; }
        public DateTime CreatedAt { get; set; }
        public ActivityType Type { get; set; }
        public string? ActivitySubtype { get; set; }
        public int DurationSeconds { get; set; }
        public string? Notes { get; set; }
        public int? Mood { get; set; }
        public int? Energy { get; set; }
        public int? Rpe { get; set; }
        public double? DistanceKm { get; set; }
        public double? AveragePaceSecondsPerKm { get; set; }
        public int? AverageHeartRate { get; set; }
    }
}
