using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Data.SqlClient;
using Progress.Api.Data;
using Progress.Api.Models;
using Progress.Api.Services;

var connection = Environment.GetEnvironmentVariable("REVIEW_TEST_CONNECTION") ?? throw new Exception("Missing isolated test connection");
var connectionInfo = new SqlConnectionStringBuilder(connection);
if (connectionInfo.InitialCatalog is not { } name || !System.Text.RegularExpressions.Regex.IsMatch(name, @"^progress_test_\d+_demo$"))
    throw new Exception("Review checks require their own disposable database");
var options = new DbContextOptionsBuilder<ProgressDbContext>().UseSqlServer(connection).Options;
ProgressDbContext Open() => new(options);
void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
await using var db = Open();

// Upgrade an existing installation without rewriting its original migration or data.
await db.GetService<IMigrator>().MigrateAsync("20260926163609_InitialSqlServer");
var legacy = new Activity { Date = new(2026, 9, 20), Type = ActivityType.Running, DurationSeconds = 600,
    Running = new() { DistanceKm = 1, TotalDurationSeconds = 600 }, Notes = "Legacy fixture: preserve" };
// Insert through the OLD schema before applying AddOtherActivity. The current
// EF model already includes the new column and must not be used for this insert.
await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO Activities (Id, Date, Type, DurationSeconds, Notes, CreatedAt, UpdatedAt) VALUES ({legacy.Id}, {legacy.Date}, 'Running', 600, {legacy.Notes}, {legacy.CreatedAt}, {legacy.UpdatedAt})");
await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO RunningDetails (ActivityId, DistanceKm, TotalDurationSeconds) VALUES ({legacy.Id}, 1, 600)");
var legacyWalkId = Guid.NewGuid();
await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO Activities (Id, Date, Type, DurationSeconds, Notes, RawPayload, CreatedAt, UpdatedAt) VALUES ({legacyWalkId}, {legacy.Date}, 'Walking', 911, 'Legacy walk', '{{\"unmapped\":42}}', {legacy.CreatedAt}, {legacy.UpdatedAt})");
await db.Database.MigrateAsync();
Check(await db.Activities.AnyAsync(a => a.Id == legacy.Id && a.Notes == "Legacy fixture: preserve"), "Upgrade preserves existing data");
Check(await db.Activities.AnyAsync(a => a.Id == legacy.Id && a.ActivitySubtype == null && a.Running!.DistanceKm == 1), "Upgrade preserves running relationship and leaves subtype null");
var legacyWalk = await db.Activities.Include(x => x.Walking).SingleAsync(x => x.Id == legacyWalkId);
Check(legacyWalk.Walking == null && legacyWalk.DurationSeconds == 911 && legacyWalk.Notes == "Legacy walk" && legacyWalk.RawPayload!.RootElement.GetProperty("unmapped").GetInt32() == 42, "Both new migrations preserve legacy walking and opaque payload without backfill");
await DemoSeed.RunAsync(db);
Check(await db.Set<SeedHistory>().AnyAsync(), "Existing data permanently closes the seed gate during upgrade");
await db.Activities.ExecuteDeleteAsync();
await DemoSeed.RunAsync(db);
Check(!await db.Activities.AnyAsync(), "Deleting legacy data must not re-enable demo seed");
Console.WriteLine("PASS upgrade preserves data and blocks legacy reseeding");

// Reset ONLY the marker in this disposable test fixture to exercise first seed.
await db.Set<SeedHistory>().ExecuteDeleteAsync();
db.ChangeTracker.Clear();
async Task Seed() { await using var context = Open(); await DemoSeed.RunAsync(context); }
await Task.WhenAll(Seed(), Seed());
Check(await db.Activities.CountAsync() == 36 && await db.BodyMeasurements.CountAsync() == 12, "Concurrent seed runs exactly once");
Check(await db.Set<SeedHistory>().CountAsync() == 1, "One persistent seed marker");
await db.Activities.ExecuteDeleteAsync();
await db.BodyMeasurements.ExecuteDeleteAsync();
await Seed();
Check(!await db.Activities.AnyAsync() && !await db.BodyMeasurements.AnyAsync(), "Deleting every record must not re-enable demo seed");
var notDemo = new DbContextOptionsBuilder<ProgressDbContext>().UseSqlServer("Server=localhost;Database=progress;User ID=sa").Options;
await using (var other = new ProgressDbContext(notDemo))
{
    try { await DemoSeed.RunAsync(other); throw new Exception("Seed accepted non-demo database"); }
    catch (InvalidOperationException ex) when (ex.Message.Contains("_demo")) { }
}
Console.WriteLine("PASS seed isolation, concurrency and persistent one-time guard");

Activity Run(DateOnly date, double? distance, double? pace, int? hr = null) => new() {
    Date = date, Type = ActivityType.Running, DurationSeconds = 1200,
    Running = new() { DistanceKm = distance, AveragePaceSecondsPerKm = pace, AverageHeartRate = hr, TotalDurationSeconds = 1200 }
};
var monday = new DateOnly(2026, 9, 21);
var tracked = Run(monday, 1, 600, 140);
db.AddRange(tracked, Run(monday.AddDays(6), 3, 480, 160), Run(monday.AddDays(-1), 2, null),
    Run(monday.AddDays(7), 100, 300), // future on Sunday, included only on next Monday
    Run(new(2026, 8, 29), 4, null), // inclusive 30-day boundary on September 27
    Run(new(2026, 8, 28), 50, 900), // outside that window
    Run(monday.AddDays(1), null, 420), Run(monday.AddDays(2), 0, 400));
db.BodyMeasurements.Add(new() { Date = monday, WeightKg = 75 });
await db.SaveChangesAsync();
var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Dashboard:TimeZone"] = "America/Santiago" }).Build();
async Task<JsonElement> Dashboard(string utc) => JsonSerializer.SerializeToElement(await new DashboardService(db, configuration, new FixedClock(DateTimeOffset.Parse(utc))).GetAsync(default));
var sunday = await Dashboard("2026-09-28T02:59:59Z"); // Sunday 23:59:59 in Santiago
Check(sunday.GetProperty("asOf").GetString() == "2026-09-27", "Use Santiago date, not UTC date");
Check(sunday.GetProperty("weekStartsOn").GetString() == "2026-09-21", "Sunday belongs to previous Monday");
Check(sunday.GetProperty("distanceThisWeekKm").GetDouble() == 4, "Monday through Sunday distance");
Check(sunday.GetProperty("distanceLast30DaysKm").GetDouble() == 10, "Inclusive 30-day boundary");
Check(sunday.GetProperty("recentPaceSecondsPerKm").GetDouble() == 510, "Distance-weighted pace excludes null/zero distances");
Check(sunday.GetProperty("recentAverageHeartRate").GetDouble() == 150, "HR skips missing values");
Check(sunday.GetProperty("activitiesThisWeek").GetInt32() == 4, "Count sessions even with missing distance");
var nextMonday = await Dashboard("2026-09-28T03:00:00Z");
Check(nextMonday.GetProperty("weekStartsOn").GetString() == "2026-09-28" && nextMonday.GetProperty("distanceThisWeekKm").GetDouble() == 100, "Monday resets week precisely at local midnight");
foreach (var (utc, expected) in new[] {
    ("2026-09-06T03:59:59Z", "2026-09-05"), ("2026-09-06T04:00:00Z", "2026-09-06"), // Spring clock change
    ("2026-04-05T02:59:59Z", "2026-04-04"), ("2026-04-05T03:00:00Z", "2026-04-04"),
    ("2026-04-05T04:00:00Z", "2026-04-05") })
    Check((await Dashboard(utc)).GetProperty("asOf").GetString() == expected, "Santiago DST boundary: " + utc);
Console.WriteLine("PASS controlled clock: Monday/Sunday, 30 days, nulls, weighted pace, UTC midnight and Santiago DST");

var rangeService = new DashboardService(db, configuration, new FixedClock(DateTimeOffset.Parse("2026-09-28T02:59:59Z")));
async Task<JsonElement> Period(DateOnly from, DateOnly to) => JsonSerializer.SerializeToElement(await rangeService.GetRangeAsync(from, to, default));
var week = await Period(monday, monday.AddDays(6));
Check(week.GetProperty("sessions").GetInt32() == 4 && week.GetProperty("distanceKm").GetDouble() == 4, "Explicit Monday-Sunday range");
Check(week.GetProperty("paceSecondsPerKm").GetDouble() == 510 && week.GetProperty("averageHeartRate").GetDouble() == 150, "Range weighted pace and null-aware HR");
Check(week.GetProperty("series").GetArrayLength() == 7, "Week includes empty days");
var month = await Period(new(2026, 9, 1), new(2026, 9, 27));
Check(month.GetProperty("distanceKm").GetDouble() == 6, "Calendar month excludes August, unlike rolling 30 days");
Check(month.GetProperty("series").GetArrayLength() == 27, "Month uses daily buckets");
var custom = await Period(new(2026, 8, 29), new(2026, 9, 21));
Check(custom.GetProperty("distanceKm").GetDouble() == 7 && custom.GetProperty("sessions").GetInt32() == 3, "Both custom boundaries are inclusive");
var longRange = await Period(new(2026, 8, 28), new(2026, 9, 27));
Check(longRange.GetProperty("granularity").GetString() == "day", "31 inclusive days remain daily");
longRange = await Period(new(2026, 8, 27), new(2026, 9, 27));
Check(longRange.GetProperty("granularity").GetString() == "week", "32 inclusive days use weeks");
Check(longRange.GetProperty("series")[0].GetProperty("date").GetString() == "2026-08-27", "Partial first week is clipped");
Check(longRange.GetProperty("series").EnumerateArray().Sum(x => x.GetProperty("distanceKm").GetDouble()) == 60, "Weekly aggregation conserves distance");
var lastBucket = longRange.GetProperty("series").EnumerateArray().Last();
Check(lastBucket.GetProperty("paceSecondsPerKm").GetDouble() == 510, "Weekly pace remains distance weighted");
var emptyRange = await Period(new(2020, 1, 1), new(2020, 1, 2));
Check(emptyRange.GetProperty("sessions").GetInt32() == 0 && emptyRange.GetProperty("paceSecondsPerKm").ValueKind == JsonValueKind.Null, "Empty period has zero totals and unknown pace");
Check(emptyRange.GetProperty("latestActivity").GetProperty("Date").GetString() == "2026-09-27", "Historical range retains global latest excluding future");
db.Add(new Activity { Date = monday, Type = ActivityType.Other, ActivitySubtype = "Football", DurationSeconds = 3600 });
await db.SaveChangesAsync();
week = await Period(monday, monday.AddDays(6));
Check(week.GetProperty("sessions").GetInt32() == 5 && week.GetProperty("distanceKm").GetDouble() == 4 &&
    week.GetProperty("paceSecondsPerKm").GetDouble() == 510 && week.GetProperty("averageHeartRate").GetDouble() == 150, "Other adds sessions only");
var mondayService = new DashboardService(db, configuration, new FixedClock(DateTimeOffset.Parse("2026-09-28T03:00:00Z")));
var mondayRange = JsonSerializer.SerializeToElement(await mondayService.GetRangeAsync(monday.AddDays(7), monday.AddDays(7), default));
Check(mondayRange.GetProperty("distanceKm").GetDouble() == 100, "Range follows Santiago midnight");
Console.WriteLine("PASS deterministic week, calendar month, inclusive custom range, daily/weekly boundaries, weighted buckets, global latest and Other isolation");

async Task RejectSql(string sql)
{
    try { await db.Database.ExecuteSqlRawAsync(sql); throw new Exception("Database accepted invalid data: " + sql); }
    catch (SqlException ex) when (ex.Number is 547 or 8114 or 245) { }
}
foreach (var change in new[] { "\"DurationSeconds\" = -1", "\"Mood\" = 0", "\"Type\" = 'Unknown'", "\"ActivitySubtype\" = 'Football'" })
    await RejectSql($"UPDATE \"Activities\" SET {change} WHERE \"Id\" = '{tracked.Id}'");
foreach (var change in new[] { "\"DistanceKm\" = -1", "\"DistanceKm\" = 'NaN'", "\"DistanceKm\" = 'Infinity'",
    "\"AverageHeartRate\" = 0", "\"AverageHeartRate\" = 180, \"MaxHeartRate\" = 140",
    "\"AverageCadence\" = 160, \"MaxCadence\" = 100", "\"AveragePowerWatts\" = 350, \"MaxPowerWatts\" = 200",
    "\"MinElevationMeters\" = 'NaN'", "\"MinElevationMeters\" = 100, \"MaxElevationMeters\" = 0",
    "\"RunningDurationSeconds\" = 900, \"WalkingDurationSeconds\" = 900" })
    await RejectSql($"UPDATE \"RunningDetails\" SET {change} WHERE \"ActivityId\" = '{tracked.Id}'");
await RejectSql("UPDATE \"BodyMeasurements\" SET \"WeightKg\" = 'NaN'");
await RejectSql("UPDATE \"BodyMeasurements\" SET \"BodyFatPercentage\" = 101");
await db.Database.ExecuteSqlAsync($"UPDATE \"RunningDetails\" SET \"MinElevationMeters\" = -200, \"MaxElevationMeters\" = -100 WHERE \"ActivityId\" = {tracked.Id}");
await RejectSql($"UPDATE [Activities] SET [RawPayload] = N'not json' WHERE [Id] = '{tracked.Id}'");
await RejectSql($"UPDATE [Activities] SET [Type] = 'running' WHERE [Id] = '{tracked.Id}'");
var reread = await db.Activities.AsNoTracking().SingleAsync(a => a.Id == tracked.Id);
Check(reread.CreatedAt.Kind == DateTimeKind.Utc && reread.CreatedAt == tracked.CreatedAt, "UTC timestamp retains ticks and UTC Kind");
Check(reread.Date == tracked.Date, "DateOnly round trip");
Console.WriteLine("PASS SQL Server constraints reject negative/nonfinite/inconsistent values; negative altitude is valid");

sealed class FixedClock(DateTimeOffset now) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => now;
}
