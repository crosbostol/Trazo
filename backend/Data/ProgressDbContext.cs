using System.Text.Json;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Microsoft.EntityFrameworkCore;
using Progress.Api.Models;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;

namespace Progress.Api.Data;

public class ProgressDbContext(DbContextOptions<ProgressDbContext> options) : DbContext(options), IDataProtectionKeyContext
{
    public DbSet<DataProtectionKey> DataProtectionKeys { get; set; } = null!;
    public DbSet<Activity> Activities => Set<Activity>();
    public DbSet<BodyMeasurement> BodyMeasurements => Set<BodyMeasurement>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<Activity>(b =>
        {
            b.ToTable(t =>
            {
                t.HasCheckConstraint("CK_Activities_Duration", "\"DurationSeconds\" > 0");
                t.HasCheckConstraint("CK_Activities_Type", "\"Type\" IN ('Running', 'Strength', 'Walking', 'Cycling', 'Hiking', 'Other')");
                t.HasCheckConstraint("CK_Activities_Subtype", "[ActivitySubtype] IS NULL OR ([Type] = 'Other' AND LEN(LTRIM(RTRIM([ActivitySubtype]))) > 0)");
                t.HasCheckConstraint("CK_Activities_Subjective", "\"Mood\" BETWEEN 1 AND 5 AND \"Energy\" BETWEEN 1 AND 5 AND \"Rpe\" BETWEEN 1 AND 10");
            });
            b.ToTable(t => t.HasCheckConstraint("CK_Activities_RawPayload", "[RawPayload] IS NULL OR ISJSON([RawPayload], VALUE) = 1"));
            b.HasIndex(x => x.Date);
            b.Property(x => x.ActivitySubtype).HasMaxLength(200);
            b.Property(x => x.Type).HasConversion<string>().HasMaxLength(20).UseCollation("Latin1_General_100_BIN2");
            b.Property(x => x.RawPayload).HasColumnType("nvarchar(max)")
                .HasConversion(v => v == null ? null : v.RootElement.GetRawText(),
                    v => v == null ? null : JsonDocument.Parse(v, default(JsonDocumentOptions)))
                .Metadata.SetValueComparer(new ValueComparer<JsonDocument?>(
                    (a, c) => (a == null ? null : a.RootElement.GetRawText()) == (c == null ? null : c.RootElement.GetRawText()),
                    v => v == null ? 0 : v.RootElement.GetRawText().GetHashCode(),
                    v => v == null ? null : JsonDocument.Parse(v.RootElement.GetRawText(), default(JsonDocumentOptions))));
            b.HasOne(x => x.Running).WithOne().HasForeignKey<RunningDetails>(x => x.ActivityId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(x => x.Walking).WithOne().HasForeignKey<WalkingDetails>(x => x.ActivityId).OnDelete(DeleteBehavior.Cascade);
            b.HasMany(x => x.Exercises).WithOne().HasForeignKey(x => x.ActivityId).OnDelete(DeleteBehavior.Cascade);
        });
        model.Entity<RunningDetails>(b =>
        {
            b.ToTable(t =>
            {
                // All optional numeric metrics must be finite. Elevation may be negative.
                foreach (var property in typeof(RunningDetails).GetProperties())
                {
                    var column = $"\"{property.Name}\"";
                    if (property.PropertyType == typeof(int?))
                        t.HasCheckConstraint($"CK_RunningDetails_{property.Name}", $"{column} >= 0");
                    if (property.PropertyType == typeof(double?))
                    {
                        // SQL Server float rejects NaN and infinities natively. Altitude can be negative.
                        if (property.Name is not ("MinElevationMeters" or "MaxElevationMeters"))
                            t.HasCheckConstraint($"CK_RunningDetails_{property.Name}", $"{column} >= 0");
                    }
                }
                t.HasCheckConstraint("CK_RunningDetails_HeartRate", "\"AverageHeartRate\" > 0 AND \"MaxHeartRate\" > 0 AND \"RecoveryHeartRate\" > 0 AND \"AverageHeartRate\" <= \"MaxHeartRate\"");
                t.HasCheckConstraint("CK_RunningDetails_Pace", "\"AveragePaceSecondsPerKm\" > 0 AND \"MovingPaceSecondsPerKm\" > 0 AND \"BestPaceSecondsPerKm\" > 0");
                t.HasCheckConstraint("CK_RunningDetails_Power", "\"AveragePowerWatts\" <= \"MaxPowerWatts\"");
                t.HasCheckConstraint("CK_RunningDetails_Cadence", "\"AverageCadence\" <= \"MaxCadence\"");
                t.HasCheckConstraint("CK_RunningDetails_Elevation", "\"MinElevationMeters\" <= \"MaxElevationMeters\"");
                t.HasCheckConstraint("CK_RunningDetails_Calories", "\"ActiveCalories\" <= \"TotalCalories\"");
                t.HasCheckConstraint("CK_RunningDetails_TrainingEffect", "\"AerobicTrainingEffect\" <= 5 AND \"AnaerobicTrainingEffect\" <= 5");
                t.HasCheckConstraint("CK_RunningDetails_Durations", "\"TotalDurationSeconds\" > 0 AND \"MovingDurationSeconds\" <= \"TotalDurationSeconds\" AND CAST(COALESCE(\"RunningDurationSeconds\", 0) AS bigint) + CAST(COALESCE(\"WalkingDurationSeconds\", 0) AS bigint) <= \"TotalDurationSeconds\"");
            });
            b.HasKey(x => x.ActivityId);
            b.HasMany(x => x.Laps).WithOne().HasForeignKey(x => x.ActivityId).OnDelete(DeleteBehavior.Cascade);
        });
        model.Entity<WalkingDetails>(b =>
        {
            b.HasKey(x => x.ActivityId);
            b.ToTable(t =>
            {
                foreach (var property in typeof(WalkingDetails).GetProperties())
                {
                    if ((property.PropertyType == typeof(int?) || property.PropertyType == typeof(double?)) &&
                        property.Name is not ("MinElevationMeters" or "MaxElevationMeters"))
                        t.HasCheckConstraint($"CK_WalkingDetails_{property.Name}", $"[{property.Name}] >= 0");
                }
                // SQL Server float rejects NaN/Infinity; null means unavailable.
                t.HasCheckConstraint("CK_WalkingDetails_HeartRate", "[AverageHeartRate] > 0 AND [MaxHeartRate] > 0 AND [RecoveryHeartRate] > 0 AND [AverageHeartRate] <= [MaxHeartRate]");
                t.HasCheckConstraint("CK_WalkingDetails_Pace", "[AveragePaceSecondsPerKm] > 0 AND [MovingPaceSecondsPerKm] > 0 AND [BestPaceSecondsPerKm] > 0");
                t.HasCheckConstraint("CK_WalkingDetails_Cadence", "[AverageCadence] <= [MaxCadence]");
                t.HasCheckConstraint("CK_WalkingDetails_Elevation", "[MinElevationMeters] <= [MaxElevationMeters]");
                t.HasCheckConstraint("CK_WalkingDetails_Calories", "[ActiveCalories] <= [TotalCalories]");
                t.HasCheckConstraint("CK_WalkingDetails_TrainingEffect", "[AerobicTrainingEffect] <= 5 AND [AnaerobicTrainingEffect] <= 5");
                t.HasCheckConstraint("CK_WalkingDetails_Durations", "[TotalDurationSeconds] > 0 AND [MovingDurationSeconds] <= [TotalDurationSeconds]");
            });
        });
        model.Entity<RunningLap>(b =>
        {
            b.HasKey(x => new { x.ActivityId, x.LapNumber });
            b.ToTable(t =>
            {
                t.HasCheckConstraint("CK_RunningLap_Values", "\"LapNumber\" > 0 AND \"DurationSeconds\" > 0 AND \"DistanceKm\" > 0 AND \"AveragePaceSecondsPerKm\" > 0");
                t.HasCheckConstraint("CK_RunningLap_HasMeasurement", "\"DistanceKm\" IS NOT NULL OR \"DurationSeconds\" IS NOT NULL");
            });
        });
        model.Entity<StrengthExercise>(b =>
        {
            b.ToTable(t => t.HasCheckConstraint("CK_StrengthExercise_Values", "LEN(LTRIM(RTRIM(\"ExerciseName\"))) > 0 AND \"Order\" >= 0"));
            b.Property(x => x.ExerciseName).HasMaxLength(200);
            b.HasIndex(x => new { x.ActivityId, x.Order }).IsUnique();
            b.HasMany(x => x.Sets).WithOne().HasForeignKey(x => x.StrengthExerciseId).OnDelete(DeleteBehavior.Cascade);
        });
        model.Entity<StrengthSet>().Property(x => x.Side).HasConversion<string>().HasMaxLength(10).UseCollation("Latin1_General_100_BIN2");
        model.Entity<StrengthSet>().HasIndex(x => new { x.StrengthExerciseId, x.SetNumber }).IsUnique();
        model.Entity<StrengthSet>().ToTable(t =>
        {
            t.HasCheckConstraint("CK_StrengthSet_Values", "\"SetNumber\" > 0 AND \"Reps\" >= 0 AND \"DurationSeconds\" > 0 AND \"WeightKg\" >= 0 AND \"Side\" IN ('Left', 'Right', 'Both')");
            t.HasCheckConstraint("CK_StrengthSet_HasWork", "\"Reps\" > 0 OR COALESCE(\"DurationSeconds\", 0) > 0");
        });
        model.Entity<BodyMeasurement>().HasIndex(x => x.Date);
        model.Entity<BodyMeasurement>().ToTable(t =>
        {
            t.HasCheckConstraint("CK_BodyMeasurement_Weight", "\"WeightKg\" > 0");
            t.HasCheckConstraint("CK_BodyMeasurement_BodyFat", "\"BodyFatPercentage\" BETWEEN 0 AND 100");
        });
        model.Entity<SeedHistory>(b =>
        {
            b.HasKey(x => x.Name);
            b.Property(x => x.Name).HasMaxLength(100);
        });
        // SQL datetime2 has no timezone marker: these domain timestamps are always UTC.
        var utc = new ValueConverter<DateTime, DateTime>(v => v, v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
        foreach (var entity in model.Model.GetEntityTypes())
            foreach (var property in entity.GetProperties())
                if (property.ClrType == typeof(DateTime))
                {
                    property.SetColumnType("datetime2(7)");
                    property.SetValueConverter(utc);
                }

    }
}
