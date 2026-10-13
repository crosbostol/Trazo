namespace Progress.Api.Models;

// Persists independently of activities so deleting training data cannot enable reseeding.
public class SeedHistory
{
    public string Name { get; set; } = "";
    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;
}
