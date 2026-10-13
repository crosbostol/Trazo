using System.Text.Json;
using System.ComponentModel.DataAnnotations.Schema;

namespace Progress.Api.Models;

public enum ActivityType { Running, Strength, Walking, Cycling, Hiking, Other }
public enum SetSide { Left, Right, Both }

public class Activity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateOnly Date { get; set; }
    public ActivityType Type { get; set; }
    public string? ActivitySubtype { get; set; }
    public int DurationSeconds { get; set; }
    public string? Notes { get; set; }
    public int? Mood { get; set; }
    public int? Energy { get; set; }
    public int? Rpe { get; set; }
    public string? SubjectiveNotes { get; set; }
    public JsonDocument? RawPayload { get; set; }
    [NotMapped]
    public string? RawPayloadJson => RawPayload?.RootElement.GetRawText();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public RunningDetails? Running { get; set; }
    public WalkingDetails? Walking { get; set; }
    public List<StrengthExercise> Exercises { get; set; } = [];
}

public class RunningDetails
{
    public Guid ActivityId { get; set; }
    public double? DistanceKm { get; set; }
    public int? TotalDurationSeconds { get; set; }
    public int? MovingDurationSeconds { get; set; }
    public int? RunningDurationSeconds { get; set; }
    public int? WalkingDurationSeconds { get; set; }
    public double? AveragePaceSecondsPerKm { get; set; }
    public double? MovingPaceSecondsPerKm { get; set; }
    public double? BestPaceSecondsPerKm { get; set; }
    public int? AverageHeartRate { get; set; }
    public int? MaxHeartRate { get; set; }
    public int? RecoveryHeartRate { get; set; }
    public int? AveragePowerWatts { get; set; }
    public int? MaxPowerWatts { get; set; }
    public int? AverageCadence { get; set; }
    public int? MaxCadence { get; set; }
    public double? AverageStrideLengthMeters { get; set; }
    public double? TotalAscentMeters { get; set; }
    public double? TotalDescentMeters { get; set; }
    public double? MinElevationMeters { get; set; }
    public double? MaxElevationMeters { get; set; }
    public double? AerobicTrainingEffect { get; set; }
    public double? AnaerobicTrainingEffect { get; set; }
    public double? TrainingLoad { get; set; }
    public int? ActiveCalories { get; set; }
    public int? TotalCalories { get; set; }
    public int? EstimatedFluidLossMl { get; set; }
    public List<RunningLap> Laps { get; set; } = [];
}

public class RunningLap
{
    public Guid ActivityId { get; set; }
    public int LapNumber { get; set; }
    public double? DistanceKm { get; set; }
    public int? DurationSeconds { get; set; }
    public double? AveragePaceSecondsPerKm { get; set; }
}

public class StrengthExercise
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ActivityId { get; set; }
    public string ExerciseName { get; set; } = "";
    public int Order { get; set; }
    public List<StrengthSet> Sets { get; set; } = [];
}

public class StrengthSet
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid StrengthExerciseId { get; set; }
    public int SetNumber { get; set; }
    public int Reps { get; set; }
    public double? WeightKg { get; set; }
    public int? DurationSeconds { get; set; }
    public SetSide? Side { get; set; }
}

public class BodyMeasurement
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateOnly Date { get; set; }
    public double WeightKg { get; set; }
    public double? BodyFatPercentage { get; set; }
    public string? Notes { get; set; }
}
