namespace Progress.Api.Models;

public class WalkingDetails
{
    public Guid ActivityId { get; set; }
    public double? DistanceKm { get; set; }
    public double? AveragePaceSecondsPerKm { get; set; }
    public double? MovingPaceSecondsPerKm { get; set; }
    public double? BestPaceSecondsPerKm { get; set; }
    public double? TotalAscentMeters { get; set; }
    public double? TotalDescentMeters { get; set; }
    public double? MinElevationMeters { get; set; }
    public double? MaxElevationMeters { get; set; }
    public double? AerobicTrainingEffect { get; set; }
    public double? AnaerobicTrainingEffect { get; set; }
    public double? TrainingLoad { get; set; }
    public int? TotalDurationSeconds { get; set; }
    public int? MovingDurationSeconds { get; set; }
    public int? AverageHeartRate { get; set; }
    public int? MaxHeartRate { get; set; }
    public int? RecoveryHeartRate { get; set; }
    public int? AverageCadence { get; set; }
    public int? MaxCadence { get; set; }
    public int? Steps { get; set; }
    public int? ActiveCalories { get; set; }
    public int? TotalCalories { get; set; }
    public int? EstimatedFluidLossMl { get; set; }
}
