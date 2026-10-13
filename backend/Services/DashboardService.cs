using Microsoft.EntityFrameworkCore;
using Progress.Api.Data;
using Progress.Api.Models;
namespace Progress.Api.Services;

public class DashboardService(ProgressDbContext db, IConfiguration configuration, TimeProvider clock)
{
    public DateOnly Today => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(),
        TimeZoneInfo.FindSystemTimeZoneById(configuration["Dashboard:TimeZone"] ?? "America/Santiago")).DateTime);

    public async Task<object> GetRangeAsync(DateOnly from, DateOnly to, CancellationToken ct)
    {
        var today = Today;
        if (from > to || to > today) throw new ArgumentException("Invalid dashboard range.");
        // Aggregate daily in SQL: no payloads, laps, sets or full history cross the wire.
        var days = await db.Activities.AsNoTracking().Where(x => x.Date >= from && x.Date <= to)
            .GroupBy(x => x.Date).Select(g => new {
                Date = g.Key, Sessions = g.Count(),
                Distance = g.Sum(x => x.Type == ActivityType.Running && x.Running != null ? x.Running.DistanceKm ?? 0 : 0),
                PaceDistance = g.Sum(x => x.Type == ActivityType.Running && x.Running != null && x.Running.DistanceKm > 0 && x.Running.AveragePaceSecondsPerKm > 0 ? x.Running.DistanceKm!.Value : 0),
                PaceTotal = g.Sum(x => x.Type == ActivityType.Running && x.Running != null && x.Running.DistanceKm > 0 && x.Running.AveragePaceSecondsPerKm > 0 ? x.Running.DistanceKm!.Value * x.Running.AveragePaceSecondsPerKm!.Value : 0),
                HeartTotal = g.Sum(x => x.Type == ActivityType.Running && x.Running != null && x.Running.AverageHeartRate > 0 ? (double)x.Running.AverageHeartRate.Value : 0),
                HeartCount = g.Count(x => x.Type == ActivityType.Running && x.Running != null && x.Running.AverageHeartRate > 0)
            }).ToListAsync(ct);
        var daily = to.DayNumber - from.DayNumber < 31;
        // Weekly buckets start Monday; first/last can be partial and remain clipped to the request.
        var first = daily ? from : from.AddDays(-(((int)from.DayOfWeek + 6) % 7));
        var step = daily ? 1 : 7;
        var groups = days.GroupBy(x => (x.Date.DayNumber - first.DayNumber) / step).ToDictionary(x => x.Key, x => x.ToList());
        var series = Enumerable.Range(0, (to.DayNumber - first.DayNumber) / step + 1).Select(i => {
            var bucket = groups.GetValueOrDefault(i) ?? [];
            var paceDistance = bucket.Sum(x => x.PaceDistance);
            var start = first.AddDays(i * step);
            return new { date = start < from ? from : start,
                endDate = DateOnly.FromDayNumber(Math.Min(start.DayNumber + step - 1, to.DayNumber)),
                sessions = bucket.Sum(x => x.Sessions), distanceKm = bucket.Sum(x => x.Distance),
                paceSecondsPerKm = paceDistance == 0 ? (double?)null : bucket.Sum(x => x.PaceTotal) / paceDistance };
        }).ToList();
        var distance = days.Sum(x => x.PaceDistance);
        var heartCount = days.Sum(x => x.HeartCount);
        return new {
            asOf = today, from, to, granularity = daily ? "day" : "week",
            sessions = days.Sum(x => x.Sessions), distanceKm = days.Sum(x => x.Distance),
            paceSecondsPerKm = distance == 0 ? (double?)null : days.Sum(x => x.PaceTotal) / distance,
            averageHeartRate = heartCount == 0 ? (double?)null : days.Sum(x => x.HeartTotal) / heartCount,
            series,
            latestActivity = await LatestAsync(today, ct),
            activities = await db.Activities.AsNoTracking().Where(x => x.Date >= from && x.Date <= to)
                .OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
                .Take(5).Select(x => new { x.Id, x.Date, x.Type, x.ActivitySubtype, x.DurationSeconds,
                    DistanceKm = x.Type == ActivityType.Walking ? (x.Walking == null ? null : x.Walking.DistanceKm) : (x.Running == null ? null : x.Running.DistanceKm),
                    AveragePaceSecondsPerKm = x.Type == ActivityType.Walking ? (x.Walking == null ? null : x.Walking.AveragePaceSecondsPerKm) : (x.Running == null ? null : x.Running.AveragePaceSecondsPerKm),
                    AverageHeartRate = x.Type == ActivityType.Walking ? (x.Walking == null ? null : x.Walking.AverageHeartRate) : (x.Running == null ? null : x.Running.AverageHeartRate) }).ToListAsync(ct)
        };
    }

    private async Task<object?> LatestAsync(DateOnly today, CancellationToken ct) =>
        await db.Activities.AsNoTracking().Where(x => x.Date <= today)
            .OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
            .Select(x => new { x.Id, x.Date, x.Type, x.ActivitySubtype, x.DurationSeconds, x.Notes,
                Running = x.Running == null ? null : new { x.Running.DistanceKm, x.Running.AveragePaceSecondsPerKm },
                Walking = x.Walking == null ? null : new { x.Walking.DistanceKm, x.Walking.AveragePaceSecondsPerKm } }).FirstOrDefaultAsync(ct);

    public async Task<object> GetAsync(CancellationToken ct)
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById(configuration["Dashboard:TimeZone"] ?? "America/Santiago");
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), zone).DateTime);
        var monday = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
        var firstWeek = monday.AddDays(-7 * 11);
        var recentStart = today.AddDays(-29);
        var history = await db.Activities.AsNoTracking()
            .Where(x => x.Date >= firstWeek && x.Date <= today).OrderBy(x => x.Date).ThenBy(x => x.CreatedAt).ThenBy(x => x.Id)
            .Select(x => new {
                x.Date, x.Type,
                DistanceKm = x.Running == null ? null : x.Running.DistanceKm,
                AveragePaceSecondsPerKm = x.Running == null ? null : x.Running.AveragePaceSecondsPerKm,
                AverageHeartRate = x.Running == null ? null : x.Running.AverageHeartRate
            }).ToListAsync(ct);
        var runs = history.Where(x => x.Type == ActivityType.Running).ToList();
        var recent = runs.Where(x => x.Date >= recentStart).ToList();
        var paceRuns = recent.Where(x => x.DistanceKm > 0 && x.AveragePaceSecondsPerKm > 0).ToList();
        var heartRuns = recent.Where(x => x.AverageHeartRate > 0).ToList();
        return new
        {
            asOf = today,
            weekStartsOn = monday,
            totalActivities = await db.Activities.CountAsync(x => x.Date <= today, ct),
            activitiesThisWeek = history.Count(x => x.Date >= monday),
            distanceThisWeekKm = runs.Where(x => x.Date >= monday).Sum(x => x.DistanceKm ?? 0),
            distanceLast30DaysKm = recent.Sum(x => x.DistanceKm ?? 0),
            recentPaceSecondsPerKm = paceRuns.Count == 0 ? (double?)null : paceRuns.Sum(x => x.AveragePaceSecondsPerKm!.Value * x.DistanceKm!.Value) / paceRuns.Sum(x => x.DistanceKm!.Value),
            recentAverageHeartRate = heartRuns.Count == 0 ? (double?)null : heartRuns.Average(x => x.AverageHeartRate!.Value),
            latestActivity = await db.Activities.AsNoTracking().Where(x => x.Date <= today)
                .OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
                .Select(x => new {
                    x.Id, x.Date, x.Type, x.ActivitySubtype, x.DurationSeconds, x.Notes,
                    Running = x.Running == null ? null : new { x.Running.DistanceKm, x.Running.AveragePaceSecondsPerKm },
                    Walking = x.Walking == null ? null : new { x.Walking.DistanceKm, x.Walking.AveragePaceSecondsPerKm }
                }).FirstOrDefaultAsync(ct),
            weeklyDistance = Enumerable.Range(0, 12).Select(i =>
            {
                var start = firstWeek.AddDays(i * 7);
                return new { week = start, distanceKm = runs.Where(x => x.Date >= start && x.Date < start.AddDays(7)).Sum(x => x.DistanceKm ?? 0) };
            }),
            paceHistory = runs.Where(x => x.AveragePaceSecondsPerKm > 0).Select(x => new { x.Date, paceSecondsPerKm = x.AveragePaceSecondsPerKm })
        };
    }
}
