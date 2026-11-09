using Progress.Api.Models;
using Progress.Api.Persistence;

namespace Progress.Api.Services;

public sealed class CosmosDashboardService(CosmosRecordStore store, IConfiguration configuration, TimeProvider clock)
{
    public DateOnly Today => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(),
        TimeZoneInfo.FindSystemTimeZoneById(configuration["Dashboard:TimeZone"] ?? "America/Santiago")).DateTime);

    // Only small daily aggregates leave Cosmos. The payload, laps and sets never
    // participate in this query or the summary projection below.
    private const string DailySql = """
        SELECT c.date,
          COUNT(1) AS sessions,
          SUM(IIF(c.type = "Running" AND IS_NUMBER(c.running.distanceKm), c.running.distanceKm, 0)) AS distance,
          SUM(IIF(c.type = "Running" AND c.running.distanceKm > 0 AND c.running.averagePaceSecondsPerKm > 0, c.running.distanceKm, 0)) AS paceDistance,
          SUM(IIF(c.type = "Running" AND c.running.distanceKm > 0 AND c.running.averagePaceSecondsPerKm > 0, c.running.distanceKm * c.running.averagePaceSecondsPerKm, 0)) AS paceTotal,
          SUM(IIF(c.type = "Running" AND c.running.averageHeartRate > 0, c.running.averageHeartRate, 0)) AS heartTotal,
          SUM(IIF(c.type = "Running" AND c.running.averageHeartRate > 0, 1, 0)) AS heartCount
        FROM c WHERE c.documentType = "activity" AND c.date >= @from AND c.date <= @to
        GROUP BY c.date
        """;

    private const string SummaryProjection = """
        c.id, c.date, c.createdAt, c.type, c.activitySubtype, c.durationSeconds,
        IIF(c.type = "Walking", IIF(IS_NUMBER(c.walking.distanceKm), c.walking.distanceKm, null), IIF(IS_NUMBER(c.running.distanceKm), c.running.distanceKm, null)) AS distanceKm,
        IIF(c.type = "Walking", IIF(IS_NUMBER(c.walking.averagePaceSecondsPerKm), c.walking.averagePaceSecondsPerKm, null), IIF(IS_NUMBER(c.running.averagePaceSecondsPerKm), c.running.averagePaceSecondsPerKm, null)) AS averagePaceSecondsPerKm,
        IIF(c.type = "Walking", IIF(IS_NUMBER(c.walking.averageHeartRate), c.walking.averageHeartRate, null), IIF(IS_NUMBER(c.running.averageHeartRate), c.running.averageHeartRate, null)) AS averageHeartRate
        """;

    private const string DescendingOrder = " ORDER BY c.date DESC, c.createdAt DESC, c.id DESC";

    public async Task<object> GetRangeAsync(DateOnly from, DateOnly to, CancellationToken ct)
    {
        var today = Today;
        if (from > to || to > today) throw new ArgumentException("Invalid dashboard range.");
        var parameters = new Dictionary<string, object?> { ["from"] = DateText(from), ["to"] = DateText(to) };
        var days = await store.QueryAsync<DailyRow>(DailySql, parameters, ct);
        var daily = to.DayNumber - from.DayNumber < 31;
        var first = daily ? from : from.AddDays(-(((int)from.DayOfWeek + 6) % 7));
        var step = daily ? 1 : 7;
        var groups = days.GroupBy(x => (x.Date.DayNumber - first.DayNumber) / step).ToDictionary(x => x.Key, x => x.ToList());
        var series = Enumerable.Range(0, (to.DayNumber - first.DayNumber) / step + 1).Select(i =>
        {
            var bucket = groups.GetValueOrDefault(i) ?? [];
            var paceDistance = bucket.Sum(x => x.PaceDistance);
            var start = first.AddDays(i * step);
            return new
            {
                date = start < from ? from : start,
                endDate = DateOnly.FromDayNumber(Math.Min(start.DayNumber + step - 1, to.DayNumber)),
                sessions = bucket.Sum(x => x.Sessions), distanceKm = bucket.Sum(x => x.Distance),
                paceSecondsPerKm = paceDistance == 0 ? (double?)null : bucket.Sum(x => x.PaceTotal) / paceDistance
            };
        }).ToList();
        var distance = days.Sum(x => x.PaceDistance);
        var heartCount = days.Sum(x => x.HeartCount);
        return new
        {
            asOf = today, from, to, granularity = daily ? "day" : "week",
            sessions = days.Sum(x => x.Sessions), distanceKm = days.Sum(x => x.Distance),
            paceSecondsPerKm = distance == 0 ? (double?)null : days.Sum(x => x.PaceTotal) / distance,
            averageHeartRate = heartCount == 0 ? (double?)null : days.Sum(x => x.HeartTotal) / heartCount,
            series,
            latestActivity = await LatestAsync(today, ct),
            activities = (await RecentAsync(parameters, ct)).Select(x => new
            {
                x.Id, x.Date, x.Type, x.ActivitySubtype, x.DurationSeconds,
                x.DistanceKm, x.AveragePaceSecondsPerKm, x.AverageHeartRate
            }).ToList()
        };
    }

    public async Task<object> GetAsync(CancellationToken ct)
    {
        var today = Today;
        var monday = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
        var firstWeek = monday.AddDays(-7 * 11);
        var recentStart = today.AddDays(-29);
        var history = await store.QueryAsync<HistoryRow>("""
            SELECT c.date, c.type, c.createdAt, c.id,
              IIF(IS_NUMBER(c.running.distanceKm), c.running.distanceKm, null) AS distanceKm,
              IIF(IS_NUMBER(c.running.averagePaceSecondsPerKm), c.running.averagePaceSecondsPerKm, null) AS averagePaceSecondsPerKm,
              IIF(IS_NUMBER(c.running.averageHeartRate), c.running.averageHeartRate, null) AS averageHeartRate
            FROM c WHERE c.documentType = "activity" AND c.date >= @from AND c.date <= @to
            """, new Dictionary<string, object?> { ["from"] = DateText(firstWeek), ["to"] = DateText(today) }, ct);
        history = history.OrderBy(x => x.Date).ThenBy(x => x.CreatedAt).ThenBy(x => x.Id, SqlGuidComparer.Instance).ToList();
        var runs = history.Where(x => x.Type == ActivityType.Running).ToList();
        var recent = runs.Where(x => x.Date >= recentStart).ToList();
        var paceRuns = recent.Where(x => x.DistanceKm > 0 && x.AveragePaceSecondsPerKm > 0).ToList();
        var heartRuns = recent.Where(x => x.AverageHeartRate > 0).ToList();
        var counts = await store.QueryAsync<int>("SELECT VALUE COUNT(1) FROM c WHERE c.documentType = \"activity\" AND c.date <= @to",
            new Dictionary<string, object?> { ["to"] = DateText(today) }, ct);
        return new
        {
            asOf = today,
            weekStartsOn = monday,
            totalActivities = counts.Single(),
            activitiesThisWeek = history.Count(x => x.Date >= monday),
            distanceThisWeekKm = runs.Where(x => x.Date >= monday).Sum(x => x.DistanceKm ?? 0),
            distanceLast30DaysKm = recent.Sum(x => x.DistanceKm ?? 0),
            recentPaceSecondsPerKm = paceRuns.Count == 0 ? (double?)null : paceRuns.Sum(x => x.AveragePaceSecondsPerKm!.Value * x.DistanceKm!.Value) / paceRuns.Sum(x => x.DistanceKm!.Value),
            recentAverageHeartRate = heartRuns.Count == 0 ? (double?)null : heartRuns.Average(x => x.AverageHeartRate!.Value),
            latestActivity = await LatestAsync(today, ct),
            weeklyDistance = Enumerable.Range(0, 12).Select(i =>
            {
                var start = firstWeek.AddDays(i * 7);
                return new { week = start, distanceKm = runs.Where(x => x.Date >= start && x.Date < start.AddDays(7)).Sum(x => x.DistanceKm ?? 0) };
            }),
            paceHistory = runs.Where(x => x.AveragePaceSecondsPerKm > 0).Select(x => new { x.Date, paceSecondsPerKm = x.AveragePaceSecondsPerKm })
        };
    }

    private async Task<List<ActivitySummary>> RecentAsync(Dictionary<string, object?> parameters, CancellationToken ct)
    {
        var rows = await store.QueryAsync<ActivitySummary>(
            $"SELECT TOP 5 {SummaryProjection} FROM c WHERE c.documentType = \"activity\" AND c.date >= @from AND c.date <= @to{DescendingOrder}", parameters, ct);
        if (rows.Count == 0) return rows;
        // Cosmos orders GUID text lexically; SQL Server orders uniqueidentifiers
        // in a different byte order. Fetch the boundary tie only, then keep the
        // previous SQL tie behavior without downloading the full interval.
        var boundary = rows[^1];
        var ties = await store.QueryAsync<ActivitySummary>(
            $"SELECT {SummaryProjection} FROM c WHERE c.documentType = \"activity\" AND c.date = @date AND c.createdAt = @createdAt",
            new Dictionary<string, object?> { ["date"] = DateText(boundary.Date), ["createdAt"] = boundary.CreatedAt }, ct);
        return rows.Concat(ties).DistinctBy(x => x.Id).OrderByDescending(x => x.Date)
            .ThenByDescending(x => x.CreatedAt, StringComparer.Ordinal).ThenByDescending(x => x.Id, SqlGuidComparer.Instance).Take(5).ToList();
    }

    private async Task<object?> LatestAsync(DateOnly today, CancellationToken ct)
    {
        var rows = await store.QueryAsync<LatestActivity>("""
            SELECT TOP 1 c.id, c.date, c.createdAt, c.type, c.activitySubtype, c.durationSeconds, c.notes,
              IIF(IS_OBJECT(c.running), {"distanceKm": c.running.distanceKm, "averagePaceSecondsPerKm": c.running.averagePaceSecondsPerKm}, null) AS running,
              IIF(IS_OBJECT(c.walking), {"distanceKm": c.walking.distanceKm, "averagePaceSecondsPerKm": c.walking.averagePaceSecondsPerKm}, null) AS walking
            FROM c WHERE c.documentType = "activity" AND c.date <= @to
            ORDER BY c.date DESC, c.createdAt DESC, c.id DESC
            """, new Dictionary<string, object?> { ["to"] = DateText(today) }, ct);
        var first = rows.SingleOrDefault();
        if (first is null) return null;
        var ties = await store.QueryAsync<LatestActivity>("""
            SELECT c.id, c.date, c.createdAt, c.type, c.activitySubtype, c.durationSeconds, c.notes,
              IIF(IS_OBJECT(c.running), {"distanceKm": c.running.distanceKm, "averagePaceSecondsPerKm": c.running.averagePaceSecondsPerKm}, null) AS running,
              IIF(IS_OBJECT(c.walking), {"distanceKm": c.walking.distanceKm, "averagePaceSecondsPerKm": c.walking.averagePaceSecondsPerKm}, null) AS walking
            FROM c WHERE c.documentType = "activity" AND c.date = @date AND c.createdAt = @createdAt
            """, new Dictionary<string, object?> { ["date"] = DateText(first.Date), ["createdAt"] = first.CreatedAt }, ct);
        var latest = rows.Concat(ties).OrderByDescending(x => x.Id, SqlGuidComparer.Instance).First();
        return new { latest.Id, latest.Date, latest.Type, latest.ActivitySubtype, latest.DurationSeconds, latest.Notes, latest.Running, latest.Walking };
    }

    public static string DateText(DateOnly date) => date.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);

    public sealed class DailyRow
    {
        public DateOnly Date { get; set; }
        public int Sessions { get; set; }
        public double Distance { get; set; }
        public double PaceDistance { get; set; }
        public double PaceTotal { get; set; }
        public double HeartTotal { get; set; }
        public int HeartCount { get; set; }
    }

    public sealed class HistoryRow
    {
        public Guid Id { get; set; }
        public DateOnly Date { get; set; }
        public DateTime CreatedAt { get; set; }
        public ActivityType Type { get; set; }
        public double? DistanceKm { get; set; }
        public double? AveragePaceSecondsPerKm { get; set; }
        public int? AverageHeartRate { get; set; }
    }

    public sealed class ActivitySummary
    {
        public Guid Id { get; set; }
        public DateOnly Date { get; set; }
        public string CreatedAt { get; set; } = "";
        public ActivityType Type { get; set; }
        public string? ActivitySubtype { get; set; }
        public int DurationSeconds { get; set; }
        public double? DistanceKm { get; set; }
        public double? AveragePaceSecondsPerKm { get; set; }
        public int? AverageHeartRate { get; set; }
    }

    public sealed class LatestActivity
    {
        public Guid Id { get; set; }
        public DateOnly Date { get; set; }
        public string CreatedAt { get; set; } = "";
        public ActivityType Type { get; set; }
        public string? ActivitySubtype { get; set; }
        public int DurationSeconds { get; set; }
        public string? Notes { get; set; }
        public DistanceAndPace? Running { get; set; }
        public DistanceAndPace? Walking { get; set; }
    }

    public sealed class DistanceAndPace
    {
        public double? DistanceKm { get; set; }
        public double? AveragePaceSecondsPerKm { get; set; }
    }
}

// SQL Server orders uniqueidentifier values differently from textual UUIDs. Keep
// its tie order for migrated records when sorting projected metadata in .NET.
internal sealed class SqlGuidComparer : IComparer<Guid>
{
    public static readonly SqlGuidComparer Instance = new();
    public int Compare(Guid x, Guid y) => new System.Data.SqlTypes.SqlGuid(x).CompareTo(new System.Data.SqlTypes.SqlGuid(y));
}
