using Microsoft.EntityFrameworkCore;
using Progress.Api.Data;
using Progress.Api.DTOs;
using Progress.Api.Models;
using Progress.Api.Services;
namespace Progress.Api.Endpoints;

public static class ApiEndpoints
{
    public static void MapApi(this WebApplication app)
    {
        var strength = app.MapGroup("/api/strength").WithTags("Strength progress").RequireAuthorization();
        strength.MapGet("/exercises", async (StrengthProgressService service, CancellationToken ct) =>
            Results.Ok(await service.ListAsync(ct)));
        strength.MapGet("/progress", async Task<IResult> (string? exercise, StrengthProgressService service, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(exercise) || exercise.Trim().Length > 200)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["exercise"] = ["Selecciona un ejercicio válido (hasta 200 caracteres)."] });
            var progress = await service.GetAsync(exercise, ct);
            return progress is null ? Results.NotFound() : Results.Ok(progress);
        });
        app.MapGet("/api/database-info", async (ProgressDbContext db, CancellationToken ct) =>
        {
            var database = db.Database.GetDbConnection().Database;
            var isDemo = database.EndsWith("_demo", StringComparison.Ordinal);
            return Results.Ok(new
            {
                Database = database,
                IsDemo = isDemo,
                HasLegacySeedHistory = !isDemo && await db.Set<SeedHistory>().AnyAsync(x => x.Name == "demo-v1", ct)
            });
        }).WithTags("Local configuration").RequireAuthorization();
        var activities = app.MapGroup("/api/activities").WithTags("Activities").RequireAuthorization();
        activities.MapGet("/", async (ProgressDbContext db, CancellationToken ct) =>
            await db.Activities.AsNoTracking().OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt)
                .Select(x => new
                {
                    x.Id,
                    x.Date,
                    x.Type,
                    x.ActivitySubtype,
                    x.DurationSeconds,
                    x.Notes,
                    x.Mood,
                    x.Energy,
                    x.Rpe,
                    DistanceKm = x.Type == ActivityType.Walking ? (x.Walking == null ? null : x.Walking.DistanceKm) : (x.Running == null ? null : x.Running.DistanceKm),
                    AveragePaceSecondsPerKm = x.Type == ActivityType.Walking ? (x.Walking == null ? null : x.Walking.AveragePaceSecondsPerKm) : (x.Running == null ? null : x.Running.AveragePaceSecondsPerKm),
                    AverageHeartRate = x.Type == ActivityType.Walking ? (x.Walking == null ? null : x.Walking.AverageHeartRate) : (x.Running == null ? null : x.Running.AverageHeartRate)
                }).ToListAsync(ct));
        activities.MapGet("/{id:guid}", async Task<IResult> (Guid id, ProgressDbContext db, CancellationToken ct) =>
        {
            var activity = await db.Activities.AsNoTracking().Include(x => x.Running!).ThenInclude(x => x.Laps.OrderBy(l => l.LapNumber))
                .Include(x => x.Walking)
                .Include(x => x.Exercises.OrderBy(e => e.Order)).ThenInclude(x => x.Sets.OrderBy(s => s.SetNumber))
                .AsSplitQuery().FirstOrDefaultAsync(x => x.Id == id, ct);
            return activity is null ? Results.NotFound() : Results.Ok(activity);
        });
        activities.MapPost("/", async Task<IResult> (CreateActivityRequest request, ProgressDbContext db, CancellationToken ct) =>
        {
            var errors = RequestValidation.Validate(request);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            // JsonDocument validates JSON syntax without converting numbers. SQL stores the
            // original text and ISJSON(..., VALUE) protects direct database writes as well.
            var activity = new Activity
            {
                Date = request.Date,
                Type = request.Type,
                ActivitySubtype = request.ActivitySubtype?.Trim(),
                DurationSeconds = request.DurationSeconds,
                Notes = request.Notes,
                Mood = request.Mood,
                Energy = request.Energy,
                Rpe = request.Rpe,
                SubjectiveNotes = request.SubjectiveNotes,
                RawPayload = request.RawPayload,
                Running = request.Running,
                Walking = request.Walking,
                Exercises = (request.Exercises ?? []).Select(e => new StrengthExercise
                {
                    ExerciseName = e.ExerciseName.Trim(),
                    Order = e.Order,
                    Sets = e.Sets.Select(s => new StrengthSet { SetNumber = s.SetNumber, Reps = s.Reps, WeightKg = s.WeightKg, DurationSeconds = s.DurationSeconds, Side = s.Side }).ToList()
                }).ToList()
            };
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
            db.Activities.Add(activity);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/activities/{activity.Id}", activity);
        });
        activities.MapDelete("/{id:guid}", async Task<IResult> (Guid id, ProgressDbContext db, CancellationToken ct) =>
            await db.Activities.Where(x => x.Id == id).ExecuteDeleteAsync(ct) == 0 ? Results.NotFound() : Results.NoContent());
        app.MapGet("/api/dashboard", async Task<IResult> (string? from, string? to, DashboardService service, CancellationToken ct) =>
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
        body.MapGet("/", async (ProgressDbContext db, CancellationToken ct) => await db.BodyMeasurements.AsNoTracking().OrderByDescending(x => x.Date).ThenBy(x => x.Id).ToListAsync(ct));
        body.MapPost("/", async Task<IResult> (CreateBodyRequest request, ProgressDbContext db, CancellationToken ct) =>
        {
            var errors = RequestValidation.Validate(request);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var measurement = new BodyMeasurement { Date = request.Date, WeightKg = request.WeightKg, BodyFatPercentage = request.BodyFatPercentage, Notes = request.Notes };
            db.BodyMeasurements.Add(measurement);
            await db.SaveChangesAsync(ct);
            return Results.Created("/api/body-measurements", measurement);
        });
    }
}
